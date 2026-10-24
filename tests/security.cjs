const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const db=new PGlite();
 await db.exec("create role anon;create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,storage,public to anon,authenticated;create table storage.buckets(id text primary key,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to anon,authenticated;create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;");
 await db.exec(fs.readFileSync(path.join(root,'supabase_harmony_full_setup.sql'),'utf8'));
 const upgrade=fs.readFileSync(path.join(root,'supabase_harmony_security_upgrade.sql'),'utf8');await db.exec(upgrade);await db.exec(upgrade);
 const uid='11111111-1111-4111-8111-111111111111';await db.query('insert into auth.users values($1)',[uid]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
 await db.query("insert into stories(title,content,category,user_id) values('Title','Body','Kids',$1)",[uid]);
 async function rejected(sql,args){let fail=false;try{await db.query(sql,args);}catch{fail=true;}assert(fail);}
 await rejected("insert into stories(title,content,category,user_id) values('Fake','Body','Kids',null)");
 await rejected("insert into stories(title,content,category,user_id,media_url) values('Fake','Body','Kids',$1,'https://evil.test/x')",[uid]);
 await rejected("insert into storage.objects(bucket_id,name) values('media','other/file.jpg')");
 await db.query("insert into storage.objects(bucket_id,name) values('media',$1)",[uid+'/image.jpg']);
 assert.equal((await db.query("delete from storage.objects where name=$1 returning name",[uid+'/image.jpg'])).rows.length,1);
 assert.equal((await db.query('select * from stories')).rows.length,1);
 await db.close();console.log('PASS repository security migration executes twice and enforces story/media ownership without deleting stories.');
})().catch(e=>{console.error(e);process.exitCode=1;});

