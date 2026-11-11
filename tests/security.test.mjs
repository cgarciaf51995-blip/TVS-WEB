import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createSecurityServer} from '../server/security.mjs';

test('Administración y validación reCAPTCHA en servidor',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'tvs-security-'));
 let googleCalls=0;
 const {server}=createSecurityServer({env:{SECURITY_ADMIN_PASSWORD:'test-admin-password-long'},configPath:join(folder,'security.json'),staticRoot:resolve('dist'),googleVerify:async(secret,token)=>{googleCalls++;assert.equal(secret,'private-test-secret');return {success:token!=='invalid',hostname:token==='wrong-host'?'attacker.example':'localhost',challenge_ts:new Date(Date.now()-(token==='expired'?180000:0)).toISOString()}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const request=(path,body,cookie,overrideOrigin)=>fetch(origin+'/api/security/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:overrideOrigin||origin}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 try{
  assert.equal((await request('admin/config')).status,401);
  assert.equal((await request('admin/login',{password:'wrong'})).status,401);
  assert.equal((await request('admin/login',{password:'test-admin-password-long'},null,'https://evil.example')).status,403);
  const login=await request('admin/login',{password:'test-admin-password-long'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
  const payload={enabled:true,siteKey:'public-test-key',secretKey:'private-test-secret',hostnames:['localhost'],forms:{}};
  assert.equal((await request('admin/config',{enabled:true},cookie)).status,400);
  const saved=await request('admin/config',payload,cookie);assert.equal(saved.status,200);assert.doesNotMatch(await saved.text(),/private-test-secret/);
  const publicText=await(await request('public')).text();assert.doesNotMatch(publicText,/private-test-secret/);assert.match(publicText,/public-test-key/);
  assert.equal((await request('verify',{action:'login',token:''})).status,400);
  assert.equal((await request('verify',{action:'unknown',token:'valid'})).status,400);
  for(const token of ['invalid','wrong-host','expired'])assert.equal((await request('verify',{action:'login',token})).status,400,token);
  assert.equal((await request('verify',{action:'login',token:'good-token'})).status,200);
  const previous=googleCalls;assert.equal((await request('verify',{action:'login',token:'good-token'})).status,400);assert.equal(googleCalls,previous);
  assert.equal((await request('admin/config',{...payload,secretKey:'',forms:{chat:false}},cookie)).status,200);
  const allowed=await(await request('verify',{action:'chat',token:''})).json();assert.equal(allowed.required,false);
  assert.equal(JSON.parse(readFileSync(join(folder,'security.json'))).secretKey,'private-test-secret');
  assert.equal((await fetch(origin+'/../.env')).status,404);
  assert.equal((await request('admin/logout',{},cookie)).status,200);assert.equal((await request('admin/config',null,cookie)).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(folder,{recursive:true,force:true})}
});
