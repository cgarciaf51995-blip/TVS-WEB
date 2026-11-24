import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('public/assets/js/sequence-360.js',root),'utf8');
const context={module:{exports:{}}};vm.runInNewContext(source,context);
const {safeImage,normalize,selectSequence,step,reorder,valid}=context.module.exports;
const photo=n=>'data:image/webp;base64,'+Buffer.from('angle-'+n).toString('base64');
const a=photo(1),b=photo(2),c=photo(3);
test('accepts uploaded images and local assets; never loads third-party viewers',()=>{
 assert.ok(safeImage(a));assert.ok(safeImage('/assets/motos/frame-01.webp'));
 for(const url of ['https://sketchfab.com/models/anything/embed','https://other.test/frame.jpg','javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','/assets/../private/file.png','//other.test/assets/frame.png'])assert.equal(safeImage(url),false,url);
});
test('filters invalid and duplicate frames; caps per-sequence count',()=>{
 const cfg=normalize({enabled:'true',frames:[a,a,b,'javascript:bad'],colors:[]});
 assert.equal(cfg.enabled,false);assert.equal(cfg.frames.length,2);assert.equal(cfg.frames[1],b);
 assert.equal(normalize({frames:Array.from({length:90},(_,i)=>photo(i))}).frames.length,72);
});
test('does not fabricate a spin from one photograph',()=>{
 assert.equal(selectSequence({enabled:true,frames:[a]},{}).frames.length,0);
 assert.equal(valid({enabled:true,frames:[a]}),false);
 assert.equal(valid({enabled:true,frames:[]}),false);
 assert.equal(valid({enabled:true,frames:[a,b]}),true);
 assert.equal(valid({enabled:false,frames:[a]}),true);
});
test('disabled sequences never expose a public viewer',()=>assert.equal(selectSequence({enabled:false,frames:[a,b]},{}).frames.length,0));
test('selects the matching color and labels the general fallback',()=>{
 const cfg={enabled:true,frames:[a,b],colors:[{name:'Rojo',hex:'#ff0000',frames:[c,a]}]};
 assert.equal(selectSequence(cfg,{name:'Rojo',hex:'#ff0000'}).frames[0],c);
 assert.equal(selectSequence(cfg,{name:'Azul',hex:'#0000ff'}).label,'Secuencia general del modelo');
 assert.equal(selectSequence(cfg,{name:'Rojo',hex:'#ff0000'}).label,'Rojo');
});
test('retains a color sequence after a unique name or hex edit',()=>{
 const cfg={enabled:true,colors:[{name:'Rojo',hex:'#ff0000',frames:[a,b]}]};
 assert.equal(selectSequence(cfg,{name:'Rojo',hex:'#ee0000'}).frames.length,2);
 assert.equal(selectSequence(cfg,{name:'Rojo intenso',hex:'#ff0000'}).frames.length,2);
});
test('does not use a different color when no general sequence exists',()=>{
 assert.equal(selectSequence({enabled:true,colors:[{name:'Rojo',hex:'#ff0000',frames:[a,b]}]},{name:'Azul',hex:'#0000ff'}).frames.length,0);
});
test('wraps frame navigation in both directions',()=>{
 assert.equal(step(0,-1,24),23);assert.equal(step(23,1,24),0);assert.equal(step(2,50,24),4);assert.equal(step(0,1,0),0);
});
test('reorders without modifying or dropping source photographs',()=>{
 const initial=[a,b,c],moved=reorder(initial,2,0);assert.equal(moved.join('|'),[c,a,b].join('|'));assert.equal(initial.join('|'),[a,b,c].join('|'));
 assert.equal(reorder(initial,0,-1).join('|'),initial.join('|'));assert.equal(reorder(initial,0,3).join('|'),initial.join('|'));
});
test('rejects an incomplete color sequence while enabled',()=>assert.equal(valid({enabled:true,frames:[a,b],colors:[{name:'Rojo',frames:[a]}]}),false));
test('public and production assets match',()=>{
 for(const path of ['portal-gys-v6.html','assets/js/sequence-360.js','assets/css/sequence-360.css'])assert.deepEqual(readFileSync(new URL('public/'+path,root)),readFileSync(new URL('dist/'+path,root)));
});
test('removes the new navigation/showroom and preserves original rich detail code byte for byte',()=>{
 let html=readFileSync(new URL('public/portal-gys-v6.html',root),'utf8');
 assert.ok(!html.includes('assets/js/products-360.js'));assert.ok(!html.includes('assets/css/products-360.css'));
 assert.ok(html.includes('assets/js/sequence-360.js'));assert.ok(html.includes("spin360:JSON.parse(f.get('spin360')||'null')"));
 html=html.replace('<link rel="stylesheet" href="assets/css/sequence-360.css?v=20261124">\n<script defer src="assets/js/sequence-360.js?v=20261124"></script>\n','').replace(",spin360:JSON.parse(f.get('spin360')||'null')",'');
 const data=Buffer.from(html),hash=createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex');
 assert.equal(hash,'2efe1f3ffcb78b2ad9e237204c1cf28b3737cfd9','Original page, rich modal, pricing and payment code must stay unchanged.');
});
