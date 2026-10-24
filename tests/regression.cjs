const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const root=process.env.HARMONY_REPO_DIR||path.resolve(__dirname,'..');
let checks=0;
const wait=()=>new Promise(r=>setTimeout(r,25));
function makeClient(){const hooks=[],calls={inserts:0,uploads:0,updates:0};let failUpload=false,failInsert=false;
 const user={id:'11111111-1111-4111-8111-111111111111',email:'private@example.test',user_metadata:{display_name:'Public name'}};
 const query=()=>({select(){return this;},eq(){return this;},order(){return this;},limit(){return Promise.resolve({data:[],error:null});},single(){return Promise.resolve({data:{id:4},error:failInsert?{message:'Simulated insert failure'}:null});},maybeSingle(){return Promise.resolve({data:null,error:null});},insert(){calls.inserts++;return this;}});
 return {hooks,calls,setFailUpload:v=>failUpload=v,setFailInsert:v=>failInsert=v,from:query,storage:{from:()=>({upload:async()=>{calls.uploads++;return {error:failUpload?{message:'Upload rejected'}:null};},remove:async()=>({error:null}),getPublicUrl:p=>({data:{publicUrl:'https://ndqhfftzumulkydznwgf.supabase.co/storage/v1/object/public/media/'+p}})})},auth:{onAuthStateChange:f=>{hooks.push(f);return {};},getUser:async()=>({data:{user},error:null}),getSession:async()=>({data:{session:null},error:null}),updateUser:async()=>{calls.updates++;return {data:{user},error:null};}}};
}
async function page(file){
 const html=fs.readFileSync(path.join(root,file),'utf8'),dom=new JSDOM(html,{url:'https://abboudcode.github.io/-harmonycommunity/'+file,runScripts:'outside-only'}),w=dom.window,d=w.document,client=makeClient();
 w.CSS={escape:s=>s};w.supabase={createClient:()=>client};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.crypto.randomUUID=()=> 'test-uuid';
 for(const script of d.querySelectorAll('script')){
  if(script.src.startsWith('https://cdn.'))continue;
  if(script.src){const file=script.getAttribute('src');if(fs.existsSync(path.join(root,file)))w.eval(fs.readFileSync(path.join(root,file),'utf8'));}
  else{new vm.Script(script.textContent);w.eval(script.textContent);}
 }
 await wait();return {dom,w,d,client};
}
(async()=>{
 for(const file of ['index.html','about.html','contact.html','faq.html','share.html','signin.html','stories.html','story.html']){
  const p=await page(file);const select=p.d.querySelector('#language-select');assert(select,file+' language selector retained');
  select.value='ar';select.dispatchEvent(new p.w.Event('change'));await wait();assert.equal(p.d.documentElement.lang,'ar');assert.equal(p.d.documentElement.dir,'rtl');
  for(const n of p.d.querySelectorAll('[data-en][data-ar]')){if(!['nav-auth-label','current-user-label'].includes(n.id))assert.equal(n.textContent,n.getAttribute('data-ar'),file+' Arabic text');}
  select.value='en';select.dispatchEvent(new p.w.Event('change'));await wait();assert.equal(p.d.documentElement.dir,'ltr');
  assert(!p.d.querySelector('#nav-auth-label')?.textContent.includes('private@example.test'));
  assert(p.w.HARMONY_SITE_CONFIG.url.includes('ndqhfftzumulkydznwgf'));
  checks++;console.log('PASS '+file+' syntax, English/Arabic switching and RTL');p.dom.window.close();
 }
 const p=await page('signin.html');p.d.querySelector('#language-select').value='ar';p.d.querySelector('#language-select').dispatchEvent(new p.w.Event('change'));
 p.client.hooks.forEach(f=>f('PASSWORD_RECOVERY'));await wait();const dialog=p.d.querySelector('.recovery-dialog');assert(dialog.open);assert.equal(dialog.querySelector('h2').textContent,'إعادة تعيين كلمة السر');const inputs=dialog.querySelectorAll('input');inputs[0].value='a'.repeat(80);inputs[1].value=inputs[0].value;
 dialog.querySelector('form').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(p.client.calls.updates,1);checks++;console.log('PASS bilingual password recovery with long password');p.dom.window.close();
 const q=await page('share.html');q.client.setFailInsert(true);
 const title=q.d.querySelector('#story-title')||q.d.querySelector('input[type=text]');title.value='Test title';const body=q.d.querySelector('textarea');body.value='Test body';
 const form=q.d.querySelector('form');form.dispatchEvent(new q.w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(q.client.calls.inserts,1,'failed insert must never retry without ownership');
 assert(!form.querySelector('button[type=submit]').disabled);checks++;console.log('PASS failed publish does not drop ownership or lock the form');
 assert.equal(q.w.HarmonySite.safeMediaURL('javascript:alert(1)'),null);assert.equal(q.w.HarmonySite.safeMediaURL('https://evil.example/file.jpg'),null);
 assert.throws(()=>q.w.HarmonySite.validateFile({type:'image/svg+xml',size:100}));checks++;console.log('PASS media URL and upload validation');q.dom.window.close();
 console.log('All '+checks+' repository checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});


