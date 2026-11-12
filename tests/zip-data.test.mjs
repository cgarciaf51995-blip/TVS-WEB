import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Readable} from 'node:stream';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createZipDataAPI,recordVisible,validateOwnerEdit} from '../server/zip-data-api.mjs';
const owner={id:'11111111-1111-4111-a111-111111111111',username:'prueba',name:'Prueba',role:'freelance'};
const other={id:'22222222-2222-4222-a222-222222222222',username:'otro',name:'Otro',role:'freelance'};
const admin={id:'33333333-3333-4333-a333-333333333333',username:'admin',name:'Admin',role:'admin'};
const tokens={a:'a'.repeat(64),b:'b'.repeat(64),c:'c'.repeat(64)};
const hash=x=>createHash('sha256').update(x).digest('hex');
function database(){
 const records=new Map(),files=new Map(),settings=new Map(),users=new Map([[hash(tokens.a),owner],[hash(tokens.b),other],[hash(tokens.c),admin]]);
 const query=async(sql,v=[])=>{
  const result=rows=>({rows,rowCount:rows.length});
  if(/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)||sql.startsWith('SELECT pg_advisory'))return result([]);
  if(sql.startsWith('SELECT u.id,u.username'))return result(users.has(v[0])?[users.get(v[0])]:[]);
  if(sql==='SELECT key,value,version FROM crm.zip_settings')return result([...settings.values()]);
  if(sql.startsWith('SELECT version FROM crm.zip_settings'))return result(settings.has(v[0])?[settings.get(v[0])]:[]);
  if(sql.startsWith('INSERT INTO crm.zip_settings')){const r={key:v[0],value:v[1],version:(settings.get(v[0])?.version||0)+1};settings.set(v[0],r);return result([r]);}
  if(sql.startsWith('SELECT id,username,name,role,active,updated_at'))return result([]);
  if(sql.startsWith('SELECT bucket,record_id'))return result([...records.values()].filter(r=>!r.deleted_at&&(v[0]||r.owner_id===v[1]||r.bucket==='materials'||(r.bucket==='requests'&&r.owner_id===null))));
  if(sql.startsWith('SELECT * FROM crm.zip_records')){const r=records.get(v[0]+':'+v[1]);return result(r?[r]:[]);}
  if(sql.startsWith('INSERT INTO crm.zip_records')){
   const k=v[0]+':'+v[1],prev=records.get(k);const r={bucket:v[0],record_id:v[1],owner_id:v[2],encrypted_payload:v[3],secret_hash:v[4],version:(prev?.version||0)+1};records.set(k,r);return result([r]);
  }
  if(sql.startsWith('UPDATE crm.zip_records SET deleted_at')){const r=records.get(v[0]+':'+v[1]);if(r){r.version++;r.deleted_at=new Date();}return result(r?[r]:[]);}
  if(sql.startsWith('INSERT INTO crm.zip_files')){if(files.has(v[0]))throw Object.assign(Error('duplicate'),{code:'23505'});files.set(v[0],{id:v[0],owner_id:v[1],filename:v[2],mime_type:v[3],size_bytes:v[4],encrypted_data:v[5]});return result([]);}
  if(sql.startsWith('SELECT * FROM crm.zip_files'))return result(files.has(v[0])&&!files.get(v[0]).deleted_at?[files.get(v[0])]:[]);
  if(sql.startsWith("SELECT record_id,encrypted_payload FROM crm.zip_records WHERE bucket='materials'"))return result([...records.values()].filter(r=>r.bucket==='materials'&&!r.deleted_at));
  if(sql.startsWith('SELECT owner_id FROM crm.zip_files'))return result(files.has(v[0])?[files.get(v[0])]:[]);
  if(sql.startsWith('UPDATE crm.zip_files')){files.get(v[0]).deleted_at=new Date();return result([]);}
  if(sql.startsWith('SELECT 1 FROM crm.users'))return result([]);
  if(sql.startsWith('SELECT f.user_id'))return result([]);
  if(sql.startsWith('SELECT u.id FROM crm.users'))return result([]);
  throw Error('Unhandled SQL: '+sql);
 };
 return {query,records,files,settings,pool:{connect:async()=>({query,release(){}})}};
}
async function fixture(t){const db=database(),dir=await mkdtemp(join(tmpdir(),'tvs-db-test-'));const verifyCaptcha=async(token)=>{if(token!=='test-captcha')throw Object.assign(Error('Captcha requerido'),{status:403});};const handle=createZipDataAPI(db,{env:{SECURITY_DATA_DIR:dir,PUBLIC_ORIGIN:'http://localhost'},verifyCaptcha});
 const request=async(path,{token,method='GET',data,bytes,headers={}}={})=>{const req=Readable.from(bytes?[bytes]:data?[Buffer.from(JSON.stringify(data))]:[]);req.url='/api/zip/'+path;req.method=method;req.headers={...headers,...token?{cookie:'tvsCRM='+token}:{}};req.socket={remoteAddress:'127.0.0.1'};const res={status:0,headers:{},writeHead(status,h){this.status=status;this.headers={...this.headers,...h}},setHeader(k,v){this.headers[k]=v},end(v){this.bytes=Buffer.isBuffer(v)?v:Buffer.from(v||'')}};await handle(req,res);try{res.data=JSON.parse(res.bytes.toString())}catch{}return res;};
 t.after(()=>rm(dir,{recursive:true,force:true}));return {db,request};
}
test('los documentos privados y los estados financieros se autorizan en el servidor',()=>{
 assert.equal(recordVisible('referrals',{owner_id:owner.id,payload:{}},other),false);
 assert.equal(recordVisible('referrals',{owner_id:owner.id,payload:{}},admin),true);
 assert.throws(()=>validateOwnerEdit('referrals',{status:'Pendiente',freelance:'prueba'},{status:'Venta',freelance:'prueba'},owner));
 assert.throws(()=>validateOwnerEdit('referrals',{status:'Pendiente',freelance:'prueba'},{status:'Pendiente',freelance:'otro'},owner));
});
test('sin sesión no se pueden leer datos privados ni escribir configuración',async t=>{const {db,request}=await fixture(t);db.settings.set('tvs_AIConfig',{key:'tvs_AIConfig',value:'{"token":"test-only"}',version:1});const state=await request('state');assert.equal(state.status,200);assert.equal(state.data.values.tvs_AIConfig,undefined);const save=await request('save',{method:'POST',data:{kind:'setting',key:'tvsWhatsapp',value:'1'}});assert.equal(save.status,401);const foreign=await request('save',{method:'POST',token:tokens.c,headers:{origin:'https://untrusted.invalid'},data:{}});assert.equal(foreign.status,403);});
test('referidos cifrados, aislamiento por usuario y protección de versiones',async t=>{const {db,request}=await fixture(t);const payload={id:'ref_test',name:'Persona de prueba',phone:'00000000',status:'Pendiente'};const save=await request('save',{method:'POST',token:tokens.a,data:{bucket:'referrals',changes:[{id:payload.id,payload,version:0}]}});assert.equal(save.status,200);assert.equal(db.records.get('referrals:ref_test').encrypted_payload.includes(Buffer.from(payload.name)),false);
 const own=await request('state',{token:tokens.a});assert.equal(JSON.parse(own.data.values.tvs_FreelanceReferrals).length,1);const foreign=await request('state',{token:tokens.b});assert.equal(JSON.parse(foreign.data.values.tvs_FreelanceReferrals).length,0);
 const changed={...JSON.parse(own.data.values.tvs_FreelanceReferrals)[0],status:'En proceso'};const updated=await request('save',{method:'POST',token:tokens.a,data:{bucket:'referrals',changes:[{id:payload.id,payload:changed,version:1}]}});assert.equal(updated.status,200);
 const stale=await request('save',{method:'POST',token:tokens.a,data:{bucket:'referrals',changes:[{id:payload.id,payload:changed,version:1}]}});assert.equal(stale.status,409);
 const attack=await request('save',{method:'POST',token:tokens.b,data:{bucket:'referrals',changes:[{id:payload.id,payload:changed,version:2}]}});assert.equal(attack.status,404);
});
test('archivo cifrado descargable por su dueño y oculto para otros usuarios',async t=>{const {db,request}=await fixture(t);const file=Buffer.from('%PDF-test-no-personal-data');const upload=await request('files/doc_test',{method:'POST',token:tokens.a,bytes:file,headers:{'content-type':'application/pdf','x-file-name':'prueba.pdf'}});assert.equal(upload.status,201);assert.notDeepEqual(db.files.get('doc_test').encrypted_data,file);const download=await request('files/doc_test',{token:tokens.a});assert.equal(download.status,200);assert.deepEqual(download.bytes,file);assert.equal((await request('files/doc_test',{token:tokens.b})).status,404);assert.equal((await request('files/doc_test')).status,401);assert.equal((await request('files/svg_test',{method:'POST',token:tokens.a,bytes:file,headers:{'content-type':'image/svg+xml'}})).status,400);});
test('las solicitudes públicas requieren una verificación de un solo uso',async t=>{const {request}=await fixture(t);const verified=await request('verify',{method:'POST',data:{action:'prequalification',token:'test-captcha'}});assert.equal(verified.status,200);const data={bucket:'referrals',receipt:verified.data.receipt,payload:{id:'public_test',name:'Prueba pública',phone:'00000000',dpi:'0000000000000',status:'Aprobado'}};const create=await request('public',{method:'POST',data});assert.equal(create.status,201);assert.equal(create.data.payload.status,'Pendiente');assert.equal((await request('public',{method:'POST',data:{...data,payload:{...data.payload,id:'second'}}})).status,403);const anonymous=await request('state');assert.deepEqual(JSON.parse(anonymous.data.values.tvsFreelanceReferrals),[]);});
