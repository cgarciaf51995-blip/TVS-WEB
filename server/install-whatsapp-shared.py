"""Enable shared WhatsApp conversations and automatic leads without resetting pairing."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,time,urllib.request,urllib.error
root=Path('/opt/tvs');source=Path(__file__).resolve().parent.parent
assert os.geteuid()==0 and source!=root
expected={'server/whatsapp.mjs':'9d7335c29c2baf1e6ac07b420d824da29eb499db','server/zip-data-api.mjs':'920865958617c9beb26762a0b61e6000911a0ed3','dist/assets/js/whatsapp-inbox.js':'1b29c19e6dd773bf3f8a59cc361273c187065fbf'}
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
for n,h in expected.items():assert blob((root/n).read_bytes()) in {h,blob((source/n).read_bytes())},'Hay cambios adicionales en '+n
assert (source/'public/assets/js/whatsapp-inbox.js').read_bytes()==(source/'dist/assets/js/whatsapp-inbox.js').read_bytes()
subprocess.run(['node','--test','tests/whatsapp.test.mjs','tests/zip-data.test.mjs','tests/security.test.mjs','tests/products-360.test.mjs'],cwd=source,check=True)
for n in expected:subprocess.run(['node','--check',str(source/n)],check=True)
pid=subprocess.check_output(['systemctl','show','tvs','--property=MainPID','--value'],text=True).strip();assert pid!='0'
env=dict(os.environ)
for item in Path('/proc/'+pid+'/environ').read_bytes().split(b'\0'):
 if b'=' in item:
  k,v=item.split(b'=',1);env[k.decode()]=v.decode()
backup=Path('/var/backups/tvs')/('whatsapp-shared-'+time.strftime('%Y%m%d-%H%M%S'));backup.mkdir(mode=0o700)
for n in expected:
 p=backup/n;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/n,p)
def node(code):return subprocess.check_output(['runuser','-u','tvs','--','node','--input-type=module','-e',code],cwd=root,env=env,text=True)
header="""import {createRequire} from 'node:module';const {Pool}=createRequire('/opt/tvs/package.json')('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:10000});"""
def fetch(path):
 req=urllib.request.Request('https://tvssancris.com/'+path+'?shared_check='+str(time.time_ns()),headers={'Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=25) as r:return r.read()
captcha=fetch('api/security/public');portal=fetch('portal-gys-v6.html');stopped=False
try:
 subprocess.run(['systemctl','stop','tvs'],check=True);stopped=True
 snapshot=node(header+"try{console.log(JSON.stringify({leads:(await pool.query(\"SELECT * FROM crm.zip_records WHERE bucket='leads'\")).rows,threads:(await pool.query('SELECT id,owner_id,lead_id FROM crm.wa_threads')).rows}));}finally{await pool.end();}")
 (backup/'db-before.json').write_text(snapshot);(backup/'db-before.json').chmod(0o600)
 for n in expected:
  dst=root/n;tmp=dst.with_name(dst.name+'.shared-new');tmp.write_bytes((source/n).read_bytes());tmp.chmod(0o644);os.replace(tmp,dst)
 # Backfill is transactional and idempotent. It never reads or changes the pairing state.
 probe=header+"""import {createZipDataAPI} from '/opt/tvs/server/zip-data-api.mjs';
 const db={pool,query:(q,v)=>pool.query(q,v)},api=createZipDataAPI(db);try{await api.whatsapp.backfill();const r=await pool.query("SELECT count(*)::int AS missing FROM crm.wa_threads w LEFT JOIN crm.zip_records z ON z.bucket='leads' AND z.record_id=w.lead_id AND z.deleted_at IS NULL WHERE z.record_id IS NULL");if(r.rows[0].missing!==0)throw Error('Hay conversaciones sin lead activo');console.log('WHATSAPP_AUTO_LEADS_VERIFIED');}finally{await api.whatsapp.close();await pool.end();}
 """
 print(node(probe).strip(),flush=True)
 subprocess.run(['systemctl','start','tvs'],check=True);stopped=False
 healthy=False
 for attempt in range(15):
  try:
   assert json.loads(fetch('api/zip/state')).get('project')=='wvhzqukukzzwoevbgare'
   try:fetch('api/zip/whatsapp/threads');raise AssertionError('Acceso sin sesión')
   except urllib.error.HTTPError as e:assert e.code==401
   healthy=True;break
  except Exception:time.sleep(1)
 assert healthy,'No se confirmó la salud del servicio.'
 assert fetch('api/security/public')==captcha and fetch('portal-gys-v6.html')==portal,'Cambió el portal o CAPTCHA.'
 assert fetch('assets/js/whatsapp-inbox.js')==(source/'dist/assets/js/whatsapp-inbox.js').read_bytes()
 print('WHATSAPP_SHARED_DEPLOY_VERIFIED; sesión conservada; respaldo:',backup,flush=True)
except Exception:
 for n in expected:shutil.copy2(backup/n,root/n)
 subprocess.run(['systemctl','start' if stopped else 'restart','tvs'],check=False)
 print('Archivos anteriores restaurados. Respaldo de leads y responsables:',backup,flush=True);raise
