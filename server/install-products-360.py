"""Install only the products UI; preserve database, server, AI, CAPTCHA and rich detail flows."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request

root = Path('/opt/tvs')
source = Path(__file__).resolve().parent.parent
portal = 'dist/portal-gys-v6.html'
files = [portal, 'dist/assets/js/products-360.js', 'dist/assets/css/products-360.css']
expected_portals = {'2efe1f3ffcb78b2ad9e237204c1cf28b3737cfd9', '03120329bcbdbf01a6940ac27f55e7b78f5241e9'}

def blob_hash(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

def fetch(path):
    req = urllib.request.Request('https://tvssancris.com/' + path + '?products_check=' + str(time.time_ns()), headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read()

def atomic_copy(src, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.products-', dir=dst.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(src.read_bytes())
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, dst)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

assert os.geteuid() == 0, 'Ejecutá este instalador como root.'
assert root != source, 'Usá el checkout de actualización, no la aplicación en producción.'
for name in files:
    assert (source / name).is_file(), 'Falta el archivo: ' + name
if all((root / name).is_file() and (root / name).read_bytes() == (source / name).read_bytes() for name in files):
    for name in files:
        assert fetch(name[5:]) == (source / name).read_bytes(), 'Revisá la publicación HTTP: ' + name
    print('PRODUCTS_360_VERIFIED: la misma versión ya está publicada.')
    raise SystemExit(0)
assert blob_hash((root / portal).read_bytes()) in expected_portals | {blob_hash((source / portal).read_bytes())}, 'La web instalada tiene otros cambios. No se sobrescribió nada; revisá la versión antes de instalar.'
for name in ['assets/js/products-360.js', 'assets/css/products-360.css']:
    assert (source / 'public' / name).read_bytes() == (source / 'dist' / name).read_bytes(), 'Las copias public/dist no coinciden.'
assert (source / 'public/portal-gys-v6.html').read_bytes() == (source / portal).read_bytes()
subprocess.run(['node', '--check', str(source / 'dist/assets/js/products-360.js')], check=True)
subprocess.run(['node', '--test', str(source / 'tests/products-360.test.mjs')], cwd=source, check=True)
captcha_before = fetch('api/security/public')
backup = Path('/var/backups/tvs') / ('products360-' + time.strftime('%Y%m%d-%H%M%S') + '-' + str(os.getpid()))
backup.mkdir(parents=True, mode=0o700)
existed = {name: (root / name).exists() for name in files}
for name in files:
    if existed[name]:
        saved = backup / name
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / name, saved)
(backup / 'manifest.json').write_text(json.dumps(existed, indent=2))
try:
    # Publish dependencies first and the referencing page last.
    for name in [files[1], files[2], files[0]]:
        atomic_copy(source / name, root / name)
    for name in files:
        assert fetch(name[5:]) == (source / name).read_bytes(), 'El servidor no entrega la versión nueva: ' + name
    assert fetch('api/security/public') == captcha_before, 'La configuración de reCAPTCHA cambió durante la instalación.'
    print('PRODUCTS_360_DEPLOY_VERIFIED; respaldo:', backup)
    print('Configurá el enlace Sketchfab de cada modelo en Admin > Administrar catálogo > Editar.')
except Exception:
    for name in files:
        if existed[name]:
            atomic_copy(backup / name, root / name)
        elif (root / name).exists():
            (root / name).unlink()
    print('Se restauraron los archivos anteriores. Respaldo:', backup)
    raise

