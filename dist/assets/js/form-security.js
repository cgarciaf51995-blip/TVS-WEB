(() => {
 'use strict';
 const kinds={loginForm:'login',pqForm:'prequalification',freelanceApplication:'freelance',aiChatForm:'chat',referralForm:'referral',flCreditForm:'credit',flFinalizeForm:'finalize'};
 let config=null,ready=null,googlePromise=null;
 const widgets=new WeakMap(),bypass=new WeakSet(),pending=new WeakSet();
 async function loadConfig(){
  ready=fetch('/api/security/public',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(value=>{if(config&&(config.siteKey!==value.siteKey||config.enabled!==value.enabled)){for(const form of document.querySelectorAll('form')){const item=widgets.get(form);if(item){item.box.remove();widgets.delete(form)}}}config=value;scan();return value}).catch(()=>{config=null;return null});return ready;
 }
 function hint(form,text){let box=form.querySelector('.tvs-captcha-hint');if(!box){box=document.createElement('p');box.className='tvs-captcha-hint';box.setAttribute('role','status');form.append(box)}box.textContent=text;box.hidden=!text;}
 function google(){
  if(window.grecaptcha?.render)return Promise.resolve(window.grecaptcha);
  if(googlePromise)return googlePromise;
  googlePromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');const timeout=setTimeout(()=>{script.remove();googlePromise=null;reject(Error('No se pudo cargar reCAPTCHA. Revisa tu conexión y vuelve a intentarlo.'))},12000);
   window.tvsCaptchaLoaded=()=>{clearTimeout(timeout);resolve(window.grecaptcha)};
   script.src='https://www.google.com/recaptcha/api.js?onload=tvsCaptchaLoaded&render=explicit&hl=es';script.async=true;script.defer=true;script.onerror=()=>{clearTimeout(timeout);script.remove();googlePromise=null;reject(Error('No se pudo cargar reCAPTCHA.'))};document.head.append(script);
  });return googlePromise;
 }
 async function mount(form){
  if(!config?.enabled||config.forms[kinds[form.id]]===false)return null;
  let item=widgets.get(form);if(item?.box.isConnected)return item.promise;
  const box=document.createElement('div');box.className='tvs-captcha-box';
  const target=form.querySelector('.form-actions');if(target)target.before(box);else form.append(box);
  item={box,promise:null,id:null};widgets.set(form,item);
  item.promise=google().then(api=>{
   if(!box.isConnected)return null;
   item.id=api.render(box,{sitekey:config.siteKey,size:form.clientWidth<340?'compact':'normal',theme:'light',callback:()=>hint(form,''),'expired-callback':()=>hint(form,'La verificación venció. Repite la casilla.'),'error-callback':()=>hint(form,'No se pudo completar reCAPTCHA. Revisa tu conexión.')});return item;
  }).catch(error=>{hint(form,error.message);widgets.delete(form);box.remove();return null});return item.promise;
 }
 function scan(){if(!config?.enabled)return;document.querySelectorAll('form').forEach(form=>{if(kinds[form.id]&&form.clientWidth>0)void mount(form)})}
 document.addEventListener('submit',async event=>{
  const form=event.target,action=kinds[form.id];if(!action)return;
  if(bypass.has(form)){bypass.delete(form);return;}
  event.preventDefault();event.stopImmediatePropagation();
  if(pending.has(form))return;
  pending.add(form);const submitter=event.submitter;
  try{
   const current=await loadConfig();
   if(!current)throw Error('No se pudo cargar la protección del formulario. Revisa que el servidor esté funcionando.');
   if(current.enabled&&current.forms[action]!==false){
    if(!current.configured)throw Error('El administrador debe completar la configuración de reCAPTCHA.');
    const item=await mount(form),token=item&&window.grecaptcha.getResponse(item.id);
    if(!token)throw Error('Completa la casilla No soy un robot para continuar.');
    hint(form,'Verificando…');
    try{
     const response=await fetch('/api/security/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token})});
     const result=await response.json();if(!response.ok||result.verified!==true)throw Error(result.error||'No se pudo verificar el formulario.');
    }finally{window.grecaptcha.reset(item.id)}
   }
   hint(form,'');
   if(!form.isConnected)return;
   bypass.add(form);form.requestSubmit(submitter?.isConnected?submitter:undefined);
  }catch(error){hint(form,error.message||'No se pudo verificar. Intenta de nuevo.')}
  finally{pending.delete(form)}
 },true);
 let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;scan()})}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
 window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='tvs-captcha-config-saved'){config=null;for(const form of document.querySelectorAll('form')){const item=widgets.get(form);if(item){try{window.grecaptcha?.reset(item.id)}catch{}item.box.remove();widgets.delete(form)}}void loadConfig()}});
 void loadConfig();
})();
