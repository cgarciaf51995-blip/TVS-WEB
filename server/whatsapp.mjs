import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const runtimeRequire=createRequire(new URL('../whatsapp-runtime/package.json',import.meta.url));
const {default:makeWASocket,initAuthCreds,BufferJSON,proto,normalizeMessageContent,DisconnectReason}=await import(runtimeRequire.resolve('@whiskeysockets/baileys'));
const {default:QRCode}=await import(runtimeRequire.resolve('qrcode'));
const {default:pino}=await import(runtimeRequire.resolve('pino'));
const hash=x=>createHash('sha256').update(x).digest('hex');
const fault=(message,status=400)=>Object.assign(Error(message),{status});
export const isManager=u=>['admin','gerencia'].includes(u?.role);
export const canRead=(u,t)=>!!u&&['admin','gerencia','vendedor'].includes(u.role);
export function phone(value){const p=String(value||'').replace(/\D/g,'');return p.length===8?'502'+p:p;}
export function directJid(jid){return /^\d{8,15}@s\.whatsapp\.net$/.test(jid||'');}
export function textMessage(message){const m=normalizeMessageContent(message);return String(m?.conversation||m?.extendedTextMessage?.text||m?.imageMessage?.caption||m?.videoMessage?.caption||(m?'[Archivo o mensaje no textual: consultar en el teléfono]':'')).slice(0,12000);}
const serialize=v=>JSON.parse(JSON.stringify(v,BufferJSON.replacer));
const restore=v=>JSON.parse(JSON.stringify(v),BufferJSON.reviver);
export function createWhatsApp({db,seal,unseal,transaction,linkLead,env=process.env,makeSocket=makeWASocket,qrImage=q=>QRCode.toDataURL(q,{width:280,margin:2})}){
 let socket=null,starting=null,qr=null,qrUntil=0,phase='disconnected',note='',timer,heartbeat,stopped=false,generation=0;
 const runtime=randomUUID(),rate=new Map();let events=Promise.resolve(),authWrites=Promise.resolve();
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const authGet=async key=>{const r=(await db.query('SELECT encrypted_payload FROM crm.wa_auth WHERE key=$1',[key])).rows[0];return r?restore(await unseal('wa-auth',key,r.encrypted_payload)):undefined;};
 const authSet=async(key,value)=>{await db.query('INSERT INTO crm.wa_auth(key,encrypted_payload) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET encrypted_payload=EXCLUDED.encrypted_payload',[key,await seal('wa-auth',key,serialize(value))]);};
 function enqueueAuth(fn){const work=authWrites.then(fn);authWrites=work.catch(()=>{note='No se pudo guardar la sesión. Reconectá desde administración.';phase='error';socket?.end(Error('auth storage failed'));});return work;}
 function dispose(){clearTimeout(timer);clearInterval(heartbeat);qr=null;qrUntil=0;const old=socket;socket=null;old?.end(Error('CRM connection stopped'));}
 async function start(){
  if(starting)return starting;if(socket&&['connecting','qr','connected'].includes(phase))return;
  starting=(async()=>{
   stopped=false;const gen=++generation;phase='connecting';note='';
   const lease=await db.query("UPDATE crm.wa_runtime SET lease_owner=$1,lease_until=now()+interval '60 seconds' WHERE id=1 AND (lease_owner=$1 OR lease_until IS NULL OR lease_until<now()) RETURNING id",[runtime]);
   if(!lease.rows.length)throw fault('Otra instancia está usando la conexión. Esperá un minuto.',409);
   clearInterval(heartbeat);heartbeat=setInterval(async()=>{try{const r=await db.query("UPDATE crm.wa_runtime SET lease_until=now()+interval '60 seconds' WHERE id=1 AND lease_owner=$1 RETURNING id",[runtime]);if(!r.rows.length)throw Error();}catch{++generation;dispose();phase='error';note='Conexión detenida para proteger la sesión. Volvé a conectar.';}},15000);heartbeat.unref();
   await authWrites;const creds=await authGet('creds')||initAuthCreds();if(stopped||gen!==generation)return;
   const keys={get:async(type,ids)=>{await authWrites;const out={};for(const id of ids){let v=await authGet('key:'+type+':'+id);if(type==='app-state-sync-key'&&v)v=proto.Message.AppStateSyncKeyData.fromObject(v);out[id]=v;}return out;},set:data=>enqueueAuth(()=>transaction(async c=>{for(const [type,items] of Object.entries(data))for(const [id,value] of Object.entries(items)){const key='key:'+type+':'+id;if(value===null)await c.query('DELETE FROM crm.wa_auth WHERE key=$1',[key]);else await c.query('INSERT INTO crm.wa_auth(key,encrypted_payload) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET encrypted_payload=EXCLUDED.encrypted_payload',[key,await seal('wa-auth',key,serialize(value))]);}}))};
   const sock=makeSocket({auth:{creds,keys},logger:pino({level:'silent'}),markOnlineOnConnect:false,syncFullHistory:false,getMessage:async key=>{const r=(await db.query('SELECT id,encrypted_payload FROM crm.wa_messages WHERE id=$1',['out:'+key.id])).rows[0];if(r){const p=await unseal('wa-message',r.id,r.encrypted_payload);return {conversation:p.text};}return undefined;},shouldIgnoreJid:jid=>!directJid(jid)&&!/^\d+@lid$/.test(jid)});socket=sock;
   sock.ev.on('creds.update',()=>{if(gen===generation)void enqueueAuth(()=>authSet('creds',creds));});
   sock.ev.on('connection.update',u=>{if(gen!==generation)return;
    if(u.qr){qr=u.qr;qrUntil=Date.now()+55000;phase='qr';}
    if(u.connection==='open'){qr=null;phase='connected';note='';void enqueueAuth(()=>authSet('enabled',true));}
    if(u.connection==='close'){qr=null;socket=null;clearInterval(heartbeat);const code=u.lastDisconnect?.error?.output?.statusCode;
     phase=code===DisconnectReason.loggedOut?'logged_out':'disconnected';
     if(code===DisconnectReason.loggedOut){note='WhatsApp cerró la sesión. Desvinculá y conectá nuevamente.';void enqueueAuth(()=>authSet('enabled',false));}
     else if(!stopped){clearTimeout(timer);timer=setTimeout(()=>{void start().catch(()=>{phase='error';note='No se pudo reconectar. Intentá desde administración.';});},5000);timer.unref();}
    }
   });
   sock.ev.on('messages.upsert',batch=>{if(gen!==generation||batch.type!=='notify')return;events=events.then(async()=>{for(const m of batch.messages||[]){if(gen!==generation||stopped)return;await ingest(m,sock);}}).catch(()=>{note='No se pudo guardar un mensaje. Revisá la conexión a la base de datos.';console.error('WHATSAPP_MESSAGE_STORAGE_FAILED');});});
  })().catch(e=>{dispose();phase='error';throw e;}).finally(()=>{starting=null;});return starting;
 }
 async function ingest(m,sock){
  if(!m.key?.id||m.key.fromMe||!m.message)return;
  let jid=m.key.remoteJidAlt||m.key.remoteJid;
  if(!directJid(jid)&&/^\d+@lid$/.test(m.key.remoteJid||''))jid=await sock.signalRepository?.lidMapping?.getPNForLID(m.key.remoteJid);
  if(!directJid(jid))return;const text=textMessage(m.message);if(!text)return;
  const id='in:'+hash(jid+':'+m.key.id),thread=hash(jid),meta={jid,phone:jid.split('@')[0],name:String(m.pushName||jid.split('@')[0]).slice(0,100)};
  await transaction(async c=>{
   await c.query('INSERT INTO crm.wa_threads(id,encrypted_payload) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[thread,await seal('wa-thread',thread,meta)]);
   const r=await c.query("INSERT INTO crm.wa_messages(id,thread_id,direction,status,encrypted_payload) VALUES($1,$2,'in','received',$3) ON CONFLICT(id) DO NOTHING RETURNING id",[id,thread,await seal('wa-message',id,{text,at:new Date().toISOString()})]);
   await c.query('SELECT id FROM crm.wa_threads WHERE id=$1 FOR UPDATE',[thread]);
   const current=(await c.query('SELECT * FROM crm.wa_threads WHERE id=$1',[thread])).rows[0];
   const linked=await linkLead(c,current,meta,null);
   await c.query('UPDATE crm.wa_threads SET lead_id=$2,owner_id=$3 WHERE id=$1',[thread,linked.id,linked.ownerId]);
   if(r.rows.length)await c.query('UPDATE crm.wa_threads SET updated_at=now() WHERE id=$1',[thread]);
  });
 }
 async function thread(id,u,c=db){if(!/^[a-f0-9]{64}$/.test(id||''))throw fault('Conversación inválida.');const t=(await c.query('SELECT * FROM crm.wa_threads WHERE id=$1',[id])).rows[0];if(!t||!canRead(u,t))throw fault('Conversación no disponible.',404);return t;}
 async function disconnect(){stopped=true;++generation;dispose();if(starting)await starting.catch(()=>{});await authWrites;await authSet('enabled',false);phase='disconnected';await db.query('UPDATE crm.wa_runtime SET lease_until=now(),lease_owner=NULL WHERE id=1 AND lease_owner=$1',[runtime]);}
 async function close(){stopped=true;++generation;dispose();if(starting)await starting.catch(()=>{});await events;await authWrites;await db.query('UPDATE crm.wa_runtime SET lease_until=now(),lease_owner=NULL WHERE id=1 AND lease_owner=$1',[runtime]);}
 async function backfill(){await transaction(async c=>{const rows=(await c.query('SELECT * FROM crm.wa_threads ORDER BY id FOR UPDATE')).rows;for(const t of rows){const meta=await unseal('wa-thread',t.id,t.encrypted_payload);const linked=await linkLead(c,t,meta,null);await c.query('UPDATE crm.wa_threads SET lead_id=$2,owner_id=$3 WHERE id=$1',[t.id,linked.id,linked.ownerId]);}});}
 async function boot(){try{await backfill();}catch{note='No se pudieron enlazar todas las conversaciones con el CRM.';}try{if(await authGet('enabled'))await start();}catch{phase='error';note='WhatsApp pendiente de configuración o de reconexión.';}}
 async function handle(req,res,u,path,input){
  if(!path.startsWith('/api/zip/whatsapp/'))return false;
  if(!u||!['admin','gerencia','vendedor'].includes(u.role))throw fault('Acceso no permitido.',403);
  const route=path.slice('/api/zip/whatsapp/'.length),method=req.method;
  if(route==='status'&&method==='GET'){json(res,200,{phase,note,manager:isManager(u),canClaim:u.role==='vendedor',number:phase==='connected'?String(socket?.user?.id||'').split(':')[0].split('@')[0]:null});return true;}
  if(['connect','disconnect','qr','assign','unlink'].includes(route)&&!isManager(u))throw fault('Esta acción requiere Administración o Gerencia.',403);
  if(route==='connect'&&method==='POST'){await start();json(res,200,{phase});return true;}
  if(route==='disconnect'&&method==='POST'){await disconnect();json(res,200,{phase});return true;}
  if(route==='unlink'&&method==='POST'){if(socket&&phase==='connected'){try{await socket.logout();}catch{throw fault('No se pudo cerrar la vinculación. Desconectala desde Dispositivos vinculados en el teléfono.',503);}}await disconnect();await db.query('DELETE FROM crm.wa_auth');json(res,200,{phase});return true;}
  if(route==='qr'&&method==='GET'){json(res,200,{image:qr&&qrUntil>Date.now()?await qrImage(qr):null,expiresAt:qrUntil,phase});return true;}
  if(route==='users'&&method==='GET'){json(res,200,{users:(await db.query("SELECT id,name,username FROM crm.users WHERE active AND role='vendedor' ORDER BY name")).rows});return true;}
  if(route==='threads'&&method==='GET'){const r=await db.query('SELECT * FROM crm.wa_threads WHERE ($1::boolean OR owner_id=$2) ORDER BY updated_at DESC LIMIT 200',[canRead(u,{}),u.id]);const out=[];for(const t of r.rows)out.push({id:t.id,ownerId:t.owner_id,leadId:t.lead_id,updatedAt:t.updated_at,...await unseal('wa-thread',t.id,t.encrypted_payload)});json(res,200,{threads:out.map(({jid,...t})=>t)});return true;}
  if(route==='messages'&&method==='GET'){const id=new URL(req.url,'http://localhost').searchParams.get('thread');await thread(id,u);const rows=(await db.query('SELECT * FROM crm.wa_messages WHERE thread_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[id])).rows;const out=[];for(const m of rows.reverse())out.push({id:m.id,direction:m.direction,status:m.status,createdAt:m.created_at,...await unseal('wa-message',m.id,m.encrypted_payload)});json(res,200,{messages:out});return true;}
  if(['assign','claim'].includes(route)&&method==='POST'){
   if(route==='claim'&&u.role!=='vendedor')throw fault('Solo un vendedor puede tomar una conversación.',403);
   await transaction(async c=>{const initial=await thread(input.thread,u,c);await c.query('SELECT id FROM crm.wa_threads WHERE id=$1 FOR UPDATE',[initial.id]);const t=await thread(input.thread,u,c);if(route==='claim'&&t.owner_id&&t.owner_id!==u.id)throw fault('Otro vendedor ya tomó esta conversación. Actualizá la bandeja.',409);const owner=(await c.query("SELECT id,name,username,role FROM crm.users WHERE id=$1 AND active AND role='vendedor'",[route==='claim'?u.id:input.ownerId])).rows[0];if(!owner)throw fault('Elegí un vendedor activo.');const meta=await unseal('wa-thread',t.id,t.encrypted_payload);const lead=await linkLead(c,t,meta,owner);await c.query('UPDATE crm.wa_threads SET owner_id=$2,lead_id=$3 WHERE id=$1',[t.id,owner.id,lead.id]);});json(res,200,{ok:true});return true;
  }
  if(route==='send'&&method==='POST'){
   const text=String(input.text||'').trim();if(!text||text.length>4000)throw fault('Escribí un mensaje de hasta 4000 caracteres.');if(!/^[a-f0-9-]{36}$/.test(input.requestId||''))throw fault('Identificador de envío inválido.');
   const t=await thread(input.thread,u);if(!t.owner_id)throw fault('Asigná primero la conversación a un vendedor.');
   const id='out:'+input.requestId,existing=(await db.query('SELECT thread_id,status FROM crm.wa_messages WHERE id=$1',[id])).rows[0];
   if(existing){if(existing.thread_id!==t.id)throw fault('Identificador ya utilizado.',409);json(res,200,{status:existing.status});return true;}
   if(phase!=='connected'||!socket)throw fault('WhatsApp está desconectado.',503);
   const now=Date.now(),prev=rate.get(u.id)||[];const recent=prev.filter(x=>x>now-60000);if(recent.length>=20)throw fault('Esperá un minuto antes de enviar más mensajes.',429);recent.push(now);rate.set(u.id,recent);
   const meta=await unseal('wa-thread',t.id,t.encrypted_payload);if(!directJid(meta.jid))throw fault('Número no disponible.');
   const insert=await db.query("INSERT INTO crm.wa_messages(id,thread_id,direction,status,encrypted_payload) VALUES($1,$2,'out','pending',$3) ON CONFLICT(id) DO NOTHING RETURNING id",[id,t.id,await seal('wa-message',id,{text,at:new Date().toISOString(),sender:u.name})]);
   if(!insert.rows.length){json(res,200,{status:'pending'});return true;}
   try{await Promise.race([socket.sendMessage(meta.jid,{text},{messageId:input.requestId}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('timeout')),20000);t.unref();})]);await db.query("UPDATE crm.wa_messages SET status='sent' WHERE id=$1",[id]);await db.query('UPDATE crm.wa_threads SET updated_at=now() WHERE id=$1',[t.id]);json(res,200,{status:'sent'});}
   catch{await db.query("UPDATE crm.wa_messages SET status='unknown' WHERE id=$1",[id]);json(res,202,{status:'unknown',message:'No se pudo confirmar el envío. Revisá WhatsApp antes de repetirlo.'});}return true;
  }
  throw fault('Ruta de WhatsApp no encontrada.',404);
 }
 return {handle,start,boot,close,ingest,backfill};
}
