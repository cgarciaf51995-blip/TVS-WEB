"""Selectively install the WhatsApp Inbox onto the existing TVS VPS."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,time,urllib.request,urllib.error
root=Path('/opt/tvs');source=Path(__file__).resolve().parent.parent
assert os.geteuid()==0 and source!=root,'Usá el checkout de actualización como root.'
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
expected={'dist/portal-gys-v6.html':'009797561d3480255def17a603bc84f0a7e80f95','dist/moto-crm.html':'d5f11c6776a9f6556f2876a0181f284d8d6e68f9','server/zip-data-api.mjs':'952708997f8da593aa82e38eb65b316ebaa991ef'}
files=[*expected,'server/whatsapp.mjs','dist/whatsapp-admin.html','dist/assets/js/whatsapp-inbox.js','dist/assets/css/whatsapp-inbox.css']
for name,sha in expected.items():assert blob((root/name).read_bytes()) in {sha,blob((source/name).read_bytes())},'Hay otros cambios en '+name+'. No se sobrescribió nada.'
security=root/'server/security.mjs';old=security.read_text();needle=".createZipDataAPI(db,{verifyCaptcha:app.verifyCaptcha});"
if 'zipHandler.whatsapp.boot' not in old:
 assert old.count(needle)==1 and old.count('await db?.close();')==1,'Revisá el arranque del servidor instalado.'
 patched=old.replace(needle,needle+'void zipHandler.whatsapp.boot();').replace('await db?.close();','await zipHandler?.whatsapp.close();await db?.close();')
else:patched=old
runtime=root/'whatsapp-runtime';runtime.mkdir(exist_ok=True,mode=0o755)
# This directory contains dependencies only, never WhatsApp credentials.
for name in ['package.json','package-lock.json']:shutil.copy2(source/'whatsapp-runtime'/name,runtime/name)
subprocess.run(['npm','ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],cwd=runtime,check=True)
# Test checkout against the exact isolated dependencies that production will use.
link=source/'whatsapp-runtime/node_modules'
if not link.exists():link.symlink_to(runtime/'node_modules',target_is_directory=True)
subprocess.run(['node','--test','tests/whatsapp.test.mjs','tests/zip-data.test.mjs','tests/security.test.mjs','tests/products-360.test.mjs'],cwd=source,check=True)
for name in ['server/whatsapp.mjs','server/zip-data-api.mjs','dist/assets/js/whatsapp-inbox.js']:subprocess.run(['node','--check',str(source/name)],check=True)
# Reuse the running service environment without displaying credentials.
pid=subprocess.check_output(['systemctl','show','tvs','--property=MainPID','--value'],text=True).strip();assert pid!='0','El servicio debe estar activo.'
env=dict(os.environ)
for item in Path('/proc/'+pid+'/environ').read_bytes().split(b'\0'):
 if b'=' in item:
  k,v=item.split(b'=',1);env[k.decode()]=v.decode()
probe="""import {createRequire} from 'node:module';
const {Pool}=createRequire('/opt/tvs/package.json')('pg');const p=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
try{const c=await p.connect();try{await c.query('BEGIN');for(const t of ['wa_auth','wa_runtime','wa_threads','wa_messages'])await c.query('SELECT 1 FROM crm.'+t+' LIMIT 0');await c.query(\"INSERT INTO crm.wa_auth(key,encrypted_payload) VALUES('installation-rollback-test',decode('00','hex'))\");await c.query('ROLLBACK');console.log('WHATSAPP_DATABASE_ACCESS_VERIFIED');}finally{c.release();}}finally{await p.end();}
"""
subprocess.run(['runuser','-u','tvs','--','node','--input-type=module','-e',probe],cwd=root,env=env,check=True)
def fetch(path):
 req=urllib.request.Request('https://tvssancris.com/'+path+'?wa_check='+str(time.time_ns()),headers={'Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=25) as response:return response.read()
captcha=fetch('api/security/public')
backup=Path('/var/backups/tvs')/('whatsapp-'+time.strftime('%Y%m%d-%H%M%S'));backup.mkdir(mode=0o700)
files.append('server/security.mjs');existed={n:(root/n).exists() for n in files}
for n in files:
 if existed[n]:p=backup/n;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/n,p)
(backup/'manifest.json').write_text(json.dumps(existed))
def publish(n,data):
 dst=root/n;dst.parent.mkdir(parents=True,exist_ok=True);tmp=dst.with_name(dst.name+'.wa-new');tmp.write_bytes(data);tmp.chmod(0o644);os.replace(tmp,dst)
try:
 for n in files:
  if n!='server/security.mjs':publish(n,(source/n).read_bytes())
 publish('server/security.mjs',patched.encode());subprocess.run(['node','--check',str(security)],check=True)
 subprocess.run(['systemctl','restart','tvs'],check=True)
 healthy=False
 for attempt in range(15):
  try:
   assert json.loads(fetch('api/zip/state')).get('project')=='wvhzqukukzzwoevbgare'
   try:fetch('api/zip/whatsapp/status');raise AssertionError('WhatsApp permite acceso sin sesión.')
   except urllib.error.HTTPError as e:assert e.code==401
   healthy=True;break
  except Exception:time.sleep(1)
 assert healthy,'El servicio no superó la verificación HTTP.'
 assert fetch('api/security/public')==captcha,'Cambió la configuración de CAPTCHA.'
 for n in files:
  if n.startswith('dist/'):assert fetch(n[5:])==(source/n).read_bytes(),'Archivo publicado diferente: '+n
 print('WHATSAPP_DEPLOY_VERIFIED; vinculación por QR pendiente; respaldo:',backup,flush=True)
except Exception:
 for n in files:
  if existed[n]:publish(n,(backup/n).read_bytes())
  elif (root/n).exists():(root/n).unlink()
 subprocess.run(['systemctl','restart','tvs'],check=False)
 print('Se restauró la versión anterior. Respaldo:',backup,flush=True);raise
