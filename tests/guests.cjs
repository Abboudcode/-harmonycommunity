const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom'),{PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),wait=()=>new Promise(r=>setTimeout(r,30));
async function ui(){
 const dom=new JSDOM('<html lang="en"><body><main></main></body></html>',{url:'https://abboudcode.github.io/-harmonycommunity/story.html?id=1',runScripts:'outside-only'}),w=dom.window;
 let current=null,signins=0,next=1,comments=[],writes=[];
 const guest={id:'11111111-1111-4111-8111-111111111111',is_anonymous:true,user_metadata:{}};
 class Q{
  constructor(table){this.table=table;this.filters=[];this.op='select';this.one=false;}
  select(){return this;}eq(k,v){this.filters.push(r=>String(r[k])===String(v));return this;}order(){return this;}range(){return this;}single(){this.one=true;return this;}
  insert(v){this.op='insert';this.payload=v;return this;}update(v){this.op='update';this.payload=v;return this;}delete(){this.op='delete';return this;}
  then(resolve,reject){return Promise.resolve().then(()=>{
   let rows=comments.filter(r=>this.filters.every(f=>f(r)));
   if(this.op==='insert'){writes.push(this.payload);const r={id:next++,created_at:new Date().toISOString(),...this.payload};comments.push(r);rows=[r];}
   if(this.op==='update')rows.forEach(r=>Object.assign(r,this.payload));
   if(this.op==='delete')comments=comments.filter(r=>!rows.includes(r));
   return {data:this.one?rows[0]:rows,error:null};
  }).then(resolve,reject);}
 }
 const client={auth:{getSession:async()=>({data:{session:current?{user:current}:null},error:null}),signInAnonymously:async()=>{signins++;await wait();current=guest;return {data:{user:guest},error:null};},onAuthStateChange(){}},from:t=>new Q(t)};
 w.HARMONY_SITE_CONFIG={url:'https://example.supabase.co',publicKey:'test'};w.supabase={createClient:()=>client};w.confirm=()=>true;
 w.eval(fs.readFileSync(path.join(root,'site-utils.js'),'utf8'));assert.equal(signins,0,'browsing must not create guest users');
 const both=await Promise.all([w.HarmonySite.ensureContributor(),w.HarmonySite.ensureContributor()]);assert.equal(signins,1);assert.equal(both[0].id,both[1].id);
 current=null;w.eval(fs.readFileSync(path.join(root,'story-discussion.js'),'utf8'));w.document.dispatchEvent(new w.CustomEvent('harmony:story',{detail:{id:1,user_id:'someone-else',title:'Story',content:'Body'}}));await wait();assert.equal(signins,1);
 const input=w.document.querySelector('#comment-body');input.value='<img src=x onerror=alert(1)> Support';
 input.closest('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,90));assert.equal(signins,2);assert.equal(writes.length,1);assert.equal(writes[0].user_id,guest.id);assert.equal(writes[0].is_anonymous,true);assert.equal(w.document.querySelectorAll('.discussion-comment img').length,0);assert(w.document.querySelector('.discussion-body').textContent.includes('<img'));
 w.document.documentElement.lang='ar';await wait();assert.equal(w.document.querySelector('#story-discussion h2').textContent,'تعليقات داعمة');
 const edit=[...w.document.querySelectorAll('.discussion-comment button')].find(b=>b.dataset.en==='Edit');edit.click();await wait();const form=w.document.querySelector('.discussion-comment form');form.querySelector('textarea').value='Edited';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(comments[0].body,'Edited');
 const del=[...w.document.querySelectorAll('.discussion-comment button')].find(b=>b.dataset.en==='Delete');del.click();await wait();assert.equal(comments.length,0);
 dom.window.close();console.log('PASS guest UI: lazy browser identity, concurrent-session reuse, no registration, safe comments, Arabic, owner edit/delete');
}
async function sql(){
 const db=new PGlite();await db.exec("create role anon;create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth,storage,public to anon,authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to anon,authenticated;create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;");
 const setup=fs.readFileSync(path.join(root,'supabase_guest_access.sql'),'utf8');await db.exec(setup);await db.exec(setup);
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';await db.query('insert into auth.users(id) values($1),($2)',[a,b]);
 async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({is_anonymous:true})]);await db.exec('set role '+(id?'authenticated':'anon'));}
 async function bad(q,args){let fail=false;try{await db.query(q,args);}catch{fail=true;}assert(fail);}
 await as(a);
 const story=(await db.query("insert into stories(title,content,category,user_id,is_anonymous) values('Guest story','Body','Kids',$1,false) returning *",[a])).rows[0];assert.equal(story.is_anonymous,true);
 const comment=(await db.query("insert into story_comments(story_id,user_id,body,is_anonymous,author_name) values($1,$2,'Reply',false,'Impersonation') returning *",[story.id,a])).rows[0];assert.equal(comment.is_anonymous,true);assert.equal(comment.author_name,'Anonymous');
 await db.query("update story_comments set body='Edited' where id=$1",[comment.id]);
 await as(b);assert.equal((await db.query("update story_comments set body='Hijacked' where id=$1 returning id",[comment.id])).rows.length,0);
 await bad("insert into story_comments(story_id,user_id,body) values($1,$2,'Fake')",[story.id,a]);
 assert.equal((await db.query("delete from stories where id=$1 returning id",[story.id])).rows.length,0);
 await as(null);assert.equal((await db.query('select * from story_comments')).rows.length,1);await bad("insert into story_comments(story_id,user_id,body) values($1,$2,'No identity')",[story.id,a]);
 await as(a);await db.query("delete from stories where id=$1",[story.id]);assert.equal((await db.query('select * from story_comments')).rows.length,0);
 for(let i=0;i<5;i++)await db.query("insert into stories(title,content,category,user_id) values('Rate','Body','Kids',$1)",[a]);
 await bad("insert into stories(title,content,category,user_id) values('Excess','Body','Kids',$1)",[a]);
 await db.close();console.log('PASS guest database: repeatable setup, guest ownership, forced anonymity, public reads, owner edit/delete, cascade and rate limits');
}
ui().then(sql).catch(e=>{console.error(e);process.exitCode=1;});

