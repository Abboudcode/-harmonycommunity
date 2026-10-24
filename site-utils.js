/* Shared helpers for the existing English/Arabic website. */
'use strict';
(() => {
 const config=window.HARMONY_SITE_CONFIG;
 const fileTypes={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm','video/ogg':'ogv'};
 const lang=()=>document.documentElement.lang==='ar'?'ar':'en';
 const text=(en,ar)=>lang()==='ar'?ar:en;
 function validateFile(file){
  if(!file)return;
  if(!fileTypes[file.type])throw Error(text('Choose JPG, PNG, WebP, GIF, MP4, WebM or Ogg.','اختر صورة JPG أو PNG أو WebP أو GIF، أو فيديو MP4 أو WebM أو Ogg.'));
  if(file.size<=0||file.size>20*1024*1024)throw Error(text('Attachments must be between 1 byte and 20 MB.','يجب أن يكون حجم المرفق من بايت واحد إلى 20 ميغابايت.'));
 }
 function safeMediaURL(value){
  try{const u=new URL(value),base=new URL(config.url);return u.protocol==='https:'&&u.origin===base.origin&&!u.username&&!u.password&&['/storage/v1/object/public/media/','/storage/v1/object/public/story-media/'].some(p=>u.pathname.startsWith(p))?u.href:null;}catch{return null;}
 }
 const client=window.supabase&&config?.url&&config?.publicKey?window.supabase.createClient(config.url,config.publicKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
 window.HarmonySite={client,fileTypes,validateFile,safeMediaURL,text};
 if(!client){
  const warning=document.createElement('p');warning.setAttribute('role','alert');warning.className='site-warning';warning.textContent=text('Connection unavailable. Check your internet connection, then reload.','الاتصال غير متاح. تحقق من الإنترنت وأعد تحميل الصفحة.');document.body.prepend(warning);return;
 }
 let recovery=false,dialog;
 function recoveryDialog(){
  if(dialog){if(!dialog.open)dialog.showModal();return;}
  dialog=document.createElement('dialog');dialog.className='recovery-dialog';
  const title=document.createElement('h2'),form=document.createElement('form'),password=document.createElement('input'),confirm=document.createElement('input'),status=document.createElement('p'),send=document.createElement('button'),close=document.createElement('button');
  for(const input of [password,confirm]){input.type='password';input.required=true;input.minLength=8;input.maxLength=128;input.autocomplete='new-password';}
  function label(input,en,ar){const l=document.createElement('label');const span=document.createElement('span');span.dataset.en=en;span.dataset.ar=ar;l.append(span,input);form.append(l);}
  label(password,'New password','كلمة السر الجديدة');label(confirm,'Confirm new password','تأكيد كلمة السر الجديدة');
  title.dataset.en='Reset your password';title.dataset.ar='إعادة تعيين كلمة السر';title.id='recovery-title';dialog.setAttribute('aria-labelledby',title.id);
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  send.type='submit';send.className='btn-primary';send.dataset.en='Update password';send.dataset.ar='تحديث كلمة السر';
  close.type='button';close.className='btn-secondary';close.dataset.en='Close';close.dataset.ar='إغلاق';close.onclick=()=>dialog.close();
  form.append(status,send,close);dialog.append(title,form);document.body.append(dialog);
  function translate(){dialog.querySelectorAll('[data-en]').forEach(n=>n.textContent=lang()==='ar'?n.dataset.ar:n.dataset.en);}
  new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});translate();
  form.onsubmit=async e=>{
   e.preventDefault();if(send.disabled)return;
   if(password.value!==confirm.value){status.textContent=text('Passwords do not match.','كلمتا السر غير متطابقتين.');return;}
   send.disabled=true;
   try{const {error}=await client.auth.updateUser({password:password.value});if(error)throw error;recovery=false;form.reset();status.textContent=text('Password updated. You can close this window.','تم تحديث كلمة السر. يمكنك إغلاق هذه النافذة.');}
   catch(err){status.textContent=text('Could not update password: ','تعذر تحديث كلمة السر: ')+err.message;}
   finally{send.disabled=false;}
  };dialog.showModal();password.focus();
 }
 client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'){recovery=true;setTimeout(recoveryDialog,0);}});
 // A pending recovery event is handled after the SDK has initialized its URL session.
 client.auth.getSession().catch(()=>{});
})();

