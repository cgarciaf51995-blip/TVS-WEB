import {createHash,createHmac,randomBytes,scrypt as scryptCb,timingSafeEqual,createCipheriv,createDecipheriv} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const scrypt=promisify(scryptCb);
const digest=x=>createHash('sha256').update(x).digest('hex');
const roles=new Set(['admin','gerencia','vendedor','freelance']);
const manager=u=>u&&['admin','gerencia'].includes(u.role);
const problem=(message,status=400)=>Object.assign(new Error(message),{status});
const publicKeys=new Set(['tvsCatalog','tvs_SiteSettings','tvsSiteSettings','tvs_DesignSettings','tvs_PrequalConfig','tvsWhatsapp','tvs_Whatsapp','freelanceProgramConfig']);
const privateKeys=new Set(['tvs_AIConfig','tvsFreelanceAnalyticsOverrides']);
const personalKeys=new Set(['tvs_motoKommoSettings']);
const stageKeys=new Set(['tvs_motoKommoStages']);
export const collections=Object.freeze({
 tvs_FreelanceReferrals:'referrals',tvsFreelanceReferrals:'referrals',
 tvsGerenciaPaperwork:'paperwork',tvsFreelanceAccounts:'applications',
 gysFreelanceDocumentRequestsV2:'requests',gysFreelanceDocumentFilesV2:'filemeta',
 gysPublishingMaterialsV2:'materials',tvs_motoKommoLeads:'leads',tvsPortalUsers:'users'
});
const canonical=Object.fromEntries(Object.entries(collections).filter(([k])=>k!=='tvsFreelanceReferrals').map(([k,v])=>[v,k]));
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});res.end(JSON.stringify(data));};
const cleanId=x=>{const s=String(x??'');if(!/^[\w.-]{1,150}$/.test(s))throw problem('Identificador inválido.');return s;};
const rowId=p=>cleanId(p.id??p.code??p.username);
const uuid=x=>{if(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(x))return x;const h=digest('tvs-zip-user:'+x);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const safePayload=p=>{if(!p||typeof p!=='object'||Array.isArray(p))throw problem('Registro inválido.');const r={...p};delete r.password;delete r.password_hash;delete r.secret_hash;return r;};
const text=(v,max=200)=>String(v??'').trim().slice(0,max);
export function recordVisible(bucket,row,user){return !!user&&(manager(user)||row.owner_id===user.id||bucket==='materials'||(bucket==='requests'&&row.owner_id===null&&row.payload.allFreelancers===true));}
export function validateOwnerEdit(bucket,previous,next,user){
 if(manager(user))return;
 if(bucket==='referrals'){
  if(!['Pendiente','En proceso','Contactado'].includes(next.status||'Pendiente'))throw problem('Este estado requiere validación de Gerencia.',403);
  const protectedKeys=['freelance','freelanceCode','freelanceName','owner','ownerUser','commission','commissionAmount','commissionPaid','saleAmount','approvedAt','paidAt'];
  for(const k of protectedKeys)if(previous&&JSON.stringify(previous[k])!==JSON.stringify(next[k]))throw problem('Este cambio requiere Gerencia.',403);
 }
 if(bucket==='requests'){
  if(!previous)throw problem('Solo Gerencia puede solicitar papelería.',403);
  if(JSON.stringify({...next,status:previous.status,updatedAt:previous.updatedAt})!==JSON.stringify(previous)||next.status!=='Enviado')throw problem('Solo puedes enviar tu papelería.',403);
 }
 if(['paperwork','applications','materials'].includes(bucket))throw problem('Esta operación requiere Gerencia.',403);
}
export const integrationSecretFields=new Set(['metaAppSecret','metaAccessToken','metaVerifyToken','pageAccessToken','openaiApiKey','databaseUrl']);
export function splitIntegrationSettings(value){
 const config=JSON.parse(value),secrets={};
 config.integrations={...(config.integrations||{})};
 for(const k of integrationSecretFields){if(config.integrations[k])secrets[k]=String(config.integrations[k]);delete config.integrations[k];}
 return {config,secrets};
}
async function rawBody(req,limit){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>limit)throw problem('El archivo o formulario supera el tamaño permitido.',413);chunks.push(c);}return Buffer.concat(chunks);}
async function body(req){try{return JSON.parse((await rawBody(req,12*1024*1024)).toString('utf8'));}catch(e){if(e.status)throw e;throw problem('Formulario inválido.');}}
async function hashPassword(p){if(typeof p!=='string'||p.length<16||p.length>200)throw problem('La contraseña debe tener entre 16 y 200 caracteres.');const salt=randomBytes(16).toString('hex');const k=await scrypt(p,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return `scrypt$${salt}$${k.toString('hex')}`;}
async function matchesPassword(p,hash){const [,salt,key]=String(hash).split('$');if(!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{128}$/.test(key||''))return false;const k=await scrypt(String(p).slice(0,201),salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return timingSafeEqual(k,Buffer.from(key,'hex'));}

export function createZipDataAPI(db,{env=process.env,verifyCaptcha}={}){
 let keyPromise;
 const receipts=new Map(),attempts=new Map();
 async function key(){if(!keyPromise)keyPromise=(async()=>{const dir=resolve(env.SECURITY_DATA_DIR||'private');await mkdir(dir,{recursive:true,mode:0o700});const p=resolve(dir,'zip-data.key');try{return await readFile(p);}catch(e){if(e.code!=='ENOENT')throw e;const b=randomBytes(32);try{await writeFile(p,b,{flag:'wx',mode:0o600});return b;}catch(e){if(e.code==='EEXIST')return readFile(p);throw e;}}})();const k=await keyPromise;if(k.length!==32)throw Error('Invalid data encryption key');return k;}
 async function seal(bucket,id,value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',await key(),iv);c.setAAD(Buffer.from(bucket+':'+id));const b=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));const data=Buffer.concat([c.update(b),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]);}
 async function unseal(bucket,id,b,raw=false){const c=createDecipheriv('aes-256-gcm',await key(),b.subarray(0,12));c.setAAD(Buffer.from(bucket+':'+id));c.setAuthTag(b.subarray(12,28));const out=Buffer.concat([c.update(b.subarray(28)),c.final()]);return raw?out:JSON.parse(out.toString());}
 async function transaction(fn){const c=await db.pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async function user(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tvsCRM='))?.slice(7);if(!/^[a-f0-9]{64}$/.test(token||''))return null;const {rows}=await db.query('SELECT u.id,u.username,u.name,u.role FROM crm.sessions s JOIN crm.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active',[digest(token)]);return rows[0]&&roles.has(rows[0].role)?rows[0]:null;}
 function cookie(res,token,age){res.setHeader('Set-Cookie',`tvsCRM=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${age}; Secure`);}
 function checkOrigin(req){const base=env.PUBLIC_ORIGIN||'https://tvssancris.com';if(req.headers.origin&&req.headers.origin!==base)throw problem('Origen no permitido.',403);if(req.headers['sec-fetch-site']==='cross-site')throw problem('Origen no permitido.',403);}
 const binding=req=>digest((req.socket?.remoteAddress||'')+'|'+(req.headers['user-agent']||''));
 function limited(req,kind,max){const now=Date.now(),k=binding(req)+':'+kind,v=attempts.get(k);if(attempts.size>5000)for(const [x,v] of attempts)if(v.until<now)attempts.delete(x);if(v&&v.until>now){if(v.count>=max)throw problem('Demasiados intentos. Intenta nuevamente en unos minutos.',429);v.count++;}else attempts.set(k,{count:1,until:now+15*60000});}
 async function proof(req,action,value){const p=receipts.get(value);receipts.delete(value);if(p&&p.action===action&&p.binding===binding(req)&&p.until>Date.now())return;await verifyCaptcha('',action);}
 async function targetOwner(c,p,u){if(!manager(u))return u.id;const values=[p.freelance,p.freelanceUser,p.freelanceUsername,p.freelanceCode,p.freelanceName,p.owner,p.ownerUser].filter(Boolean).map(String);if(!values.length)return null;const {rows}=await c.query('SELECT u.id FROM crm.users u LEFT JOIN crm.freelance_profiles f ON f.user_id=u.id WHERE u.username=ANY($1::text[]) OR u.name=ANY($1::text[]) OR f.referral_code=ANY($1::text[]) LIMIT 1',[values]);return rows[0]?.id||null;}
 async function state(u){
  const values={},versions={};
  const settings=await db.query('SELECT key,value,version FROM crm.zip_settings');
  for(const r of settings.rows){let k=r.key;if(k.startsWith('user:')){if(!u||!k.startsWith('user:'+u.id+':'))continue;k=k.slice(('user:'+u.id+':').length);}else if(privateKeys.has(k)&&!manager(u))continue;else if(!publicKeys.has(k)&&!stageKeys.has(k)&&!privateKeys.has(k))continue;values[k]=r.value;versions[k]=Number(r.version);}
  if(u){
   for(const k of Object.values(canonical))values[k]='[]';
   const {rows}=await db.query('SELECT bucket,record_id,owner_id,encrypted_payload,version FROM crm.zip_records WHERE deleted_at IS NULL AND ($1::boolean OR owner_id=$2 OR bucket=\'materials\' OR (bucket=\'requests\' AND owner_id IS NULL)) ORDER BY created_at DESC',[!!manager(u),u.id]);
   const grouped={};for(const r of rows){const payload=await unseal(r.bucket,r.record_id,r.encrypted_payload);if(!recordVisible(r.bucket,{...r,payload},u))continue;(grouped[r.bucket]??=[]).push(payload);versions[r.bucket+':'+r.record_id]=Number(r.version);}
   for(const [bucket,rows] of Object.entries(grouped))if(canonical[bucket])values[canonical[bucket]]=JSON.stringify(rows);
   if(u.role==='admin'){
    const {rows}=await db.query('SELECT id,username,name,role,active,updated_at FROM crm.users ORDER BY created_at');values.tvsPortalUsers=JSON.stringify(rows.map(r=>({id:r.id,username:r.username,name:r.name,role:r.role,blocked:!r.active})));for(const r of rows)versions['users:'+r.id]=new Date(r.updated_at).getTime();
   }else values.tvsPortalUsers=JSON.stringify([{id:u.id,username:u.username,name:u.name,role:u.role,blocked:false}]);
  }
  values.tvsFreelanceReferrals=values.tvs_FreelanceReferrals||'[]';
  return {values,versions,user:u,project:'wvhzqukukzzwoevbgare'};
 }
 async function updateSetting(c,u,input){const {key:k,version}=input;let value=input.value;if(typeof value!=='string'||value.length>9*1024*1024)throw problem('Configuración inválida.');
  let stored=k;if(personalKeys.has(k))stored='user:'+u.id+':'+k;else if(stageKeys.has(k)){if(!manager(u)&&u.role!=='vendedor')throw problem('No tienes permiso para editar las etapas.',403);}else if((publicKeys.has(k)||privateKeys.has(k))&&manager(u)){}else throw problem('No tienes permiso para cambiar esta configuración.',403);
  if(k==='tvsCatalog'){let rows;try{rows=JSON.parse(value);}catch{throw problem('Catálogo inválido.');}if(!Array.isArray(rows)||rows.length<1||rows.length>500)throw problem('Catálogo inválido.');for(const row of rows)if(!text(row.name)||!Number.isFinite(Number(row.price))||Number(row.price)<0)throw problem('Revisa el nombre y precio de cada motocicleta.');}
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['zip-setting:'+stored]);
  if(personalKeys.has(k)){
   const {config,secrets}=splitIntegrationSettings(value),secretKey='secret:'+stored;
   const existing=(await c.query('SELECT value FROM crm.zip_settings WHERE key=$1',[secretKey])).rows[0];
   const saved=existing?await unseal('integration-secrets',stored,Buffer.from(existing.value,'base64')):{};
   Object.assign(saved,secrets);
   config.configuredSecrets=Object.fromEntries(Object.keys(saved).map(k=>[k,true]));
   if(Object.keys(secrets).length){const ciphertext=(await seal('integration-secrets',stored,saved)).toString('base64');await c.query('INSERT INTO crm.zip_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,version=crm.zip_settings.version+1,updated_at=now()',[secretKey,ciphertext]);}
   value=JSON.stringify(config);
  }
  const prev=(await c.query('SELECT version FROM crm.zip_settings WHERE key=$1 FOR UPDATE',[stored])).rows[0];if(Number(prev?.version||0)!==Number(version||0))throw problem('Otra persona actualizó estos datos. Recarga antes de guardar.',409);
  const result=await c.query('INSERT INTO crm.zip_settings(key,value,version) VALUES($1,$2,1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,version=crm.zip_settings.version+1,updated_at=now() RETURNING version',[stored,value]);
  if(k==='tvsCatalog'){
   const catalog=JSON.parse(value);
   for(const row of catalog){const found=await c.query('UPDATE crm.motorcycles SET details=$2::jsonb,active=true,updated_at=now() WHERE name=$1 RETURNING id',[row.name,JSON.stringify(row)]);if(!found.rowCount)await c.query("INSERT INTO crm.motorcycles(code,name,brand,details) VALUES($1,$2,'TVS',$3::jsonb)",['ZIP-'+digest(row.name).slice(0,16),row.name,JSON.stringify(row)]);}
   await c.query('UPDATE crm.motorcycles SET active=false,updated_at=now() WHERE NOT(name=ANY($1::text[]))',[catalog.map(r=>r.name)]);
  }
  return {key:k,version:Number(result.rows[0].version)};
 }
 async function updateUser(c,u,change){if(u.role!=='admin')throw problem('Solo Administración puede gestionar usuarios.',403);const id=uuid(cleanId(change.id)),prev=(await c.query('SELECT id,username,name,role,active,updated_at FROM crm.users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(Number(prev?new Date(prev.updated_at).getTime():0)!==Number(change.version||0))throw problem('El usuario fue actualizado. Recarga la lista.',409);
  if(change.deleted){if(id===u.id)throw problem('No puedes eliminar tu propia cuenta.',403);await c.query('UPDATE crm.users SET active=false,updated_at=now() WHERE id=$1',[id]);await c.query('DELETE FROM crm.sessions WHERE user_id=$1',[id]);return {id:change.id,version:0};}
  const p=change.payload;if(!p||!roles.has(p.role)||!/^[\p{L}\p{N}_.@+-]{3,100}$/u.test(p.username||'')||!text(p.name))throw problem('Revisa los datos del usuario.');if(id===u.id&&(p.blocked||p.role!=='admin'))throw problem('No puedes bloquear o quitar el perfil de tu propia cuenta.',403);
  const hash=p.password?await hashPassword(p.password):null;if(!prev&&!hash)throw problem('Ingresa una contraseña de al menos 16 caracteres.');
  const r=await c.query('INSERT INTO crm.users(id,username,name,role,password_hash,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,name=EXCLUDED.name,role=EXCLUDED.role,password_hash=COALESCE($7,crm.users.password_hash),active=EXCLUDED.active,updated_at=now() RETURNING updated_at',[id,p.username,text(p.name),p.role,hash||'',!p.blocked,hash]);
  if(prev&&(hash||prev.role!==p.role||!p.blocked!==prev.active))await c.query('DELETE FROM crm.sessions WHERE user_id=$1',[id]);
  if(p.role==='freelance')await c.query('INSERT INTO crm.freelance_profiles(user_id,referral_code) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING',[id,'F-'+digest(id).slice(0,10).toUpperCase()]);
  return {id:change.id,version:new Date(r.rows[0].updated_at).getTime(),payload:{...safePayload(p),id:change.id}};
 }
 async function updateRecord(c,u,bucket,change){
  if(bucket==='users')return updateUser(c,u,change);
  const id=cleanId(change.id);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['zip-record:'+bucket+':'+id]);const prev=(await c.query('SELECT * FROM crm.zip_records WHERE bucket=$1 AND record_id=$2 FOR UPDATE',[bucket,id])).rows[0];
  const old=prev?await unseal(bucket,id,prev.encrypted_payload):null;
  if(prev&&!recordVisible(bucket,{...prev,payload:old},u))throw problem('Registro no disponible.',404);
  if(Number(prev?.version||0)!==Number(change.version||0))throw problem('Otra persona actualizó este registro. Recarga antes de guardar.',409);
  if(change.deleted){if(!manager(u)&&(!prev||prev.owner_id!==u.id||!['referrals','leads','filemeta'].includes(bucket)))throw problem('No puedes eliminar este registro.',403);const r=await c.query('UPDATE crm.zip_records SET deleted_at=now(),version=version+1,updated_at=now() WHERE bucket=$1 AND record_id=$2 RETURNING version',[bucket,id]);return {id,version:Number(r.rows[0]?.version||0),deleted:true};}
  let p=safePayload(change.payload);if(rowId(p)!==id)throw problem('Identificador de registro inválido.');validateOwnerEdit(bucket,old,p,u);
  let owner=prev?.owner_id??await targetOwner(c,p,u),secret=prev?.secret_hash||null;
  if(!manager(u)&&prev&&prev.owner_id!==u.id&&!(bucket==='requests'&&old.allFreelancers))throw problem('No puedes cambiar este registro.',403);
  if(['filemeta','materials'].includes(bucket)){
   const file=(await c.query('SELECT owner_id FROM crm.zip_files WHERE id=$1 AND deleted_at IS NULL',[String(p.fileId||'')])).rows[0];if(!file||(!manager(u)&&file.owner_id!==u.id))throw problem('Primero adjunta un archivo válido.',403);
  }
  if(bucket==='filemeta'&&!manager(u)){
   const ref=(await c.query('SELECT owner_id,encrypted_payload,record_id FROM crm.zip_records WHERE bucket=\'requests\' AND record_id=$1 AND deleted_at IS NULL',[String(p.requestId||'')])).rows[0];if(!ref||ref.owner_id!==u.id)throw problem('No tienes una solicitud de papelería para este archivo.',403);owner=u.id;
  }
  if(bucket==='referrals'&&!prev&&!manager(u)){p.freelance=u.username;p.freelanceUser=u.username;p.freelanceName=u.name;owner=u.id;}
  if(bucket==='leads'&&!manager(u)&&u.role!=='vendedor')throw problem('No tienes permiso para gestionar el CRM.',403);
  if(bucket==='leads'&&!manager(u)){owner=u.id;p.owner=u.name;}
  if(bucket==='applications'){
   if(u.role!=='admin'&&change.payload.password)throw problem('Solo Administración puede cambiar las credenciales.',403);
   if(change.payload.password)secret=await hashPassword(change.payload.password);
   if(p.status==='Aprobado'){
    if(!prev)throw problem('La solicitud debe existir antes de aprobarla.');
    let account=owner?(await c.query('SELECT id FROM crm.users WHERE id=$1',[owner])).rows[0]:null;
    if(!account){if(!secret)throw problem('Asigna una contraseña antes de aprobar esta solicitud.');const created=await c.query('INSERT INTO crm.users(username,name,role,password_hash,active) VALUES($1,$2,\'freelance\',$3,true) RETURNING id',[p.username,text(p.fullName||p.name||p.username),secret]);owner=created.rows[0].id;await c.query('INSERT INTO crm.freelance_profiles(user_id,referral_code) VALUES($1,$2)',[owner,p.code]);secret=null;}else await c.query('UPDATE crm.users SET active=true,updated_at=now() WHERE id=$1',[owner]);
   }else if(owner&&['Rechazado','Bloqueado'].includes(p.status)){await c.query('UPDATE crm.users SET active=false,updated_at=now() WHERE id=$1 AND role=\'freelance\'',[owner]);await c.query('DELETE FROM crm.sessions WHERE user_id=$1',[owner]);}
  }
  const enc=await seal(bucket,id,p);const r=await c.query('INSERT INTO crm.zip_records(bucket,record_id,owner_id,encrypted_payload,secret_hash,version) VALUES($1,$2,$3,$4,$5,1) ON CONFLICT(bucket,record_id) DO UPDATE SET encrypted_payload=EXCLUDED.encrypted_payload,owner_id=EXCLUDED.owner_id,secret_hash=EXCLUDED.secret_hash,version=crm.zip_records.version+1,deleted_at=NULL,updated_at=now() RETURNING version',[bucket,id,owner,enc,secret]);return {id,version:Number(r.rows[0].version),payload:p};
 }
 async function publicRecord(req,input){
  const bucket=input.bucket;if(!['applications','referrals'].includes(bucket))throw problem('Formulario desconocido.');limited(req,bucket,20);await proof(req,bucket==='applications'?'freelance':'prequalification',input.receipt);
  const p=safePayload(input.payload);const id=rowId(p);if(!text(p.fullName||p.name)||!/^\d{8}$/.test(String(p.phone||''))||!/^\d{13}$/.test(String(p.dpi||'')))throw problem('Revisa nombre, DPI y teléfono.');
  p.status='Pendiente';p.createdAt=new Date().toISOString();p.brand='tvs';p.blocked=false;
  const secret=bucket==='applications'?await hashPassword(input.payload.password):null;
  if(bucket==='applications'&&!/^[\p{L}\p{N}_.@+-]{3,100}$/u.test(p.username||''))throw problem('Usuario inválido.');
  return transaction(async c=>{
   if(bucket==='applications'&&(await c.query('SELECT 1 FROM crm.users WHERE username=$1',[p.username])).rowCount)throw problem('Ese usuario ya existe. Elige otro.',409);
   const code=text(p.freelanceCode||p.freelance,100);const profile=bucket==='referrals'?(await c.query('SELECT f.user_id,u.username,u.name,f.referral_code FROM crm.freelance_profiles f JOIN crm.users u ON u.id=f.user_id WHERE (f.referral_code=$1 OR u.username=$1) AND u.active',[code])).rows[0]:null;
   if(profile){p.freelance=profile.username;p.freelanceCode=profile.referral_code;p.freelanceName=profile.name;}else if(bucket==='referrals'){p.freelance='Web';p.freelanceCode='Web';p.freelanceName='Web';}
   const enc=await seal(bucket,id,p);const unique=bucket==='applications'?createHmac('sha256',await key()).update(p.dpi).digest('hex'):null;
   await c.query('INSERT INTO crm.zip_records(bucket,record_id,owner_id,encrypted_payload,secret_hash,dedupe_key) VALUES($1,$2,$3,$4,$5,$6)',[bucket,id,profile?.user_id||null,enc,secret,unique]);return {id,version:1,payload:p};
  });
 }
 async function files(req,res,u,path,method){
  if(!u)throw problem('Inicia sesión para acceder a tus documentos.',401);const id=cleanId(decodeURIComponent(path.slice('/api/zip/files/'.length)));
  if(method==='POST'){
   if(!manager(u)&&u.role!=='freelance')throw problem('No tienes permiso para subir documentos.',403);limited(req,'files',100);
   const data=await rawBody(req,31*1024*1024),mime=text(req.headers['content-type'],100).split(';')[0];if(!['application/pdf','image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','text/plain'].includes(mime))throw problem('Formato no permitido. Usa PDF, imagen, video o texto.');
   if(!data.length||(!manager(u)&&data.length>15*1024*1024))throw problem('Revisa el tamaño del archivo.');const encoded=await seal('files',id,data);
   await db.query('INSERT INTO crm.zip_files(id,owner_id,filename,mime_type,size_bytes,encrypted_data) VALUES($1,$2,$3,$4,$5,$6)',[id,u.id,text(decodeURIComponent(req.headers['x-file-name']||'archivo'),200),mime,data.length,encoded]);json(res,201,{ok:true,id});return;
  }
  const r=(await db.query('SELECT * FROM crm.zip_files WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0];if(!r)throw problem('Archivo no encontrado.',404);
  let allowed=manager(u)||r.owner_id===u.id;
  if(!allowed&&method==='GET'){
   const rows=(await db.query('SELECT record_id,encrypted_payload FROM crm.zip_records WHERE bucket=\'materials\' AND deleted_at IS NULL')).rows;
   for(const m of rows){const p=await unseal('materials',m.record_id,m.encrypted_payload);if(p.fileId===id&&p.active!==false){allowed=true;break;}}
  }
  if(!allowed)throw problem('Archivo no encontrado.',404);
  if(method==='DELETE'){if(!manager(u)&&r.owner_id!==u.id)throw problem('No permitido.',403);await db.query('UPDATE crm.zip_files SET deleted_at=now() WHERE id=$1',[id]);return json(res,200,{ok:true});}
  if(method!=='GET')throw problem('Método no permitido.',405);
  const bytes=await unseal('files',id,r.encrypted_data,true);res.writeHead(200,{'Content-Type':r.mime_type,'Content-Length':bytes.length,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(r.filename)}`,'X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'private, no-store'});res.end(bytes);
 }
 return async function handle(req,res){const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/api/zip/'))return false;
  try{
   const method=req.method;if(method!=='GET')checkOrigin(req);
   if(path==='/api/zip/verify'&&method==='POST'){
    limited(req,'verify',100);const input=await body(req);if(!['login','prequalification','freelance','chat','referral','credit','finalize'].includes(input.action))throw problem('Formulario desconocido.');await verifyCaptcha(input.token,input.action);if(receipts.size>3000)for(const [k,v] of receipts)if(v.until<Date.now())receipts.delete(k);const receipt=randomBytes(32).toString('hex');receipts.set(receipt,{binding:binding(req),action:input.action,until:Date.now()+90000});json(res,200,{verified:true,receipt});return true;
   }
   if(path==='/api/zip/login'&&method==='POST'){
    const input=await body(req);limited(req,'login',8);await proof(req,'login',input.receipt);const name=text(input.username,100);const r=(await db.query('SELECT id,username,name,role,password_hash,active FROM crm.users WHERE username=$1',[name])).rows[0];const dummy='scrypt$'+'0'.repeat(32)+'$'+'0'.repeat(128);const valid=await matchesPassword(input.password,r?.password_hash||dummy);if(!r||!valid||!r.active||!roles.has(r.role)||r.role!==input.role)throw problem('Usuario, contraseña o perfil incorrectos.',401);
    const token=randomBytes(32).toString('hex');await db.query('INSERT INTO crm.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'8 hours\')',[digest(token),r.id]);cookie(res,token,28800);delete r.password_hash;delete r.active;json(res,200,await state(r));return true;
   }
   const u=await user(req);
   if(path==='/api/zip/bootstrap.js'&&method==='GET'){
    const data=JSON.stringify(await state(u)).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});res.end('window.TVSBackend.initialize('+data+');');return true;
   }
   if(path==='/api/zip/state'&&method==='GET'){json(res,200,await state(u));return true;}
   if(path==='/api/zip/public'&&method==='POST'){json(res,201,await publicRecord(req,await body(req)));return true;}
   if(!u)throw problem('Inicia sesión nuevamente para guardar tus datos.',401);
   if(path==='/api/zip/logout'&&method==='POST'){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tvsCRM='))?.slice(7)||'';await db.query('DELETE FROM crm.sessions WHERE token_hash=$1',[digest(token)]);cookie(res,'',0);json(res,200,{ok:true});return true;}
   if(path.startsWith('/api/zip/files/')){await files(req,res,u,path,method);return true;}
   if(path==='/api/zip/save'&&method==='POST'){
    const input=await body(req);if(input.kind==='setting'){json(res,200,await transaction(c=>updateSetting(c,u,input)));return true;}
    if(!Object.values(collections).includes(input.bucket)||!Array.isArray(input.changes)||input.changes.length>200)throw problem('Solicitud inválida.');
    const result=await transaction(async c=>{const out=[];for(const change of [...input.changes].sort((a,b)=>String(a.id).localeCompare(String(b.id))))out.push(await updateRecord(c,u,input.bucket,change));return out;});json(res,200,{changes:result});return true;
   }
   throw problem('Ruta no encontrada.',404);
  }catch(e){const status=e.status||(e.code==='23505'?409:500);if(status===500)console.error('ZIP_DATA_ERROR',e.code||e.message);json(res,status,{error:status===500?'No se pudo guardar en el servidor. Tus cambios no han sido confirmados.':e.code==='23505'?'El registro ya existe. Revisa usuario, DPI o código.':e.message});return true;}
 };
}
