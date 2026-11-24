/* First-party photo sequence, confined to the original motorcycle gallery/editor. */
(function () {
'use strict';
const MAX_FRAMES=72, MAX_IMAGE_CHARS=190000;
function safeImage(value){
 return typeof value==='string' && value.length<=MAX_IMAGE_CHARS && (/^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || /^\/assets\/(?!.*(?:\.\.|\/\/))[A-Za-z0-9_./-]+\.(?:webp|png|jpe?g)$/i.test(value));
}
function frames(value){return Array.isArray(value)?[...new Set(value.filter(safeImage))].slice(0,MAX_FRAMES):[];}
function normalize(value){
 const v=value&&typeof value==='object'?value:{};
 return {enabled:v.enabled===true,frames:frames(v.frames),colors:(Array.isArray(v.colors)?v.colors:[]).slice(0,30).map(c=>({name:String(c.name||'').slice(0,80),hex:String(c.hex||'').slice(0,20),frames:frames(c.frames)}))};
}
function selectSequence(value,color){
 const c=normalize(value),name=String(color?.name||'').trim().toLowerCase(),hex=String(color?.hex||'').toLowerCase();
 if(!c.enabled)return {frames:[],label:''};
 const byName=c.colors.filter(x=>x.name.trim().toLowerCase()===name);
 const byHex=c.colors.filter(x=>x.hex.toLowerCase()===hex);
 const exact=byName.find(x=>x.hex.toLowerCase()===hex);
 const group=exact||(byName.length===1?byName[0]:null)||(hex&&byHex.length===1?byHex[0]:null);
 if(group&&group.frames.length>=2)return {frames:group.frames,label:group.name||'Color seleccionado'};
 return c.frames.length>=2?{frames:c.frames,label:'Secuencia general del modelo'}:{frames:[],label:''};
}
function step(index,amount,count){return count>0?((index+amount)%count+count)%count:0;}
function reorder(list,from,to){const copy=list.slice();if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=copy.length||to>=copy.length)return copy;copy.splice(to,0,copy.splice(from,1)[0]);return copy;}
function valid(value){const c=normalize(value),sets=[c.frames,...c.colors.map(x=>x.frames)];return !c.enabled||(sets.some(x=>x.length>=2)&&sets.every(x=>x.length!==1));}
const core={safeImage,normalize,selectSequence,step,reorder,valid};
if(typeof module==='object'&&module.exports)module.exports=core;
if(typeof document==='undefined')return;
if(window.TVSPhotoSequence)return;
window.TVSPhotoSequence=core;
let session=null;
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function element(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function control(text,label){const b=element('button','',text);b.type='button';if(label)b.setAttribute('aria-label',label);return b;}
function getBikes(){return typeof bikes!=='undefined'&&Array.isArray(bikes)?bikes:[];}
function selectedBike(){return typeof selected!=='undefined'?selected:null;}
function closeFullscreen(gallery){if(document.fullscreenElement===gallery&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});}
function attachGallery(gallery,bike,colorIndex,sequence){
 const abort=new AbortController(),signal=abort.signal;
 const entry=control('360° · Ver en 360°','Ver secuencia 360 de '+bike.name);entry.className='rb360-entry';gallery.appendChild(entry);
 let layer=null,index=0,zoom=1,drag=null;
 const current={gallery,bike,colorIndex,on:false,destroy(){abort.abort();closeFullscreen(gallery);gallery.classList.remove('rb360-active');entry.remove();layer?.remove();}};
 function stop(){current.on=false;layer?.remove();layer=null;gallery.classList.remove('rb360-active');closeFullscreen(gallery);entry.focus();}
 function start(){
  if(layer)return;
  current.on=true;gallery.classList.add('rb360-active');
  layer=element('div','rb360-layer');layer.setAttribute('role','group');layer.setAttribute('aria-label','Vista 360 por fotografías de '+bike.name);
  layer.innerHTML='<div class="rb360-view" tabindex="0" role="group" aria-label="Arrastrá horizontalmente o usá las flechas para girar"><img draggable="false" alt="'+html(bike.name)+'"><p class="rb360-image-error" hidden>No se pudo cargar este ángulo. Probá otra imagen.</p></div><div class="rb360-controls"><div class="rb360-actions"></div><label class="rb360-range-label">Ángulo de la moto<input type="range" min="0" max="'+(sequence.frames.length-1)+'" value="0" aria-label="Ángulo de la moto"></label><p class="rb360-status" aria-live="polite"></p><p class="rb360-hint">Arrastrá para girar · '+html(sequence.label)+'</p></div>';
  const view=layer.querySelector('.rb360-view'),img=layer.querySelector('img'),range=layer.querySelector('input'),actions=layer.querySelector('.rb360-actions');
  const prev=control('‹','Ángulo anterior'),next=control('›','Ángulo siguiente'),less=control('−','Alejar imagen 360'),more=control('+','Acercar imagen 360'),back=control('Volver a fotos');
  actions.append(prev,next,less,more,back);
  if(gallery.requestFullscreen){const expand=control('Ampliar','Ampliar vista 360');actions.append(expand);expand.onclick=()=>{gallery.requestFullscreen().catch(()=>{layer.querySelector('.rb360-status').textContent='No se pudo ampliar. Podés seguir usando esta vista.';});};}
  function paint(){
   img.hidden=false;layer.querySelector('.rb360-image-error').hidden=true;
   img.src=sequence.frames[index];img.style.transform='scale('+zoom+')';img.alt=bike.name+', ángulo '+(index+1)+' de '+sequence.frames.length;
   range.value=String(index);range.setAttribute('aria-valuetext','Imagen '+(index+1)+' de '+sequence.frames.length);
   layer.querySelector('.rb360-status').textContent=(index+1)+' / '+sequence.frames.length+' · Zoom '+Math.round(zoom*100)+'%';
   less.disabled=zoom<=1;more.disabled=zoom>=2;
   [-1,1].forEach(n=>{const preload=new Image();preload.src=sequence.frames[step(index,n,sequence.frames.length)];});
  }
  function move(n){index=step(index,n,sequence.frames.length);paint();}
  img.addEventListener('error',()=>{img.hidden=true;layer?.querySelector('.rb360-image-error')?.removeAttribute('hidden');},{signal});
  prev.onclick=()=>move(-1);next.onclick=()=>move(1);back.onclick=stop;
  less.onclick=()=>{zoom=Math.max(1,Math.round((zoom-.25)*100)/100);paint();};more.onclick=()=>{zoom=Math.min(2,Math.round((zoom+.25)*100)/100);paint();};
  range.oninput=()=>{index=Number(range.value);paint();};
  view.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;drag={id:e.pointerId,start:e.clientX,index};view.setPointerCapture(e.pointerId);},{signal});
  view.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const delta=Math.trunc((e.clientX-drag.start)/9);const target=step(drag.index,-delta,sequence.frames.length);if(target!==index){index=target;paint();}},{signal});
  const end=e=>{if(drag?.id===e.pointerId)drag=null;};view.addEventListener('pointerup',end,{signal});view.addEventListener('pointercancel',end,{signal});view.addEventListener('lostpointercapture',()=>{drag=null;},{signal});
  view.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();if(e.key==='Home')index=0;else if(e.key==='End')index=sequence.frames.length-1;else index=step(index,e.key==='ArrowLeft'?-1:1,sequence.frames.length);paint();},{signal});
  gallery.appendChild(layer);paint();view.focus();
 }
 entry.addEventListener('click',start,{signal});current.start=start;return current;
}
function syncGallery(){
 const modal=document.getElementById('bikeModal'),gallery=modal?.classList.contains('open')?modal.querySelector('.rb-gallery'):null,bike=selectedBike();
 const colorIndex=modal?Math.max(0,[...modal.querySelectorAll('.rb-color')].findIndex(b=>b.classList.contains('active'))):0;
 if(session&&session.gallery===gallery&&session.bike===bike&&session.colorIndex===colorIndex)return;
 const keepOpen=!!session?.on;session?.destroy();session=null;
 if(!gallery||!bike)return;
 const sequence=selectSequence(bike.spin360,(bike.colors||[])[colorIndex]);
 if(sequence.frames.length<2)return;
 session=attachGallery(gallery,bike,colorIndex,sequence);if(keepOpen)session.start();
}
async function optimize(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Usá únicamente fotos JPG, PNG o WEBP.');
 if(file.size>15*1024*1024)throw Error('Cada foto debe pesar menos de 15 MB.');
 const url=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('No se pudo leer '+file.name));img.src=url;});
  if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>50000000)throw Error('La imagen es demasiado grande o no es válida.');
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('Este navegador no permite optimizar las fotos.');
  for(const max of [800,640]){
   const ratio=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
   for(const quality of [.72,.55,.4]){const data=canvas.toDataURL('image/webp',quality);if(data.length<=60000&&safeImage(data))return data;}
  }
  throw Error('No se pudo reducir '+file.name+' al tamaño adecuado. Usá una foto más liviana.');
 }finally{URL.revokeObjectURL(url);}
}
function addEditor(index){
 const form=document.getElementById('bikeAdminForm');if(!form||form.querySelector('.rb360-admin'))return;
 const bike=index!==''&&index!==undefined?getBikes()[Number(index)]:null;
 const config=normalize(bike?.spin360);let scope='general',busy=false;
 const field=element('fieldset','rb360-admin full');
 field.innerHTML='<legend>360° por secuencia de fotos</legend><label class="rb360-enable"><input type="checkbox" '+(config.enabled?'checked':'')+'> Activar 360° para este modelo</label><p>Cargá fotos de la misma moto desde distintos ángulos, cubriendo una vuelta completa. Recomendamos 24–36 imágenes numeradas 01, 02, 03… No se genera un giro real a partir de una sola foto.</p><label>Secuencia a administrar<select class="rb360-scope"></select></label><div class="rb360-upload-actions"><label class="rb360-upload">Agregar fotos<input type="file" multiple accept="image/jpeg,image/png,image/webp"></label><button type="button" class="rb360-clear">Vaciar esta secuencia</button></div><p class="rb360-count" aria-live="polite"></p><div class="rb360-admin-grid"></div><p class="rb360-admin-status" role="status" aria-live="polite"></p><p class="rb360-admin-error" role="alert"></p><input type="hidden" name="spin360">';
 const actions=form.querySelector('.form-actions');form.insertBefore(field,actions?.parentNode===form?actions:null);
 const select=field.querySelector('select'),enabled=field.querySelector('[type=checkbox]'),upload=field.querySelector('[type=file]'),grid=field.querySelector('.rb360-admin-grid'),error=field.querySelector('[role=alert]'),status=field.querySelector('[role=status]'),hidden=field.querySelector('[name=spin360]');
 function editorColors(){return window.__rbBikeMedia?.colors||bike?.colors||[];}
 function renderScopes(){
  const colors=editorColors();
  select.replaceChildren();const general=document.createElement('option');general.value='general';general.textContent='General del modelo';select.append(general);
  colors.forEach((c,i)=>{const opt=document.createElement('option');opt.value=String(i);opt.textContent=c.name||'Color '+(i+1);select.append(opt);});
  if(scope!=='general'&&!colors[Number(scope)])scope='general';select.value=scope;
 }
 function group(){
  if(scope==='general')return config.frames;
  const c=editorColors()[Number(scope)];if(!c)return config.frames;
  let target=config.colors.find(x=>x.name===c.name&&x.hex===c.hex);
  if(!target){const matches=config.colors.filter(x=>x.name===c.name);if(matches.length===1){target=matches[0];target.hex=c.hex||'';}else{target={name:c.name||'',hex:c.hex||'',frames:[]};config.colors.push(target);}}
  return target.frames;
 }
 function store(){config.enabled=enabled.checked;hidden.value=JSON.stringify(config);}
 function render(){
  const list=group();grid.innerHTML=list.map((src,i)=>'<div class="rb360-thumb"><span>'+(i+1)+'</span><img loading="lazy" src="'+html(src)+'" alt="Ángulo '+(i+1)+'"><div><button type="button" data-spin-move="-1" data-index="'+i+'" aria-label="Mover imagen '+(i+1)+' antes" '+(i===0?'disabled':'')+'>‹</button><button type="button" data-spin-move="1" data-index="'+i+'" aria-label="Mover imagen '+(i+1)+' después" '+(i===list.length-1?'disabled':'')+'>›</button><button type="button" data-spin-remove="'+i+'" aria-label="Quitar imagen '+(i+1)+'">Quitar</button></div></div>').join('');
  field.querySelector('.rb360-count').textContent=list.length+' fotos · Máximo '+MAX_FRAMES+' por secuencia'+(list.length===1?' · Agregá al menos otro ángulo.':'');store();
 }
 select.addEventListener('focus',renderScopes);select.onchange=()=>{scope=select.value;error.textContent='';render();};enabled.onchange=store;
 grid.onclick=e=>{if(busy)return;const move=e.target.closest('[data-spin-move]'),remove=e.target.closest('[data-spin-remove]'),list=group();if(move){const i=Number(move.dataset.index),next=reorder(list,i,i+Number(move.dataset.spinMove));list.splice(0,list.length,...next);render();}if(remove){list.splice(Number(remove.dataset.spinRemove),1);render();}};
 field.querySelector('.rb360-clear').onclick=()=>{if(!busy){group().splice(0);error.textContent='';render();}};
 upload.onchange=async()=>{
  if(busy)return;const files=[...upload.files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));if(!files.length)return;
  const list=group();if(list.length+files.length>MAX_FRAMES){error.textContent='Podés cargar hasta '+MAX_FRAMES+' fotos por secuencia.';upload.value='';return;}
  busy=true;upload.disabled=true;select.disabled=true;error.textContent='';
  try{
   const converted=[];for(let i=0;i<files.length;i++){status.textContent='Optimizando foto '+(i+1)+' de '+files.length+'…';converted.push(await optimize(files[i]));if(!form.isConnected)return;}
   const previous=list.slice();list.splice(0,list.length,...frames([...list,...converted]));
   if(JSON.stringify(config).length>5*1024*1024){list.splice(0,list.length,...previous);throw Error('Las secuencias de este modelo superan 5 MB. Cargá menos fotos o imágenes más livianas.');}
   render();status.textContent='Fotos listas. Guardá el modelo para publicarlas.';
  }catch(e){error.textContent=e.message;status.textContent='No se agregó esta carga. Las fotos anteriores se conservan.';}
  finally{busy=false;upload.disabled=false;select.disabled=false;upload.value='';}
 };
 const original=form.onsubmit;
 form.onsubmit=function(e){
  error.textContent='';if(busy){e.preventDefault();error.textContent='Esperá a que terminen de optimizarse las fotos.';return;}
  store();if(!valid(config)){e.preventDefault();error.textContent='Para activar el 360° cargá al menos dos ángulos distintos. Cada secuencia con fotos debe tener al menos dos.';return;}
  const proposed=getBikes().map((b,i)=>i===Number(index)&&index!==''?{...b,spin360:config}:b);if(index===''||index===undefined)proposed.unshift({spin360:config});
  const bytes=new TextEncoder().encode(JSON.stringify({kind:'setting',key:'tvsCatalog',value:JSON.stringify(proposed),version:0})).length;
  if(bytes>11*1024*1024){e.preventDefault();error.textContent='El catálogo supera el tamaño permitido. Reducí las fotos de las secuencias antes de guardar.';return;}
  return original.call(this,e);
 };
 renderScopes();render();
}
function init(){
 const original=window.showBikeForm;if(typeof original==='function')window.showBikeForm=function(index){original.apply(this,arguments);addEditor(index);};
 const choose=window.rbChooseColor;if(typeof choose==='function')window.rbChooseColor=function(){choose.apply(this,arguments);syncGallery();};
 const modal=document.getElementById('bikeModal');if(modal)new MutationObserver(syncGallery).observe(modal,{childList:true,subtree:true});
 syncGallery();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
