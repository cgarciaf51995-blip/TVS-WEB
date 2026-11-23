/* External 360 viewers and product navigation. Original detail/quote flows remain authoritative. */
(function () {
'use strict';
function viewerUrl(value) {
 var v=String(value||'').trim();
 var m=v.match(/^https:\/\/(?:www\.)?sketchfab\.com\/(?:3d-models\/[a-zA-Z0-9_-]*-([a-f0-9]{32})|models\/([a-f0-9]{32})(?:\/embed)?)\/?(?:\?[^#\s<>"]*)?(?:#[^\s<>"]*)?$/i);
 return m?'https://sketchfab.com/models/'+(m[1]||m[2]).toLowerCase()+'/embed':'';
}
function category(b) {
 var c=String(b.cat||'').toLowerCase();
 return c==='scooter'?'scooter':c==='king'?'king':c==='semiautomatico'?'semiautomatico':c==='accesorios'?'accesorios':'moto';
}
function enabled(b){return b.viewer360Enabled===true && !!viewerUrl(b.viewer360Url);}
function escapeHtml(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
var core={viewerUrl:viewerUrl,category:category,enabled:enabled,escapeHtml:escapeHtml};
if(typeof module==='object'&&module.exports)module.exports=core;
if(typeof document==='undefined')return;
if(window.TVSProducts360)return;
window.TVSProducts360=core;
var esc=escapeHtml,menu,explorer,viewer,modelIndex=0,filter='all',returnFocus,menuButton;
var groups=[['moto','MOTOCICLETAS'],['scooter','SCOOTER'],['semiautomatico','SEMIAUTOMÁTICAS'],['king','3 RUEDAS'],['all','VER TODO']];
function catalog(){return typeof bikes!=='undefined'&&Array.isArray(bikes)?bikes:[];}
function filtered(){return catalog().map(function(b,i){return {bike:b,index:i};}).filter(function(x){return filter==='all'||category(x.bike)===filter;});}
function image(b){return b.img||(b.images||[])[0]||'';}
function button(text,action,extra){return '<button type="button" data-p360-action="'+action+'" '+(extra||'')+'>'+text+'</button>';}
function tabs(){return '<div class="p360-tabs" role="group" aria-label="Categorías de productos">'+groups.map(function(g){return '<button type="button" data-p360-category="'+g[0]+'" aria-pressed="'+(filter===g[0])+'">'+g[1]+'</button>';}).join('')+'</div>';}
function brand(){var b=document.querySelector('.proposal-brand');return '<a class="p360-brand" href="#inicio"><img src="'+esc((b&&b.querySelector('img')||{}).src||'https://res.cloudinary.com/dpirevtt3/image/upload/logo_header.png')+'" alt="TVS"><span><strong>SAN CRISTÓBAL TVS</strong><small>San Cristóbal · Guatemala</small></span></a>';}
function lock(){document.documentElement.classList.toggle('p360-open',!!explorer||!!viewer);}
function refreshMenu(){
 if(!menu)return;
 menu.innerHTML=tabs()+'<div class="p360-grid">'+(filtered().map(function(x){var b=x.bike;return '<article class="p360-card"><button type="button" class="p360-card-main" data-p360-model="'+x.index+'"><strong>'+esc(b.name)+'</strong><img loading="lazy" src="'+esc(image(b))+'" alt="'+esc(b.name)+'"><span>'+esc(b.cc||'')+'</span></button>'+(enabled(b)?button('360°','viewer','data-p360-index="'+x.index+'" class="p360-badge" aria-label="Explorar '+esc(b.name)+' en 360 grados"'):'')+'</article>';}).join('')||'<p>No hay modelos en esta categoría.</p>')+'</div>';
}
function closeMenu(){if(menu)menu.hidden=true;if(menuButton)menuButton.setAttribute('aria-expanded','false');}
function current(){return catalog()[modelIndex];}
function choose(i){if(!catalog()[i])return;if(filter!=='all'&&category(catalog()[i])!==filter)filter=category(catalog()[i]);modelIndex=i;renderExplorer();}
function openExplorer(i){
 closeMenu();returnFocus=document.activeElement;modelIndex=i;
 if(!explorer){
  explorer=document.createElement('section');explorer.className='p360-explorer';explorer.setAttribute('role','dialog');explorer.setAttribute('aria-modal','true');explorer.setAttribute('aria-label','Nuestros productos');explorer.tabIndex=-1;document.body.appendChild(explorer);
 }
 renderExplorer();lock();explorer.focus();
}
function closeExplorer(){if(!explorer)return;explorer.remove();explorer=null;lock();if(returnFocus&&returnFocus.isConnected)returnFocus.focus();}
function specs(b){
 var all=Object.keys(b.spec||{}).map(function(k){return [k,b.spec[k]];});
 (b.specSections||[]).forEach(function(section){(section.rows||[]).forEach(function(row){if(Array.isArray(row)&&row.length>1&&!all.some(function(p){return p[0]===row[0];}))all.push(row);});});
 all=all.filter(function(p){return p[1];}).sort(function(a,c){return Number(/potencia|peso/i.test(c[0]))-Number(/potencia|peso/i.test(a[0]));});
 var result=b.cc?[['Cilindrada',b.cc]]:[];
 result=result.concat(all.slice(0,2));
 return result.map(function(p){return '<div><small>'+esc(p[0])+'</small><strong>'+esc(p[1])+'</strong></div>';}).join('');
}
function navigation(){
 return '<nav class="p360-navigation" aria-label="Navegación de productos">'+button('Inicio','home')+button('Nuestros productos','products','class="p360-nav-active"')+button('Financiamiento','finance')+button('Portales','portals')+'</nav>';
}
function tunnel(){
 var frames='',points=[[110,-95],[890,-95],[1150,690],[-150,690]];
 [1,.80,.63,.49,.37,.27,.19,.13,.085].forEach(function(scale){
  var coords=points.map(function(p){return (500+(p[0]-500)*scale)+','+(245+(p[1]-245)*scale);}).join(' ');
  frames+='<polygon points="'+coords+'" fill="none" stroke="#ffffff" stroke-width="'+(24*scale+2)+'" opacity=".92"/>';
 });
 return '<svg class="p360-tunnel" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><radialGradient id="p360-room-light"><stop offset="0" stop-color="#fff"/><stop offset=".53" stop-color="#f1f2f3"/><stop offset="1" stop-color="#cdd2d7"/></radialGradient><linearGradient id="p360-floor" x2="0" y2="1"><stop stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#e8ebee"/></linearGradient></defs><rect width="1000" height="640" fill="url(#p360-room-light)"/>'+frames+'<path d="M0 430 L500 245 L1000 430 V640 H0Z" fill="url(#p360-floor)"/></svg>';
}
function colorControls(b){
 if(!(b.colors||[]).length)return '';
 return '<h3>Colores disponibles</h3><div class="p360-colors">'+b.colors.map(function(c,i){
  var hex=/^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/i.test(c.hex||'')?c.hex:'#dbe3ef';
  return '<button type="button" data-p360-color="'+i+'" title="'+esc(c.name||'Color')+'" aria-label="'+esc(c.name||'Color')+'" aria-pressed="false" style="background:'+hex+'"></button>';
 }).join('')+'</div><p id="p360-color-label" aria-live="polite">Seleccioná un color</p>';
}
function renderExplorer(){
 if(!explorer)return;
 var b=current();if(!b){closeExplorer();return;}
 var list=filtered();
 if(!list.length){explorer.innerHTML='<header class="p360-top"><div class="p360-top-inner">'+brand()+navigation()+button('✕','close','class="p360-close" aria-label="Cerrar nuestros productos"')+'</div></header><div class="p360-content">'+tabs()+'<p class="p360-empty">No hay modelos publicados en esta categoría.</p></div>';return;}
 if(!list.some(function(x){return x.index===modelIndex;})){modelIndex=list[0].index;b=current();}
 var description=b.description||b.subtitle||'Elegí tu color y consultá la ficha técnica, las características y las opciones de compra de este modelo.';
 explorer.innerHTML='<header class="p360-top"><div class="p360-top-inner">'+brand()+navigation()+button('✕','close','class="p360-close" aria-label="Cerrar nuestros productos"')+'</div></header>'+
 '<div class="p360-content">'+tabs()+'<div class="p360-layout">'+
 '<aside class="p360-rail" aria-label="Elegir modelo">'+filtered().map(function(x){return '<button type="button" data-p360-model="'+x.index+'" aria-pressed="'+(x.index===modelIndex)+'"><strong>'+esc(x.bike.name)+'</strong><img loading="lazy" src="'+esc(image(x.bike))+'" alt="">'+(x.index===modelIndex?'<span class="p360-rail-selected" aria-hidden="true">›</span>':'')+'</button>';}).join('')+'</aside>'+
 '<div class="p360-display">'+tunnel()+'<div class="p360-stage"><h1>'+esc(b.name)+'</h1><div class="p360-podium"><img id="p360-main-image" src="'+esc(image(b))+'" alt="'+esc(b.name)+'"></div><div class="p360-stage-nav">'+button('‹','previous','aria-label="Modelo anterior"')+button('›','next','aria-label="Modelo siguiente"')+'</div><p class="p360-stage-caption">'+(enabled(b)?'Abrí el visor para explorar todos los ángulos':'Fotografías del modelo · Elegí un color para ver sus imágenes')+'</p></div>'+
 '<aside class="p360-info"><h2>Diseño y rendimiento</h2><p class="p360-description">'+esc(description)+'</p>'+colorControls(b)+
 (enabled(b)?button('<span class="p360-icon360" aria-hidden="true">360°</span> Explorar en 360°','viewer','data-p360-index="'+modelIndex+'" class="p360-outline"'):'')+
 button('<span aria-hidden="true">◉</span> Cotizar por WhatsApp','quote','class="p360-quote"')+button('<span aria-hidden="true">▤</span> Ver detalle','detail','class="p360-primary"')+
 '<div class="p360-specs">'+specs(b)+'</div></aside></div></div>'+
 '<section class="p360-related"><h2>También te puede interesar</h2><div>'+catalog().map(function(x,i){return {bike:x,index:i};}).filter(function(x){return x.index!==modelIndex&&category(x.bike)!=='accesorios';}).sort(function(a,c){return Number(category(c.bike)===category(b))-Number(category(a.bike)===category(b));}).slice(0,3).map(function(x){return '<button type="button" data-p360-model="'+x.index+'"><strong>'+esc(x.bike.name)+'</strong><img loading="lazy" src="'+esc(image(x.bike))+'" alt=""><span class="p360-related-go" aria-hidden="true">›</span></button>';}).join('')+'</div></section></div>';
}
function showViewer(b,preview){
 var url=viewerUrl(b.viewer360Url);if(!url)return;
 if(viewer)closeViewer();
 var prev=document.activeElement;
 viewer=document.createElement('dialog');viewer.className='p360-viewer';
 viewer.innerHTML='<div class="p360-viewer-head"><h2>'+esc(b.name)+' · 360°</h2>'+button('Cerrar ✕','close-viewer')+'</div><p>Visor externo de Sketchfab. La versión y los colores del modelo 3D pueden variar.</p><iframe title="Vista 360 de '+esc(b.name)+'" src="'+esc(url)+'" allow="autoplay; fullscreen; xr-spatial-tracking" allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-pointer-lock" referrerpolicy="strict-origin-when-cross-origin"></iframe><p><a class="p360-external" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Abrir visor 360° en otra pestaña</a>'+(preview?' · Vista previa: guardá el modelo para publicar esta configuración.':'')+'</p>';
 document.body.appendChild(viewer);viewer._returnFocus=prev;
 viewer.addEventListener('cancel',function(e){e.preventDefault();closeViewer();});
 viewer.showModal();lock();
}
function closeViewer(){if(!viewer)return;var prev=viewer._returnFocus;viewer.close();viewer.remove();viewer=null;lock();if(prev&&prev.isConnected)prev.focus();}
function detail(){
 var b=current();if(!b||typeof window.openBike!=='function')return;
 window.openBike(b.name);
 var m=document.getElementById('bikeModal');if(m){m.setAttribute('tabindex','-1');m.focus();}
}
function productPhotoEvent(e){
 var img=e.target;
 if(!img||img.tagName!=='IMG'||!img.closest('.p360-menu,.p360-explorer'))return;
 if(e.type==='error'){
  img.hidden=true;
  if(!img.nextElementSibling||!img.nextElementSibling.classList.contains('p360-photo-unavailable')){
   var placeholder=document.createElement('span');placeholder.className='p360-photo-unavailable';placeholder.textContent='Fotografía por actualizar';img.insertAdjacentElement('afterend',placeholder);
  }
 }else{
  img.hidden=false;
  if(img.nextElementSibling&&img.nextElementSibling.classList.contains('p360-photo-unavailable'))img.nextElementSibling.remove();
 }
}
document.addEventListener('error',productPhotoEvent,true);
document.addEventListener('load',productPhotoEvent,true);
document.addEventListener('click',function(e){
 if(e.target.closest('.p360-brand')){closeExplorer();return;}
 var cat=e.target.closest('[data-p360-category]');if(cat){filter=cat.dataset.p360Category;refreshMenu();if(explorer){var rows=filtered();if(rows.length)modelIndex=rows[0].index;renderExplorer();}return;}
 var item=e.target.closest('[data-p360-model]');if(item){var i=Number(item.dataset.p360Model);if(explorer)choose(i);else openExplorer(i);return;}
 var color=e.target.closest('[data-p360-color]');if(color&&current()){
  var c=(current().colors||[])[Number(color.dataset.p360Color)],img=document.getElementById('p360-main-image');if(c&&img){img.src=c.img||(c.images||[])[0]||image(current());document.getElementById('p360-color-label').textContent=c.name||'Color';explorer.querySelectorAll('[data-p360-color]').forEach(function(node){node.setAttribute('aria-pressed',String(node===color));});}return;
 }
 var a=e.target.closest('[data-p360-action]');
 if(a){
  var action=a.dataset.p360Action;
  if(action==='viewer'){var b=catalog()[Number(a.dataset.p360Index)];if(b&&enabled(b))showViewer(b,false);}
  else if(action==='close-viewer')closeViewer();
  else if(action==='close')closeExplorer();
  else if(action==='detail')detail();
  else if(action==='products'){closeExplorer();filter='moto';refreshMenu();menu.hidden=false;menuButton.setAttribute('aria-expanded','true');menuButton.focus();}
  else if(action==='home'||action==='finance'||action==='portals'){
   closeExplorer();var target=document.getElementById(action==='home'?'inicio':action==='finance'?'financiamiento':'accesos');if(target)target.scrollIntoView({block:'start'});
  }
  else if(action==='quote'&&current()&&typeof waBike==='function')waBike(current().name);
  else if(action==='previous'||action==='next'){var rows=filtered(),pos=rows.findIndex(function(x){return x.index===modelIndex;});if(rows.length)choose(rows[(pos+(action==='next'?1:-1)+rows.length)%rows.length].index);}
  return;
 }
 if(menu&&!menu.hidden&&!menu.contains(e.target)&&menuButton&&!menuButton.contains(e.target))closeMenu();
});
document.addEventListener('keydown',function(e){
 if(viewer)return;
 var original=document.getElementById('bikeModal');
 if(original&&original.classList.contains('open'))return;
 if(e.key==='Escape'){if(explorer){e.preventDefault();closeExplorer();}else closeMenu();}
 if(e.key==='Tab'&&explorer){
  var nodes=Array.from(explorer.querySelectorAll('button,a[href],input')).filter(function(n){return !n.disabled&&n.getClientRects().length;});
  if(nodes.length&&!explorer.contains(document.activeElement)){e.preventDefault();nodes[0].focus();}
  else if(nodes.length&&e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes[nodes.length-1].focus();}
  else if(nodes.length&&!e.shiftKey&&document.activeElement===nodes[nodes.length-1]){e.preventDefault();nodes[0].focus();}
 }
});
function extendEditor(){
 var original=window.showBikeForm;if(typeof original!=='function')return;
 window.showBikeForm=function(index){
  original.apply(this,arguments);
  var form=document.getElementById('bikeAdminForm');if(!form)return;
  var b=index!==''&&index!==undefined?catalog()[Number(index)]:null;b=b||{};
  var field=document.createElement('fieldset');field.className='p360-admin full';
  field.innerHTML='<legend>Administración del 360°</legend><div class="p360-admin-heading"><span class="p360-admin-gear" aria-hidden="true">⚙</span><h3>Administración del modelo</h3><p>Activá o desactivá la vista 360° por modelo y conectá un visor existente.</p></div><div class="p360-admin-controls"><h4>Catálogo · '+esc(b.name||'Nuevo modelo')+'</h4><label class="p360-switch"><input type="checkbox" name="viewer360Enabled" '+(b.viewer360Enabled===true?'checked':'')+'> Activar vista 360° para este modelo</label><label>Enlace del modelo en Sketchfab<input type="url" name="viewer360Url" placeholder="https://sketchfab.com/3d-models/..." value="'+esc(b.viewer360Url||'')+'"></label><p>Usá el visor del modelo correspondiente. El botón solo se muestra cuando está activado y el enlace es válido. No cambia las fotos, los colores ni el cotizador.</p><button type="button" class="p360-preview">Vista previa del visor</button><p class="p360-editor-error" role="alert"></p></div>';
  var submit=form.querySelector('[type="submit"]'),actions=submit&&submit.closest('.form-actions');
  if(actions&&actions.parentNode===form)form.insertBefore(field,actions);else form.appendChild(field);
  var cat=form.querySelector('[name="cat"]');if(cat&&!cat.querySelector('[value="semiautomatico"]')){var opt=document.createElement('option');opt.value='semiautomatico';opt.textContent='Semiautomática';cat.appendChild(opt);if(b.cat==='semiautomatico')cat.value=b.cat;}
  var url=field.querySelector('[name="viewer360Url"]'),toggle=field.querySelector('[name="viewer360Enabled"]'),error=field.querySelector('[role="alert"]');
  function validate(){
   var normalized=viewerUrl(url.value);
   var invalid=(url.value.trim()&&!normalized)||(toggle.checked&&!normalized);
   error.textContent=invalid?'Ingresá un enlace HTTPS válido de un modelo de Sketchfab.':'';
   url.setCustomValidity(invalid?'Ingresá un enlace válido de Sketchfab.':'');
   return !invalid;
  }
  url.addEventListener('input',function(){url.setCustomValidity('');error.textContent='';});
  toggle.addEventListener('change',function(){url.setCustomValidity('');error.textContent='';});
  field.querySelector('.p360-preview').onclick=function(){if(!validate()||!viewerUrl(url.value)){error.textContent='Agregá el enlace del modelo para previsualizar.';return;}showViewer({name:form.elements.name.value||'Modelo',viewer360Url:url.value},true);};
  var save=form.onsubmit;form.onsubmit=function(e){if(!validate()){e.preventDefault();url.reportValidity();return;}url.value=viewerUrl(url.value);var result=save.call(this,e);refreshMenu();if(explorer)renderExplorer();return result;};
 };
}
function init(){
 var nav=document.querySelector('.proposal-menu'),anchor=nav&&nav.querySelector('a[href="#catalogo"]');
 if(anchor){
  menuButton=document.createElement('button');menuButton.type='button';menuButton.className='p360-menu-button';menuButton.textContent='Nuestros productos';menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-controls','p360-menu');
  anchor.replaceWith(menuButton);menu=document.createElement('section');menu.id='p360-menu';menu.className='p360-menu';menu.setAttribute('aria-label','Nuestros productos');menu.hidden=true;
  document.querySelector('.proposal-site-header').appendChild(menu);
  menuButton.onclick=function(){if(!menu.hidden){closeMenu();return;}filter='moto';refreshMenu();menu.hidden=false;menuButton.setAttribute('aria-expanded','true');};
 }
 extendEditor();
 var modal=document.getElementById('bikeModal');
 if(modal)new MutationObserver(function(){
  if(!modal.classList.contains('open')||modal.querySelector('.p360-detail-extra'))return;
  var b=typeof selected!=='undefined'?selected:null;if(!b||!enabled(b))return;
  var box=document.createElement('div');box.className='p360-detail-extra';
  var btn=document.createElement('button');btn.type='button';btn.className='p360-outline';btn.textContent='360° · Explorar este modelo';btn.onclick=function(){showViewer(b,false);};box.appendChild(btn);
  var host=modal.querySelector('.rb-product-summary')||modal.querySelector('.rb-body')||modal.firstElementChild;
  if(host)host.appendChild(box);
 }).observe(modal,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

