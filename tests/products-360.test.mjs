import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('public/assets/js/products-360.js', root), 'utf8');
const context = { module: { exports: {} } };
vm.runInNewContext(source, context);
const { viewerUrl, enabled, category, escapeHtml } = context.module.exports;
const id = '98b4185db6154cffb54e41aa0888b708';
const canonical = 'https://sketchfab.com/models/' + id + '/embed';
test('official model and embed links normalize to one HTTPS origin', () => {
 assert.equal(viewerUrl('https://sketchfab.com/3d-models/tvs-apache-rtr-200-4v-' + id), canonical);
 assert.equal(viewerUrl(canonical + '?autostart=1#anything'), canonical);
 assert.equal(viewerUrl('https://www.sketchfab.com/models/' + id), canonical);
});
for (const value of [
 'http://sketchfab.com/models/' + id,
 'https://sketchfab.com.evil.test/models/' + id,
 'https://sketchfab.com@evil.test/models/' + id,
 'https://sketchfab.com:443/models/' + id,
 'javascript:alert(1)', 'data:text/html,test',
 '<iframe src="' + canonical + '"></iframe>',
 'https://youtube.com/models/' + id, 'https://sketchfab.com/models/123/embed'
]) test('reject unsupported viewer: ' + value, () => assert.equal(viewerUrl(value), ''));
test('a valid URL alone never enables a public viewer', () => {
 assert.equal(enabled({ viewer360Url: canonical }), false);
 assert.equal(enabled({ viewer360Enabled: false, viewer360Url: canonical }), false);
 assert.equal(enabled({ viewer360Enabled: 'true', viewer360Url: canonical }), false);
 assert.equal(enabled({ viewer360Enabled: true, viewer360Url: 'javascript:bad' }), false);
 assert.equal(enabled({ viewer360Enabled: true, viewer360Url: canonical }), true);
});
test('catalog categories preserve existing classifications', () => {
 assert.equal(category({ cat: 'sport' }), 'moto');
 assert.equal(category({ cat: 'trabajo' }), 'moto');
 assert.equal(category({ cat: 'king' }), 'king');
 assert.equal(category({ cat: 'semiautomatico' }), 'semiautomatico');
});
test('catalog strings are escaped before HTML rendering', () => {
 assert.equal(escapeHtml('<img src=x onerror="bad">'), '&lt;img src=x onerror=&quot;bad&quot;&gt;');
});
test('public and deployment copies match and admin persists both viewer fields', () => {
 for (const path of ['portal-gys-v6.html', 'assets/js/products-360.js', 'assets/css/products-360.css']) {
  assert.equal(readFileSync(new URL('public/' + path, root), 'utf8'), readFileSync(new URL('dist/' + path, root), 'utf8'));
 }
 const html = readFileSync(new URL('public/portal-gys-v6.html', root), 'utf8');
 assert.ok(html.includes("viewer360Enabled:f.get('viewer360Enabled')==='on'"));
 assert.ok(html.includes("viewer360Url:String(f.get('viewer360Url')||'')"));
 assert.ok(html.indexOf('assets/js/products-360.js') < html.indexOf('</head>'));
 assert.ok(source.includes('window.openBike(b.name)'));
});
