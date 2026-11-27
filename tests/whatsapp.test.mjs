import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash,randomUUID} from 'node:crypto';
import {createWhatsApp,canRead,phone,directJid,textMessage} from '../server/whatsapp.mjs';
const admin={id:'admin',role:'admin'},seller={id:'seller',role:'vendedor',name:'Vendedor'},other={id:'other',role:'vendedor'};
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(t){const threads=new Map(),messages=new Map(),auth=new Map(),leads=new Map();let sends=0,options,sock;
 const db={query:async(sql,v=[])=>{const result=rows=>({rows});
  if(sql.startsWith('UPDATE crm.wa_runtime'))return result([{id:1}]);
  if(sql.startsWith('SELECT encrypted_payload FROM crm.wa_auth'))return result(auth.has(v[0])?[{encrypted_payload:auth.get(v[0])}]:[]);
  if(sql.startsWith('INSERT INTO crm.wa_auth')){auth.set(v[0],v[1]);return result([]);}
  if(sql==='DELETE FROM crm.wa_auth'){auth.clear();return result([]);}
  if(sql.startsWith('INSERT INTO crm.wa_threads')){if(!threads.has(v[0]))threads.set(v[0],{id:v[0],encrypted_payload:v[1],owner_id:null,updated_at:new Date()});return result([]);}
  if(sql.startsWith('INSERT INTO crm.wa_messages')){if(messages.has(v[0]))return result([]);messages.set(v[0],{id:v[0],thread_id:v[1],encrypted_payload:v[2],direction:sql.includes("'in'")?'in':'out',status:sql.includes("'in'")?'received':'pending',created_at:new Date()});return result([{id:v[0]}]);}
  if(sql==='SELECT * FROM crm.wa_threads ORDER BY id FOR UPDATE')return result([...threads.values()]);
  if(sql.startsWith('SELECT id FROM crm.wa_threads WHERE id'))return result(threads.has(v[0])?[{id:v[0]}]:[]);
  if(sql.startsWith('UPDATE crm.wa_threads SET lead_id=')){Object.assign(threads.get(v[0]),{lead_id:v[1],owner_id:v[2]});return result([]);}
  if(sql.startsWith('UPDATE crm.wa_threads SET owner_id=')){Object.assign(threads.get(v[0]),{owner_id:v[1],lead_id:v[2]});return result([]);}
  if(sql.startsWith('SELECT id,name,username,role FROM crm.users'))return result([{id:v[0],name:v[0],username:v[0],role:'vendedor'}]);
  if(sql.startsWith('SELECT id,name,username FROM crm.users'))return result([seller,other]);
  if(sql.startsWith('SELECT * FROM crm.wa_threads WHERE id'))return result(threads.has(v[0])?[threads.get(v[0])]:[]);
  if(sql.startsWith('SELECT * FROM crm.wa_threads WHERE ('))return result([...threads.values()].filter(r=>v[0]||r.owner_id===v[1]));
  if(sql.startsWith('SELECT * FROM crm.wa_messages'))return result([...messages.values()].filter(r=>r.thread_id===v[0]).reverse());
  if(sql.startsWith('SELECT thread_id,status'))return result(messages.has(v[0])?[messages.get(v[0])]:[]);
  if(sql.startsWith('UPDATE crm.wa_threads SET updated_at'))return result([]);
  if(sql.startsWith('UPDATE crm.wa_messages SET status=')){messages.get(v[0]).status=sql.includes("'sent'")?'sent':'unknown';return result([]);}
  throw Error('Unexpected query: '+sql);
 }};
 const wa=createWhatsApp({db,transaction:fn=>fn(db),seal:async(b,k,p)=>structuredClone(p),unseal:async(b,k,p)=>structuredClone(p),linkLead:async(c,t,meta,owner)=>{const lead=leads.get(meta.phone)||{id:'lead-'+t.id,ownerId:t.owner_id||null};if(owner)lead.ownerId=owner.id;leads.set(meta.phone,lead);return lead;},makeSocket:opts=>{options=opts;sock={ev:new EventEmitter(),user:{id:'50212345678:1@s.whatsapp.net'},end(){},sendMessage:async()=>{sends++;return {key:{id:'test'}}}};return sock;},qrImage:async()=> 'data:image/png;base64,TEST'});
 t.after(()=>wa.close());
 const call=async(route,user=admin,method='GET',input={})=>{let data,code;await wa.handle({method,url:'/api/zip/whatsapp/'+route},{writeHead(c){code=c},end(b){data=JSON.parse(b)}},user,'/api/zip/whatsapp/'+route.split('?')[0],input);return {code,data};};
 return {wa,threads,messages,auth,leads,call,get sock(){return sock},get options(){return options},get sends(){return sends}};
}
test('shared Inbox is internal only, with phone normalization',()=>{assert.equal(canRead(seller,{owner_id:'other'}),true);assert.equal(canRead(seller,{owner_id:null}),true);assert.equal(canRead({role:'freelance'},{owner_id:'other'}),false);assert.equal(canRead(null,{}),false);assert.equal(canRead(admin,{owner_id:null}),true);assert.equal(phone('+502 1234-5678'),'50212345678');assert.equal(phone('12345678'),'50212345678');assert.equal(directJid('123@g.us'),false);assert.equal(directJid('50212345678@s.whatsapp.net'),true);});
test('wrapped messages and attachments have honest text representations',()=>{assert.equal(textMessage({ephemeralMessage:{message:{conversation:'Hola'}}}),'Hola');assert.match(textMessage({imageMessage:{}}),/consultar en el teléfono/);});
test('QR and connection controls require manager; ordinary status never exposes QR or credentials',async t=>{const f=fixture(t);await assert.rejects(f.call('connect',seller,'POST'),{status:403});await assert.rejects(f.call('qr',seller),{status:403});await assert.rejects(f.call('threads',{role:'freelance'}),{status:403});await f.wa.start();f.sock.ev.emit('connection.update',{qr:'SECRET-QR'});assert.equal((await f.call('qr')).data.image,'data:image/png;base64,TEST');const s=(await f.call('status',seller)).data;assert.equal(s.phase,'qr');assert.ok(!JSON.stringify(s).includes('SECRET'));});
test('incoming replay deduplicates and never imports groups, status, or own echoes',async t=>{const f=fixture(t),m={key:{id:'one',remoteJid:'50212345678@s.whatsapp.net'},pushName:'Cliente',message:{conversation:'Hola'}};await f.wa.ingest(m,{});await f.wa.ingest(m,{});await f.wa.ingest({...m,key:{...m.key,id:'group',remoteJid:'1@g.us'}},{});await f.wa.ingest({...m,key:{...m.key,id:'echo',fromMe:true}},{});assert.equal(f.threads.size,1);assert.equal(f.messages.size,1);assert.equal((await f.call('threads',seller)).data.threads.length,1);assert.equal(f.leads.size,1);assert.equal((await f.call('threads')).data.threads.length,1);});
test('team can read shared messages, but freelancers cannot',async t=>{const f=fixture(t);const id=hash('50212345678@s.whatsapp.net');f.threads.set(id,{id,owner_id:seller.id,encrypted_payload:{jid:'50212345678@s.whatsapp.net'}});assert.equal((await f.call('messages?thread='+id,other)).code,200);await assert.rejects(f.call('messages?thread='+id,{role:'freelance'}),{status:403});});
test('only a connected, assigned thread sends; same request ID never sends twice',async t=>{const f=fixture(t);await f.wa.start();f.sock.ev.emit('connection.update',{connection:'open'});const id=hash('50212345678@s.whatsapp.net');f.threads.set(id,{id,owner_id:null,encrypted_payload:{jid:'50212345678@s.whatsapp.net'}});const input={thread:id,text:'Cotización disponible',requestId:randomUUID()};await assert.rejects(f.call('send',admin,'POST',input),/Asigná/);f.threads.get(id).owner_id=seller.id;assert.equal((await f.call('send',seller,'POST',input)).data.status,'sent');assert.equal((await f.call('send',seller,'POST',input)).data.status,'sent');assert.equal(f.sends,1);});
test('authentication keys preserve binary data and disconnect hides QR',async t=>{const f=fixture(t);await f.wa.start();await f.options.auth.keys.set({'test-key':{one:Buffer.from([1,2,3])}});const read=await f.options.auth.keys.get('test-key',['one']);assert.deepEqual(read.one,Buffer.from([1,2,3]));f.sock.ev.emit('connection.update',{qr:'secret'});await f.call('disconnect',admin,'POST');assert.equal((await f.call('qr')).data.image,null);assert.equal((await f.call('status')).data.phase,'disconnected');});

test('unassigned incoming conversation creates a lead immediately and backfill is idempotent',async t=>{const f=fixture(t);await f.wa.ingest({key:{id:'auto',remoteJid:'50212345678@s.whatsapp.net'},message:{conversation:'Precio'}},{});const thread=[...f.threads.values()][0];assert.ok(thread.lead_id);assert.equal(thread.owner_id,null);assert.equal(f.leads.size,1);await f.wa.backfill();assert.equal(f.leads.size,1);assert.equal((await f.call('threads',other)).data.threads[0].leadId,thread.lead_id);});
test('claim assigns lead and another seller cannot steal it',async t=>{const f=fixture(t);await f.wa.ingest({key:{id:'claim',remoteJid:'50212345678@s.whatsapp.net'},message:{conversation:'Hola'}},{});const id=[...f.threads.keys()][0];await f.call('claim',seller,'POST',{thread:id});assert.equal(f.threads.get(id).owner_id,seller.id);assert.equal([...f.leads.values()][0].ownerId,seller.id);await assert.rejects(f.call('claim',other,'POST',{thread:id}),{status:409});assert.equal((await f.call('threads',other)).data.threads.length,1);await assert.rejects(f.call('assign',other,'POST',{thread:id,ownerId:other.id}),{status:403});});
