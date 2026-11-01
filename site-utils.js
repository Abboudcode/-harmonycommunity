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
 // Video cuts (2026-11-01): stories may carry trim_start / trim_end in
 // seconds (both NULL = uncut). A cut is valid only when both are set,
 // end > start, and the selection is at least 1 second long.
 function normalizeTrim(start,end){
  if(start==null||end==null||start===''||end==='')return null; // both must be set (Number(null) is 0)
  const s=Number(start),e=Number(end);
  if(!Number.isFinite(s)||!Number.isFinite(e))return null;
  if(s<0||e<=s||e-s<1)return null;
  return {start:s,end:e};
 }
 function storyTrim(story){
  if(!story)return null;
  return normalizeTrim(story.trim_start,story.trim_end);
 }
 // Keep a <video> inside the story's cut: seek to the start on load and
 // play, and at the end either loop back to the start ({loop:true}) or
 // pause ({loop:false}). Untrimmed stories are left completely alone.
 // Returns a detach function that removes the listeners.
 function applyVideoTrim(video,story,options){
  const trim=storyTrim(story);
  if(!video||!trim||typeof video.addEventListener!=='function')return function(){};
  const loop=!!(options&&options.loop),start=trim.start,end=trim.end;
  if(loop)video.loop=false; // looping is handled here, at the cut points
  function seekStart(){try{if(video.currentTime<start-0.05||video.currentTime>=end)video.currentTime=start;}catch{}}
  function onTime(){
   if(video.currentTime>=end){
    if(loop){try{video.currentTime=start;}catch{}const p=video.play?video.play():null;if(p&&p.catch)p.catch(()=>{});}
    else{try{video.currentTime=end;}catch{}if(video.pause)video.pause();}
   }else if(video.currentTime<start-0.25){try{video.currentTime=start;}catch{}}
  }
  video.addEventListener('loadedmetadata',seekStart);
  video.addEventListener('play',seekStart);
  video.addEventListener('timeupdate',onTime);
  if(video.readyState>=1)seekStart();
  return function(){video.removeEventListener('loadedmetadata',seekStart);video.removeEventListener('play',seekStart);video.removeEventListener('timeupdate',onTime);};
 }
 // Photo editing geometry for the share page: the center-crop size for a
 // crop ratio ('original' | '1:1' | '4:5' | '16:9') and the final canvas
 // size once a rotation in degrees (0/90/180/270) is applied.
 function computeImageEditSize(w,h,ratio,rotation){
  w=Math.max(1,Math.round(Number(w)||0));h=Math.max(1,Math.round(Number(h)||0));
  let cw=w,ch=h;
  const target=ratio==='1:1'?1:ratio==='4:5'?4/5:ratio==='16:9'?16/9:0;
  if(target){if(w/h>target)cw=Math.round(h*target);else ch=Math.round(w/target);}
  const rot=((Math.round(Number(rotation)||0)%360)+360)%360;
  return (rot===90||rot===270)?{width:ch,height:cw,cropWidth:cw,cropHeight:ch}:{width:cw,height:ch,cropWidth:cw,cropHeight:ch};
 }
 // Capture any password-recovery credentials from the URL *before* the
 // Supabase client reads and clears them. Some in-app browsers (the Gmail /
 // Google app webview this was found in on 2026-11-01) do not persist the
 // session the SDK saves from the link, so the reset dialog opened but
 // submitting failed with "Auth session missing!". The dialog keeps these
 // in memory as a fallback and can finish the password change with them.
 let urlRecovery=null,urlCode=null,urlTokenHash=null,urlError=null;
 try{
  const href=window.location.href,url=new URL(href),hashIdx=href.indexOf('#');
  const fromHash=hashIdx>=0?new URLSearchParams(href.slice(hashIdx+1)):new URLSearchParams();
  const pick=k=>url.searchParams.get(k)||fromHash.get(k);
  if(pick('type')==='recovery'&&pick('access_token')&&pick('refresh_token')){
   urlRecovery={access_token:pick('access_token'),refresh_token:pick('refresh_token')};
  }
  urlCode=url.searchParams.get('code');
  urlTokenHash=pick('token_hash');
  // A link the auth server rejected (already used / expired) redirects
  // back with an error instead of tokens — captured so the page can say
  // so instead of silently showing the homepage (seen 2026-11-01 11:05).
  urlError=pick('error_code')||pick('error');
 }catch{}
 const client=window.supabase&&config?.url&&config?.publicKey?window.supabase.createClient(config.url,config.publicKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
 window.HarmonySite={client,fileTypes,validateFile,safeMediaURL,text,normalizeTrim,storyTrim,applyVideoTrim,computeImageEditSize};
 if(!client){
  const warning=document.createElement('p');warning.setAttribute('role','alert');warning.className='site-warning';warning.textContent=text('Connection unavailable. Check your internet connection, then reload.','الاتصال غير متاح. تحقق من الإنترنت وأعد تحميل الصفحة.');document.body.prepend(warning);return;
 }
 let recovery=false,dialog;
 function tokenUserId(token){
  try{const part=String(token).split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(atob(part).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''))).sub||null;}catch{return null;}
 }
 async function recoverySession(){
  // A session for a *different* account (an old sign-in in this browser)
  // must not be used for this link's password change.
  const wanted=urlRecovery?tokenUserId(urlRecovery.access_token):null;
  try{const {data}=await client.auth.getSession();if(data?.session&&(!wanted||data.session.user?.id===wanted))return data.session;}catch{}
  if(urlRecovery){try{const r=await client.auth.setSession(urlRecovery);if(r?.data?.session)return r.data.session;}catch{}}
  if(urlCode){try{const r=await client.auth.exchangeCodeForSession(urlCode);if(r?.data?.session)return r.data.session;}catch{}}
  if(urlTokenHash){try{const r=await client.auth.verifyOtp({token_hash:urlTokenHash,type:'recovery'});if(r?.data?.session)return r.data.session;}catch{}}
  return null;
 }
 async function updateViaLinkToken(pw){
  // Finish the change directly with the link's own access token — the
  // auth server issued it for exactly this password change, and this
  // works even when the browser would not persist any session at all.
  const res=await fetch(config.url+'/auth/v1/user',{method:'PUT',headers:{'apikey':config.publicKey,'Authorization':'Bearer '+urlRecovery.access_token,'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
  if(!res.ok){let msg='';try{const j=await res.json();msg=j.msg||j.message||j.error_description||'';}catch{} throw Error(msg||('HTTP '+res.status));}
  client.auth.setSession(urlRecovery).catch(()=>{});
 }
 function expiredDialog(){
  if(dialog){if(!dialog.open)dialog.showModal();return;}
  dialog=document.createElement('dialog');dialog.className='recovery-dialog';
  const title=document.createElement('h2'),msg=document.createElement('p'),go=document.createElement('a'),close=document.createElement('button');
  title.dataset.en='Reset link expired';title.dataset.ar='انتهى رابط إعادة التعيين';title.id='recovery-title';dialog.setAttribute('aria-labelledby',title.id);
  msg.dataset.en='This reset link has already been used or has expired. Request a new one from the sign-in page, then tap the link in the newest email.';msg.dataset.ar='تم استخدام رابط إعادة التعيين هذا أو انتهت صلاحيته. اطلب رابطاً جديداً من صفحة تسجيل الدخول، ثم اضغط الرابط في أحدث إيميل.';
  go.href='signin.html';go.className='btn-primary';go.dataset.en='Go to the sign-in page';go.dataset.ar='الذهاب إلى صفحة تسجيل الدخول';
  close.type='button';close.className='btn-secondary';close.dataset.en='Close';close.dataset.ar='إغلاق';close.onclick=()=>dialog.close();
  dialog.append(title,msg,go,close);document.body.append(dialog);
  function translate(){dialog.querySelectorAll('[data-en]').forEach(n=>n.textContent=lang()==='ar'?n.dataset.ar:n.dataset.en);}
  new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});translate();
  dialog.showModal();
 }
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
   try{
    const session=await recoverySession();
    if(session){const {error}=await client.auth.updateUser({password:password.value});if(error)throw error;}
    else if(urlRecovery){await updateViaLinkToken(password.value);}
    else{throw Error(text('This reset link has expired. Please request a new one from the sign-in page.','انتهت صلاحية رابط إعادة التعيين. اطلب رابطاً جديداً من صفحة تسجيل الدخول.'));}
    recovery=false;form.reset();status.textContent=text('Password updated. You can close this window.','تم تحديث كلمة السر. يمكنك إغلاق هذه النافذة.');}
   catch(err){status.textContent=text('Could not update password: ','تعذر تحديث كلمة السر: ')+err.message;}
   finally{send.disabled=false;}
  };dialog.showModal();password.focus();
 }
 client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'){recovery=true;setTimeout(recoveryDialog,0);}});
 // A pending recovery event is handled after the SDK has initialized its URL session.
 client.auth.getSession().catch(()=>{});
 // Do not rely on the SDK event alone: if this page load came from a
 // reset link, the user must always end up seeing either the reset
 // dialog or an explanation — never a silent homepage.
 if(urlError){
  setTimeout(()=>{if(!dialog)expiredDialog();},600);
 }else if(urlRecovery||urlTokenHash){
  // The captured credentials are enough to finish the change on submit,
  // even if the SDK never establishes a session in this browser.
  setTimeout(()=>{if(!dialog){recovery=true;recoveryDialog();}},1500);
 }else if(urlCode){
  setTimeout(async()=>{if(dialog)return;const session=await recoverySession();if(session){recovery=true;recoveryDialog();}else{expiredDialog();}},1500);
 }
})();

