"""Deploy the V60 data adapter onto the existing VPS after checking real Supabase access."""
from pathlib import Path
import os,json,shutil,subprocess,time,urllib.request,hashlib
source=Path('/opt/tvs-release-20261111')
root=Path('/opt/tvs')
backup=Path('/var/backups/tvs')/('v60-supabase-'+time.strftime('%Y%m%d-%H%M%S'))
backup.mkdir(mode=0o700)
security=root/'server/security.mjs'
old=security.read_text()
assert old.count('let handler,db;')==1,'Inspect the current server entrypoint first'
assert old.count('db=createDatabase();')==1
start=old.index('apiHandler:')
end=old.index(',authorizeAdmin',start)
callback=old[start:end]
prefix='apiHandler:(...args)=>'
assert callback.startswith(prefix)
patched=old.replace('let handler,db;','let handler,db,zipHandler;',1)
patched=patched.replace(callback,'apiHandler:async(...args)=>(await zipHandler?.(...args))||(await ('+callback[len(prefix):]+'))||false',1)
patched=patched.replace('db=createDatabase();',"db=createDatabase();zipHandler=(await import('./zip-data-api.mjs')).createZipDataAPI(db,{verifyCaptcha:app.verifyCaptcha});",1)
shutil.copy2(security,backup/'security.mjs')
module=root/'server/zip-data-api.mjs'
if module.exists():shutil.copy2(module,backup/'zip-data-api.mjs')
shutil.copyfile(source/'server/zip-data-api.mjs',module);module.chmod(0o644)
tests=root/'tests';tests.mkdir(exist_ok=True);tests.chmod(0o755)
diagnostic=tests/'zip-live-transaction.mjs'
shutil.copyfile(source/'tests/zip-live-transaction.mjs',diagnostic);diagnostic.chmod(0o644)
pid=subprocess.check_output(['systemctl','show','tvs','--property=MainPID','--value'],text=True).strip()
env=dict(os.environ)
for item in Path('/proc/'+pid+'/environ').read_bytes().split(b'\0'):
 if b'=' in item:
  k,v=item.split(b'=',1);env[k.decode()]=v.decode()
subprocess.run(['runuser','-u','tvs','--','node',str(diagnostic)],cwd=root,env=env,check=True)
key=Path(env.get('SECURITY_DATA_DIR',str(root/'private')))/'zip-data.key'
if key.exists():shutil.copyfile(key,backup/'zip-data.key');(backup/'zip-data.key').chmod(0o600)
ready=root/'dist-supabase-ready';assert not ready.exists()
shutil.copytree(source/'dist',ready)
for p in ready.rglob('*'):p.chmod(0o755 if p.is_dir() else 0o644)
ready.chmod(0o755)
candidate=security.with_suffix('.candidate.mjs');candidate.write_text(patched);candidate.chmod(0o644)
subprocess.run(['node','--check',str(candidate)],check=True)
def fetch(path):
 with urllib.request.urlopen('https://tvssancris.com/'+path,timeout=30) as response:return response.read()
captcha_before=fetch('api/security/public')
os.rename(root/'dist',backup/'dist')
try:
 os.rename(ready,root/'dist');os.replace(candidate,security)
 subprocess.run(['systemctl','restart','tvs'],check=True)
 # A restart can briefly leave the reverse proxy waiting for the application.
 healthy=False
 for attempt in range(10):
  try:
   state=json.loads(fetch('api/zip/state'))
   if state.get('project')=='wvhzqukukzzwoevbgare' and state.get('user') is None:healthy=True;break
  except Exception:time.sleep(1)
 assert healthy,'The new data API did not become healthy'
 assert fetch('api/security/public')==captcha_before,'CAPTCHA configuration changed'
 count=0
 for p in (source/'dist').rglob('*'):
  if p.is_file():
   name=str(p.relative_to(source/'dist'))
   assert hashlib.sha256(fetch(name)).digest()==hashlib.sha256(p.read_bytes()).digest(),name
   count+=1
 commit=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
 report={'project':state['project'],'public_files_verified':count,'captcha_preserved':True,'database_transaction_test':'passed','commit':commit}
 (backup/'verification.json').write_text(json.dumps(report,indent=2))
 (root/'DEPLOYED_VERSION').write_text(json.dumps(report,indent=2))
 print('V60_SUPABASE_DEPLOY_VERIFIED',json.dumps(report))
except Exception:
 if (root/'dist').exists():os.rename(root/'dist',root/('dist-failed-'+time.strftime('%H%M%S')))
 os.rename(backup/'dist',root/'dist');shutil.copy2(backup/'security.mjs',security)
 subprocess.run(['systemctl','restart','tvs'],check=True)
 print('PREVIOUS_VERSION_RESTORED')
 raise
