/* Guest comments and owner controls. Public browsing never creates an identity. */
'use strict';
(() => {
 const H=window.HarmonySite,db=H?.client;if(!db)return;
 let story=null,section=null,rows=[],page=0,more=false,loading=false,user=null,generation=0;
 const text=H.text,$=s=>section?.querySelector(s);
 const el=(tag,value,cls)=>{const n=document.createElement(tag);if(value!=null)n.textContent=value;if(cls)n.className=cls;return n;};
 const check=r=>{if(r.error)throw r.error;return r.data;};
 function translated(node,en,ar){node.dataset.en=en;node.dataset.ar=ar;node.textContent=text(en,ar);return node;}
 function button(en,ar,fn){const b=translated(el('button',null,'btn-secondary'),en,ar);b.type='button';b.onclick=()=>run(b,fn);return b;}
 function notice(en,ar,error=false){const n=$('#discussion-status');if(n){n.textContent=text(en,ar);n.classList.toggle('error',error);}}
 async function run(b,fn){if(b.disabled)return;b.disabled=true;try{await fn();}catch(e){notice('Could not save: '+e.message,'تعذر الحفظ: '+e.message,true);}finally{b.disabled=false;}}
 async function identity(){const r=check(await db.auth.getSession());user=r.session?.user||null;return user;}
 function render(){
  const list=$('#discussion-list');if(!list)return;list.replaceChildren();
  if(!rows.length)list.append(translated(el('p',null,'note'),'No comments yet. Be the first to offer support.','لا توجد تعليقات بعد. كن أول من يقدم الدعم.'));
  for(const row of rows){
   const card=el('article',null,'discussion-comment'),author=row.is_anonymous?text('Anonymous','مجهول'):(row.author_name||text('Member','عضو'));
   const label=el('strong',author);if(row.is_anonymous)translated(label,'Anonymous','مجهول');
   const time=el('time',new Date(row.created_at).toLocaleString(document.documentElement.lang));time.dateTime=row.created_at;
   card.append(label,time,el('p',row.body,'discussion-body'));
   if(user?.id===row.user_id){
    const actions=el('div',null,'discussion-actions');
    actions.append(button('Edit','تعديل',()=>editComment(row,card)),button('Delete','حذف',async()=>{
     if(!confirm(text('Delete your comment?','هل تريد حذف تعليقك؟')))return;
     const removed=check(await db.from('story_comments').delete().eq('id',row.id).eq('user_id',user.id).select('id'));
     if(!removed.length)throw Error(text('Comment is no longer available.','التعليق لم يعد متاحاً.'));
     rows=rows.filter(r=>r.id!==row.id);render();notice('Comment deleted.','تم حذف التعليق.');
    }));card.append(actions);
   }list.append(card);
  }$('#discussion-more').hidden=!more;
 }
 function editComment(row,card){
  if(card.querySelector('form'))return;
  const form=el('form'),input=el('textarea');input.required=true;input.maxLength=4000;input.value=row.body;input.setAttribute('aria-label',text('Edit comment','تعديل التعليق'));
  const save=translated(el('button',null,'btn-primary'),'Save','حفظ');save.type='submit';const cancel=button('Cancel','إلغاء',()=>form.remove());form.append(input,save,cancel);card.append(form);input.focus();
  form.onsubmit=e=>{e.preventDefault();run(save,async()=>{
   const body=input.value.trim();if(!body)throw Error(text('Write a comment.','اكتب تعليقاً.'));
   const updated=check(await db.from('story_comments').update({body}).eq('id',row.id).eq('user_id',user.id).select().single());
   Object.assign(row,updated);render();notice('Comment saved.','تم حفظ التعليق.');
  });};
 }
 async function load(reset=false){
  if(loading)return;loading=true;const g=generation,offset=reset?0:page*30;
  try{
   const result=check(await db.from('story_comments').select('*').eq('story_id',story.id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+29));
   if(g!==generation)return;
   const map=new Map((reset?[]:rows).map(r=>[String(r.id),r]));result.forEach(r=>map.set(String(r.id),r));rows=[...map.values()];page=reset?1:page+1;more=result.length===30;await identity();render();notice('','');
  }catch(e){notice('Comments are unavailable. Try Refresh; the site owner may need to apply the comments database setup.','التعليقات غير متاحة. جرّب التحديث؛ قد يحتاج صاحب الموقع إلى تطبيق إعداد قاعدة بيانات التعليقات.',true);}
  finally{loading=false;}
 }
 async function ownerControls(){
  const box=$('#story-owner-controls');box.replaceChildren();await identity();if(!user||user.id!==story.user_id)return;
  box.append(button('Edit my story','تعديل قصتي',()=>{
   if(box.querySelector('form'))return;
   const form=el('form'),title=el('input'),body=el('textarea');title.required=true;title.maxLength=160;title.value=story.title;title.setAttribute('aria-label',text('Story title','عنوان القصة'));body.required=true;body.maxLength=10000;body.value=story.content;body.setAttribute('aria-label',text('Story text','نص القصة'));
   const save=translated(el('button',null,'btn-primary'),'Save story','حفظ القصة');save.type='submit';form.append(title,body,save,button('Cancel','إلغاء',()=>form.remove()));box.append(form);
   form.onsubmit=e=>{e.preventDefault();run(save,async()=>{
    if(!title.value.trim()||!body.value.trim())throw Error(text('Enter a title and story.','اكتب عنواناً ونص القصة.'));
    const updated=check(await db.from('stories').update({title:title.value.trim(),content:body.value.trim()}).eq('id',story.id).eq('user_id',user.id).select().single());story=updated;
    document.querySelector('#story-title').textContent=story.title;document.querySelector('#story-content').textContent=story.content;form.remove();notice('Story saved.','تم حفظ القصة.');
   });};
  }),button('Delete my story','حذف قصتي',async()=>{
   if(!confirm(text('Delete your story and its comments?','هل تريد حذف قصتك وتعليقاتها؟')))return;
   const removed=check(await db.from('stories').delete().eq('id',story.id).eq('user_id',user.id).select('id'));
   if(!removed.length)throw Error(text('Story is no longer available.','القصة لم تعد متاحة.'));
   location.href='stories.html';
  }));
 }
 async function mount(data){
  story=data;generation++;
  if(!section){
   section=el('section',null,'discussion card');section.id='story-discussion';section.setAttribute('aria-label',text('Story comments','تعليقات القصة'));
   const heading=translated(el('h2'),'Supportive comments','تعليقات داعمة');
   const hint=translated(el('p',null,'note'),'No account, email or password needed. Guest access stays in this browser; clearing browser data or switching accounts can lose access to your contributions.','لا تحتاج إلى حساب أو بريد إلكتروني أو كلمة سر. وصول الضيف محفوظ في هذا المتصفح؛ مسح بياناته أو تبديل الحساب قد يفقدك الوصول إلى مشاركاتك.');
   const own=el('div');own.id='story-owner-controls';const status=el('p');status.id='discussion-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   const form=el('form'),label=translated(el('label'),'Your comment','تعليقك'),input=el('textarea');input.id='comment-body';input.required=true;input.maxLength=4000;input.rows=4;label.htmlFor=input.id;
   const send=translated(el('button',null,'btn-primary'),'Post comment','نشر التعليق');send.type='submit';
   form.append(label,input,send);form.onsubmit=e=>{e.preventDefault();run(send,async()=>{
    const body=input.value.trim();if(!body)throw Error(text('Write a comment first.','اكتب تعليقاً أولاً.'));
    user=await H.ensureContributor();
    check(await db.from('story_comments').insert({story_id:story.id,body,user_id:user.id,is_anonymous:!!user.is_anonymous||!!user.user_metadata?.always_anonymous,author_name:user.is_anonymous?'Anonymous':(user.user_metadata?.display_name||'Member')}).select().single());
    input.value='';await load(true);await ownerControls();notice('Comment posted.','تم نشر التعليق.');
   });};
   const controls=el('div',null,'discussion-actions');controls.append(button('Refresh comments','تحديث التعليقات',()=>load(true)));
   const list=el('div');list.id='discussion-list';const next=button('Load more comments','تحميل المزيد من التعليقات',()=>load());next.id='discussion-more';next.hidden=true;
   section.append(own,heading,hint,form,status,controls,list,next);document.querySelector('main').append(section);
   new MutationObserver(()=>{
    section.querySelectorAll('[data-en][data-ar]').forEach(n=>n.textContent=text(n.dataset.en,n.dataset.ar));
    section.setAttribute('aria-label',text('Story comments','تعليقات القصة'));
   }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
   db.auth.onAuthStateChange(()=>setTimeout(()=>{identity().then(()=>{render();ownerControls();}).catch(()=>{});},0));
  }
  await ownerControls();await load(true);
 }
 document.addEventListener('harmony:story',e=>{mount(e.detail).catch(err=>notice('Comments could not load. Please refresh.','تعذر تحميل التعليقات. يرجى التحديث.',true));});
})();

