"""Install the narrowly scoped chat integration on the existing TVS service."""
from pathlib import Path
import os, json, hashlib, shutil, subprocess, time, tempfile, argparse, urllib.request, urllib.error

parser=argparse.ArgumentParser()
parser.add_argument('--allow-pending-credit',action='store_true',help='Install when the real OpenAI probe reports quota exhaustion; keep all other checks mandatory.')
options=parser.parse_args()
pending_credit=False
root=Path('/opt/tvs')
source=Path('/opt/tvs-release-20261111')
expected={'server/zip-data-api.mjs':'a611b7848425a98911ab5a7f9cdbb3a9feb2fd9c','dist/portal-gys-v6.html':'071ca8b6157d6f513aef35a5a400ece68acb09a4','dist/assets/js/supabase-bridge.js':'d6eb45753a70679e90ae87566565f0e2d411c2e9'}
files=['server/ai-chat.mjs',*expected]
pid=subprocess.check_output(['systemctl','show','tvs','--property=MainPID','--value'],text=True).strip()
assert pid!='0','El servicio TVS debe estar activo.'
env=dict(os.environ)
for item in Path('/proc/'+pid+'/environ').read_bytes().split(b'\0'):
 if b'=' in item:
  k,v=item.split(b'=',1);env[k.decode()]=v.decode()
assert env.get('OPENAI_API_KEY','').strip(),'La clave OPENAI_API_KEY no está cargada en el servicio. Revisá el archivo override y reiniciá tvs.'
print('SERVICE_ACTIVE; OPENAI_KEY_PRESENT (valor oculto)',flush=True)
for name,sha in expected.items():
 content=(root/name).read_bytes()
 actual=hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
 assert actual==sha,'La versión instalada cambió: '+name+'. Revisar antes de desplegar.'
for name in files:
 assert (source/name).is_file(),name
for name in ['server/ai-chat.mjs','server/zip-data-api.mjs','dist/assets/js/supabase-bridge.js']:
 subprocess.run(['node','--check',str(source/name)],check=True)
backup=Path('/var/backups/tvs')/('openai-'+time.strftime('%Y%m%d-%H%M%S'))
backup.mkdir(mode=0o700)
existed={name:(root/name).exists() for name in files}
for name in files:
 if existed[name]:
  p=backup/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,p)

def fetch(path,data=None):
 headers={'Origin':'https://tvssancris.com','Content-Type':'application/json'}
 req=urllib.request.Request('https://tvssancris.com/'+path,data=data,headers=headers)
 with urllib.request.urlopen(req,timeout=35) as response:return response.read()

captcha_before=fetch('api/security/public')
# Real read-only catalog query and OpenAI request, executed as the existing service user.
# Credentials are inherited in the child environment and are never printed.
probe="""import {createRequire} from 'node:module';
import {createChatService} from '/opt/tvs-release-20261111/server/ai-chat.mjs';
const {Pool}=createRequire('/opt/tvs/package.json')('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
try{const result=await createChatService({query:(q,v)=>pool.query(q,v)})({message:'Decime dos modelos del catálogo y sus precios, brevemente.'});console.log('OPENAI_REAL_TEST_OK',result.model,result.reply)}
catch(e){console.error('OPENAI_REAL_TEST_FAILED',e.status||500,e.status?e.message:'No se pudo consultar el catálogo.');process.exitCode=e.status===503&&e.message.startsWith('OpenAI no tiene cuota disponible')?42:1}
finally{await pool.end()}
"""
# The staging checkout may be private to root. Test a public-code-only copy
# under the service working directory instead of opening access to the checkout.
probe_dir=Path(tempfile.mkdtemp(prefix='.ai-probe-',dir=root))
try:
 probe_dir.chmod(0o755)
 probe_module=probe_dir/'ai-chat.mjs'
 shutil.copyfile(source/'server/ai-chat.mjs',probe_module)
 probe_module.chmod(0o644)
 probe=probe.replace("'/opt/tvs-release-20261111/server/ai-chat.mjs'",json.dumps(probe_module.as_uri()))
 try:
  subprocess.run(['runuser','-u','tvs','--','node','--input-type=module','-e',probe],cwd=root,env=env,check=True)
 except subprocess.CalledProcessError as error:
  if error.returncode!=42 or not options.allow_pending_credit:raise
  pending_credit=True
  print('OPENAI_PENDING_CREDIT; se instalará la integración sin respuestas de IA hasta disponer de cuota.',flush=True)
finally:
 shutil.rmtree(probe_dir)
try:
 for name in files:
  shutil.copyfile(source/name,root/name);(root/name).chmod(0o644)
 subprocess.run(['systemctl','restart','tvs'],check=True)
 for attempt in range(10):
  try:
   assert json.loads(fetch('api/zip/state'))['project']=='wvhzqukukzzwoevbgare';break
  except Exception:
   if attempt==9:raise
   time.sleep(1)
 assert fetch('api/security/public')==captcha_before,'La configuración de reCAPTCHA debe conservarse.'
 for name in ['dist/portal-gys-v6.html','dist/assets/js/supabase-bridge.js']:
  assert hashlib.sha256(fetch(name[5:])).digest()==hashlib.sha256((source/name).read_bytes()).digest(),name
 try:
  fetch('api/zip/chat',b'{"message":"Hola"}')
  raise AssertionError('La consulta sin prueba CAPTCHA debe rechazarse.')
 except urllib.error.HTTPError as error:
  assert error.code==400,'Revisar la ruta protegida de chat: '+str(error.code)
 print(('OPENAI_DEPLOY_PENDING_CREDIT' if pending_credit else 'OPENAI_DEPLOY_VERIFIED')+'; diseño y reCAPTCHA conservados; respaldo:',backup,flush=True)
except Exception:
 for name in files:
  if existed[name]:shutil.copy2(backup/name,root/name)
  elif (root/name).exists():(root/name).unlink()
 subprocess.run(['systemctl','restart','tvs'],check=False)
 print('Se restauró la versión anterior.',flush=True)
 raise
