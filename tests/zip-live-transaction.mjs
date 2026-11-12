// Real SQL in one rolled-back transaction. Auth injection applies only to this isolated test process.
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {randomUUID,createHash} from 'node:crypto';
import {createZipDataAPI} from '../server/zip-data-api.mjs';
const {createDatabase}=await import('/opt/tvs/server/database.mjs');
const target=new URL(process.env.DATABASE_URL);
assert.equal(target.hostname,'aws-1-us-east-1.pooler.supabase.com');assert.ok(target.username.endsWith('.wvhzqukukzzwoevbgare'));assert.equal(target.searchParams.get('sslmode'),'verify-full');
const db=createDatabase(),c=await db.pool.connect();const prefix='test_'+randomUUID();
try{
 await c.query('BEGIN');
 const admin=(await c.query("SELECT id,username,name,role FROM crm.users WHERE role='admin' AND active ORDER BY created_at LIMIT 1")).rows[0];
 const owner=(await c.query("SELECT id,username,name,role FROM crm.users WHERE role='freelance' AND active ORDER BY created_at LIMIT 1")).rows[0];assert.ok(admin&&owner);
 const other={...owner,id:randomUUID(),username:'isolated-test'};
 const tokens=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)],actors=new Map(tokens.map((v,i)=>[createHash('sha256').update(v).digest('hex'),[admin,owner,other][i]]));
 const query=(sql,v=[])=>sql.startsWith('SELECT u.id,u.username,u.name,u.role FROM crm.sessions')?Promise.resolve({rows:actors.has(v[0])?[actors.get(v[0])]:[],rowCount:1}):c.query(sql,v);
 const pool={connect:async()=>({query:(sql,v)=>['BEGIN','COMMIT','ROLLBACK'].includes(sql)?Promise.resolve({rows:[]}):query(sql,v),release(){}})};
 const handle=createZipDataAPI({query,pool},{verifyCaptcha:async()=>{throw Error('CAPTCHA not exercised by transaction test')}});
 async function request(path,{token,method='GET',data,bytes,headers={}}={}){const req=Readable.from(bytes?[bytes]:data?[Buffer.from(JSON.stringify(data))]:[]);req.url='/api/zip/'+path;req.method=method;req.headers={...headers,...token?{cookie:'tvsCRM='+token}:{}};req.socket={remoteAddress:'127.0.0.1'};const res={writeHead(s,h){this.status=s;this.headers=h},setHeader(){},end(v){this.bytes=Buffer.isBuffer(v)?v:Buffer.from(v||'');try{this.data=JSON.parse(this.bytes)}catch{}}};await handle(req,res);return res;}
 const payload={id:prefix,name:'Verificación técnica sin datos reales',phone:'00000000',status:'Pendiente'};
 const saved=await request('save',{token:tokens[1],method:'POST',data:{bucket:'referrals',changes:[{id:prefix,version:0,payload}]}});assert.equal(saved.status,200,JSON.stringify(saved.data));
 const first=await request('state',{token:tokens[1]});assert.ok(JSON.parse(first.data.values.tvs_FreelanceReferrals).some(x=>x.id===prefix));
 const notMine=await request('state',{token:tokens[2]});assert.ok(!JSON.parse(notMine.data.values.tvs_FreelanceReferrals).some(x=>x.id===prefix));
 const publicState=await request('state');assert.ok(!JSON.stringify(publicState.data).includes(prefix));
 const current=JSON.parse(first.data.values.tvs_FreelanceReferrals).find(x=>x.id===prefix);const edit=await request('save',{token:tokens[1],method:'POST',data:{bucket:'referrals',changes:[{id:prefix,version:1,payload:{...current,status:'En proceso'}}]}});assert.equal(edit.status,200,JSON.stringify(edit.data));
 const stale=await request('save',{token:tokens[1],method:'POST',data:{bucket:'referrals',changes:[{id:prefix,version:1,payload:current}]}});assert.equal(stale.status,409);
 const fileId=prefix+'_pdf',pdf=Buffer.from('%PDF-isolated-transaction-test');const uploaded=await request('files/'+fileId,{token:tokens[1],method:'POST',bytes:pdf,headers:{'content-type':'application/pdf','x-file-name':'verificacion.pdf'}});assert.equal(uploaded.status,201,JSON.stringify(uploaded.data));
 const dl=await request('files/'+fileId,{token:tokens[1]});assert.equal(dl.status,200);assert.deepEqual(dl.bytes,pdf);assert.equal((await request('files/'+fileId,{token:tokens[2]})).status,404);
 const encrypted=(await c.query('SELECT encrypted_payload FROM crm.zip_records WHERE bucket=$1 AND record_id=$2',['referrals',prefix])).rows[0];assert.ok(!encrypted.encrypted_payload.includes(Buffer.from(payload.name)));
 const managerState=await request('state',{token:tokens[0]});assert.ok(JSON.parse(managerState.data.values.tvs_FreelanceReferrals).some(x=>x.id===prefix));
 await c.query('ROLLBACK');const count=(await c.query('SELECT count(*)::int AS n FROM crm.zip_records WHERE record_id=$1',[prefix])).rows[0].n;assert.equal(count,0);const files=(await c.query('SELECT count(*)::int AS n FROM crm.zip_files WHERE id=$1',[fileId])).rows[0].n;assert.equal(files,0);
 console.log('LIVE_SUPABASE_TRANSACTION_TESTS_PASSED: read/write, roles, encrypted PDF, stale-write rejection, rollback verified.');
}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();await db.close();}
