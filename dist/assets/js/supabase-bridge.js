/* Persistence adapter. The V60 HTML, styling, and view functions remain in charge of the UI. */
(function(){
 'use strict';
 const arrays={tvs_FreelanceReferrals:'referrals',tvsFreelanceReferrals:'referrals',tvsGerenciaPaperwork:'paperwork',tvsFreelanceAccounts:'applications',gysFreelanceDocumentRequestsV2:'requests',gysFreelanceDocumentFilesV2:'filemeta',gysPublishingMaterialsV2:'materials',tvs_motoKommoLeads:'leads',tvsPortalUsers:'users'};
 const settings=new Set(['tvsCatalog','tvs_SiteSettings','tvsSiteSettings','tvs_DesignSettings','tvs_PrequalConfig','tvsWhatsapp','tvs_Whatsapp','freelanceProgramConfig','tvs_AIConfig','tvsFreelanceAnalyticsOverrides','tvs_motoKommoSettings','tvs_motoKommoStages']);
 const keys=new Set([...Object.keys(arrays),...settings]);
 const original={get:Storage.prototype.getItem,set:Storage.prototype.setItem,remove:Storage.prototype.removeItem};
 const receipts=new Map(),cache=new Map(),confirmed=new Map();
 let versions={},user=null,ready=false,pending=0,queue=Promise.resolve(),lastError=null,refreshing=false,failed=false;
 const canonical=k=>k==='tvsFreelanceReferrals'?'tvs_FreelanceReferrals':k;
 const idOf=p=>String(p.id??p.code??p.username);
 const asArray=s=>{try{const v=JSON.parse(s||'[]');return Array.isArray(v)?v:[];}catch{return [];}};
 const withoutSecrets=p=>{const q={...p};delete q.password;delete q.password_hash;return q;};
 async function api(path,body,options={}){
  const r=await fetch('/api/zip/'+path,{credentials:'same-origin',cache:'no-store',...options,...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error||'No se pudo guardar en el servidor.'),{status:r.status});return data;
 }
 function putCache(k,value){cache.set(canonical(k),value);}
 function fail(error){if(failed)return;lastError=error;failed=true;console.error('No se confirmó el guardado:',error.message);window.dispatchEvent(new CustomEvent('tvs-save-error',{detail:error.message}));alert(error.message+'\nTus cambios no han sido confirmados. Mantén esta página abierta y vuelve a intentar.');}
 function enqueue(task){pending++;const work=queue.then(()=>{if(failed)throw lastError;return task();});queue=work.catch(e=>{fail(e);}).finally(()=>{pending--;});return work;}
 function initialSession(){
  if(user){original.set.call(sessionStorage,'tvsPortalSession',JSON.stringify({role:user.role,user:user.username}));}
  else{original.remove.call(sessionStorage,'tvsPortalSession');original.remove.call(sessionStorage,'gysSellerCRMContext');}
 }
 function initialize(data){
  user=data.user||null;versions={...(data.versions||{})};cache.clear();confirmed.clear();
  for(const [k,v] of Object.entries(data.values||{})){if(keys.has(k)){putCache(k,v);confirmed.set(canonical(k),v);}}
  ready=true;initialSession();
 }
 async function sendSetting(k,value){
  const result=await api('save',{kind:'setting',key:k,value,version:versions[k]||0});versions[k]=result.version;confirmed.set(k,value);
 }
 async function sendRecords(k,bucket,before,after){
  const prev=new Map(asArray(before).map(p=>[idOf(p),p])),next=new Map(asArray(after).map(p=>[idOf(p),p]));const changes=[];
  for(const [id,payload] of next){if(JSON.stringify(payload)!==JSON.stringify(prev.get(id)))changes.push({id,payload,version:versions[bucket+':'+id]||0});}
  for(const id of prev.keys())if(!next.has(id))changes.push({id,deleted:true,version:versions[bucket+':'+id]||0});
  if(!changes.length)return;
  if(!user){
   if(changes.some(c=>c.deleted)||!['referrals','applications'].includes(bucket))throw new Error('Inicia sesión para guardar.');
   for(const c of changes){const action=bucket==='applications'?'freelance':'prequalification';const receipt=receipts.get(action);receipts.delete(action);const result=await api('public',{bucket,payload:c.payload,receipt});versions[bucket+':'+c.id]=result.version;}
  }else{
   for(let start=0;start<changes.length;start+=150){const response=await api('save',{kind:'records',bucket,changes:changes.slice(start,start+150)});for(const c of response.changes){versions[bucket+':'+c.id]=c.version;if(c.payload)next.set(c.id,c.payload);}}
  }
  confirmed.set(k,JSON.stringify([...next.values()].map(withoutSecrets)));
  // Never retain plaintext account credentials in the browser cache after sending them.
  if(cache.get(k)===after)putCache(k,JSON.stringify([...next.values()].map(withoutSecrets)));
 }
 function persist(key,value){
  const k=canonical(key),previous=cache.get(k)??null;
  if(previous===value)return;
  if(!ready)throw new Error('La conexión aún no está disponible. Recarga e intenta nuevamente.');
  if(!user&&!['referrals','applications'].includes(arrays[k])){
   // The original ZIP initializes a few defaults while rendering the public page.
   // These are local render defaults and must never change server configuration.
   putCache(k,value);return;
  }
  if(failed)throw new Error('Hay un guardado sin confirmar. Recarga la página antes de continuar.');
  putCache(k,value);
  const task=arrays[k]?()=>sendRecords(k,arrays[k],previous,value):()=>sendSetting(k,value);
  enqueue(task).catch(()=>{if(cache.get(k)===value){if(previous===null)cache.delete(k);else putCache(k,previous);}});
 }
 Storage.prototype.getItem=function(k){return this===localStorage&&keys.has(String(k))?(cache.get(canonical(String(k)))??null):original.get.call(this,k);};
 Storage.prototype.setItem=function(k,v){if(this===localStorage&&keys.has(String(k)))return persist(String(k),String(v));return original.set.call(this,k,v);};
 Storage.prototype.removeItem=function(k){if(this===localStorage&&keys.has(String(k)))return persist(String(k),arrays[String(k)]?'[]':'{}');return original.remove.call(this,k);};
 async function flush(){await queue;if(lastError)throw lastError;}
 async function refresh(){if(!ready||refreshing||pending||failed)return;refreshing=true;try{const data=await api('state');if(user&&!data.user){initialize(data);if(typeof closePortalView==='function')closePortalView();return;}const old=new Map(cache);initialize(data);repaint(old);}catch(e){console.warn('No se pudo actualizar la vista:',e.message);}finally{refreshing=false;}}
 function repaint(old){
  try{
   if(cache.get('tvsCatalog')!==old.get('tvsCatalog')&&typeof bikes!=='undefined'){const rows=JSON.parse(cache.get('tvsCatalog')||'null');if(Array.isArray(rows)&&rows.length){bikes.splice(0,bikes.length,...rows);if(typeof selected!=='undefined')selected=bikes.find(b=>b.name===selected?.name)||bikes[0];if(typeof render==='function')render();if(typeof fillSelect==='function')fillSelect();}}
   if(typeof applySiteSettings==='function'&&(cache.get('tvs_SiteSettings')!==old.get('tvs_SiteSettings')||cache.get('tvsSiteSettings')!==old.get('tvsSiteSettings')))applySiteSettings();
   if(document.querySelector('#workspaceModal.open')||document.activeElement?.matches('input,textarea,select'))return;
   if(user&&document.querySelector('#portal.open')){if(user.role==='freelance'&&typeof renderFreelanceDashboard==='function')renderFreelanceDashboard(user.username);if(user.role==='gerencia'&&typeof renderGerenciaDashboard==='function')renderGerenciaDashboard(user.username);}
   if(typeof renderAll==='function'&&typeof crmRead==='function'&&typeof leads!=='undefined'){
    leads=crmRead('motoKommoLeads',[]);stages=crmRead('motoKommoStages',stages);renderAll();
   }
  }catch(e){console.warn('No se pudo refrescar una vista:',e.message);}
 }
 async function login(username,password,role){
  await flush();const receipt=receipts.get('login');receipts.delete('login');const data=await api('login',{username,password,role,receipt});initialize(data);return data.user;
 }
 async function logout(){await flush();await api('logout',{});initialize(await api('state'));}
 async function putFile(id,file){await flush();const r=await fetch('/api/zip/files/'+encodeURIComponent(id),{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type||'application/octet-stream','X-File-Name':encodeURIComponent(file.name||'archivo')},body:file});const data=await r.json();if(!r.ok)throw new Error(data.error||'No se pudo adjuntar el archivo.');return data;}
 async function getFile(id){const r=await fetch('/api/zip/files/'+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});if(r.status===404)return null;if(!r.ok)throw new Error('No se pudo descargar el documento.');return r.blob();}
 async function deleteFile(id){await flush();const r=await fetch('/api/zip/files/'+encodeURIComponent(id),{method:'DELETE',credentials:'same-origin'});if(!r.ok)throw new Error('No se pudo retirar el archivo.');}
 async function chat(payload){const receipt=receipts.get('chat');receipts.delete('chat');return api('chat',{message:payload.message,history:payload.history,receipt});}
 window.TVSBackend={initialize,login,logout,flush,refresh,putFile,getFile,deleteFile,chat,get:k=>cache.get(canonical(k))??null,set:(k,v)=>persist(k,String(v)),saveProof:(action,receipt)=>{if(receipt)receipts.set(action,receipt);},get user(){return user;},get pending(){return pending;},get ready(){return ready;}};
 window.addEventListener('beforeunload',e=>{if(pending||failed){e.preventDefault();e.returnValue='';}});
 window.addEventListener('focus',()=>void refresh());
 setInterval(()=>{if(document.visibilityState==='visible')void refresh();},20000);
})();
