import http from 'node:http';
import {randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, statSync, createReadStream} from 'node:fs';
import {resolve, dirname, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const formTypes=['login','prequalification','freelance','chat','referral','credit','finalize'];
const defaults=()=>({enabled:false,siteKey:'',secretKey:'',hostnames:[],forms:Object.fromEntries(formTypes.map(key=>[key,true]))});
const hash=value=>createHash('sha256').update(value).digest('hex');
export function createSecurityServer({env=process.env,configPath=resolve('private/security.json'),staticRoot=resolve('dist'),googleVerify,apiHandler}={}){
 let config=defaults();
 if(existsSync(configPath))config={...config,...JSON.parse(readFileSync(configPath,'utf8'))};
 if(env.RECAPTCHA_SITE_KEY)config.siteKey=env.RECAPTCHA_SITE_KEY;
 if(env.RECAPTCHA_SECRET_KEY)config.secretKey=env.RECAPTCHA_SECRET_KEY;
 if(env.RECAPTCHA_HOSTNAMES)config.hostnames=env.RECAPTCHA_HOSTNAMES.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(env.RECAPTCHA_ENABLED==='true')config.enabled=true;
 const sessions=new Map(),rates=new Map(),used=new Map();
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))};
 const fail=(message,status=400)=>Object.assign(new Error(message),{status});
 const originOK=req=>{const origin=req.headers.origin;if(!origin)return false;try{return env.PUBLIC_ORIGIN?origin===new URL(env.PUBLIC_ORIGIN).origin:new URL(origin).host===req.headers.host}catch{return false}};
 const limited=(req,bucket,max)=>{const now=Date.now(),key=bucket+':'+req.socket.remoteAddress;let item=rates.get(key);if(!item||item.until<now){item={n:0,until:now+60000};rates.set(key,item)}if(++item.n>max)throw fail('Demasiados intentos. Espera un minuto.',429)};
 const body=async req=>{let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16000)throw fail('Solicitud demasiado grande.',413)}try{return JSON.parse(text||'{}')}catch{throw fail('JSON inválido.')}};
 const authenticated=req=>{const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tvsSecurityAdmin='))?.slice('tvsSecurityAdmin='.length);const until=token&&sessions.get(hash(token));if(!until||until<Date.now())throw fail('Inicia sesión en la administración de seguridad del servidor.',401)};
 const safeConfig=()=>({enabled:config.enabled,siteKey:config.siteKey,hostnames:config.hostnames,forms:config.forms,secretConfigured:Boolean(config.secretKey)});
 async function verifyCaptcha(token,action){
  if(!formTypes.includes(action))throw fail('Formulario desconocido.');
  if(!config.enabled||config.forms[action]===false)return {required:false};
  if(!config.siteKey||!config.secretKey||!config.hostnames.length)throw fail('reCAPTCHA no está configurado en el servidor.',503);
  if(typeof token!=='string'||!token||token.length>8192)throw fail('Completa la casilla No soy un robot.');
  const tokenHash=hash(token),now=Date.now();for(const [key,expires]of used)if(expires<now)used.delete(key);
  if(used.has(tokenHash))throw fail('La verificación ya fue utilizada. Repite la casilla.');
  let result;
  try{result=googleVerify?await googleVerify(config.secretKey,token):await fetch('https://www.google.com/recaptcha/api/siteverify',{method:'POST',body:new URLSearchParams({secret:config.secretKey,response:token}),signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)throw Error();return r.json()})}catch{throw fail('No se pudo verificar con Google. Vuelve a intentarlo.',503)}
  const stamp=Date.parse(result.challenge_ts),hostname=String(result.hostname||'').toLowerCase();
  if(!result.success||!config.hostnames.includes(hostname)||!Number.isFinite(stamp)||now-stamp>120000||stamp-now>10000)throw fail('Verificación inválida, vencida o de otro dominio. Repite la casilla.');
  used.set(tokenHash,now+120000);return {required:true};
 }
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(apiHandler&&await apiHandler(req,res))return;
   if(url.pathname.startsWith('/api/security/')){
    if(req.method==='POST'&&!originOK(req))throw fail('Origen no autorizado.',403);
    if(req.method==='GET'&&url.pathname==='/api/security/public')return json(res,200,{enabled:config.enabled,siteKey:config.siteKey,forms:config.forms,configured:Boolean(config.siteKey&&config.secretKey&&config.hostnames.length)});
    if(req.method==='POST'&&url.pathname==='/api/security/admin/login'){
     limited(req,'admin',5);if(!env.SECURITY_ADMIN_PASSWORD||env.SECURITY_ADMIN_PASSWORD.length<16)throw fail('Configura SECURITY_ADMIN_PASSWORD (mínimo 16 caracteres) en el servidor.',503);
     const input=await body(req),a=Buffer.from(hash(String(input.password||''))),b=Buffer.from(hash(env.SECURITY_ADMIN_PASSWORD));
     if(!timingSafeEqual(a,b))throw fail('Contraseña administrativa incorrecta.',401);
     const token=randomBytes(32).toString('hex');sessions.set(hash(token),Date.now()+30*60000);
     const secure=env.PUBLIC_ORIGIN?.startsWith('https://')?'; Secure':'';
     res.setHeader('Set-Cookie',`tvsSecurityAdmin=${token}; HttpOnly; SameSite=Strict; Path=/api/security/admin; Max-Age=1800${secure}`);return json(res,200,{ok:true});
    }
    if(url.pathname.startsWith('/api/security/admin/')){
     authenticated(req);
     if(req.method==='GET'&&url.pathname==='/api/security/admin/config')return json(res,200,safeConfig());
     if(req.method==='POST'&&url.pathname==='/api/security/admin/config'){
      const input=await body(req),siteKey=String(input.siteKey||'').trim(),secretKey=String(input.secretKey||'').trim()||config.secretKey;
      const hostnames=Array.isArray(input.hostnames)?[...new Set(input.hostnames.map(x=>String(x).trim().toLowerCase()))]:[];
      if(siteKey.length>200||secretKey.length>300||hostnames.length>20||hostnames.some(x=>!/^([a-z0-9-]+\.)*[a-z0-9-]+$/.test(x)))throw fail('Revisa la clave pública y los dominios (sin https ni rutas).');
      if(input.enabled&&(!siteKey||!secretKey||!hostnames.length))throw fail('Para activar, ingresa las dos claves y al menos un dominio.');
      const next={enabled:input.enabled===true,siteKey,secretKey,hostnames,forms:Object.fromEntries(formTypes.map(key=>[key,input.forms?.[key]!==false]))};
      mkdirSync(dirname(configPath),{recursive:true,mode:0o700});writeFileSync(configPath+'.tmp',JSON.stringify(next),{mode:0o600});renameSync(configPath+'.tmp',configPath);config=next;return json(res,200,safeConfig());
     }
     if(req.method==='POST'&&url.pathname==='/api/security/admin/logout'){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tvsSecurityAdmin='))?.slice('tvsSecurityAdmin='.length);if(token)sessions.delete(hash(token));res.setHeader('Set-Cookie','tvsSecurityAdmin=; HttpOnly; SameSite=Strict; Path=/api/security/admin; Max-Age=0');return json(res,200,{ok:true})}
    }
    if(req.method==='POST'&&url.pathname==='/api/security/verify'){limited(req,'verify',30);const input=await body(req);const verified=await verifyCaptcha(input.token,input.action);return json(res,200,{verified:true,...verified})}
    return json(res,404,{error:'Ruta no encontrada.'});
   }
   if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Método no permitido.'});
   const path=resolve(staticRoot,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!path.startsWith(staticRoot+sep)||!existsSync(path)||!statSync(path).isFile())return json(res,404,{error:'Archivo no encontrado.'});
   const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.woff2':'font/woff2'};
   res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':extname(path)==='.html'?'no-cache':'public, max-age=300'});if(req.method==='HEAD')res.end();else createReadStream(path).pipe(res);
  }catch(error){json(res,error.status||500,{error:error.status?error.message:'Error interno del servidor.'})}
 });
 return {server,verifyCaptcha};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {server}=createSecurityServer({configPath:resolve(process.env.SECURITY_DATA_DIR||'private','security.json')});
 server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('San Cristóbal TVS: servidor iniciado.'));
}
