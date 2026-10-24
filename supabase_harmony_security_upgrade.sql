-- Apply AFTER supabase_harmony_full_setup.sql, using SQL Editor.
-- Existing stories and media are preserved. Review and back up first.
begin;
alter table public.stories enable row level security;
grant select on public.stories to anon,authenticated;
grant insert on public.stories to authenticated;
revoke insert,update,delete on public.stories from anon;
do $$ declare seq text; begin
 seq:=pg_get_serial_sequence('public.stories','id');
 if seq is not null then execute format('grant usage,select on sequence %s to authenticated',seq); end if;
end $$;
drop policy if exists harmony_story_insert_guard on public.stories;
create policy harmony_story_insert_guard on public.stories as restrictive
for insert to authenticated with check (
 user_id=(select auth.uid())
 and length(btrim(title)) between 1 and 160
 and length(btrim(content)) between 1 and 10000
 and category in ('Kids','Teens','Adult','Adults','Marriage','Finance')
 and (media_url is null or
  media_url like 'https://ndqhfftzumulkydznwgf.supabase.co/storage/v1/object/public/media/'||(select auth.uid())::text||'/%'
  or media_url like 'https://ndqhfftzumulkydznwgf.supabase.co/storage/v1/object/public/story-media/'||(select auth.uid())::text||'/%')
);
-- Restrictive guards apply even when a permissive legacy policy already exists.
drop policy if exists harmony_owned_media_insert_guard on storage.objects;
drop policy if exists harmony_owned_media_delete_guard on storage.objects;
drop policy if exists harmony_owned_media_update_guard on storage.objects;
drop policy if exists harmony_owned_media_delete on storage.objects;
create policy harmony_owned_media_insert_guard on storage.objects as restrictive
for insert to public with check (
 bucket_id not in ('media','story-media') or (
  (select auth.uid()) is not null and (storage.foldername(name))[1]=(select auth.uid())::text
 )
);
create policy harmony_owned_media_delete_guard on storage.objects as restrictive
for delete to public using (
 bucket_id not in ('media','story-media') or (
  (select auth.uid()) is not null and (storage.foldername(name))[1]=(select auth.uid())::text
 )
);
create policy harmony_owned_media_update_guard on storage.objects as restrictive
for update to public using(bucket_id not in ('media','story-media'))
with check(bucket_id not in ('media','story-media'));
create policy harmony_owned_media_delete on storage.objects for delete to authenticated
using(bucket_id in ('media','story-media') and (storage.foldername(name))[1]=(select auth.uid())::text);
update storage.buckets set file_size_limit=20971520,
 allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/ogg']
where id in ('media','story-media');
commit;
