-- One-time setup for guest stories and comments. Review and back up first.
-- Harmony Community FULL setup for your NEW Supabase project
-- Run this once in Supabase SQL Editor.

create table if not exists public.stories (
  id bigserial primary key,
  title text not null,
  content text not null,
  category text not null default 'General',
  is_anonymous boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  media_url text,
  media_type text,
  created_at timestamptz not null default now()
);

alter table public.stories
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists media_url text,
  add column if not exists media_type text;

create index if not exists stories_created_at_idx on public.stories (created_at desc);
create index if not exists stories_category_idx on public.stories (category);

alter table public.stories enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stories'
      AND policyname = 'Harmony public can read stories'
  ) THEN
    CREATE POLICY "Harmony public can read stories"
    ON public.stories
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stories'
      AND policyname = 'Harmony signed in users can insert stories'
  ) THEN
    CREATE POLICY "Harmony signed in users can insert stories"
    ON public.stories
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  END IF;
END $$;

-- Storage policies for optional image/video uploads.
-- Before testing media upload, create a PUBLIC bucket named: media

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Harmony signed in users can upload media'
  ) THEN
    CREATE POLICY "Harmony signed in users can upload media"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id IN ('media', 'story-media'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Harmony public can read media'
  ) THEN
    CREATE POLICY "Harmony public can read media"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (bucket_id IN ('media', 'story-media'));
  END IF;
END $$;

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


-- Guest stories and comments: no registration, email or password required.
begin;
create table if not exists public.story_comments (
 id bigserial primary key,
 story_id bigint not null references public.stories(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 4000),
 is_anonymous boolean not null default true,
 author_name text not null default 'Anonymous',
 created_at timestamptz not null default now()
);
create index if not exists story_comments_story_date on public.story_comments(story_id,created_at desc,id desc);
alter table public.story_comments enable row level security;
create or replace function public.harmony_guest_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); guest boolean:=coalesce((auth.jwt()->>'is_anonymous')::boolean,false); n integer; meta jsonb;
begin
 if uid is null then raise exception 'A browser guest session or signed-in session is required'; end if;
 if new.user_id is distinct from uid then raise exception 'Not your contribution'; end if;
 if tg_op='UPDATE' then
  if new.id<>old.id or new.user_id is distinct from old.user_id then raise exception 'Ownership cannot change'; end if;
  new.created_at:=old.created_at;
  if tg_table_name='story_comments' and new.story_id<>old.story_id then raise exception 'Parent story cannot change'; end if;
 else
  new.created_at:=now();
  perform pg_advisory_xact_lock(hashtext(uid::text),hashtext(tg_table_name));
  if tg_table_name='stories' then
   select count(*) into n from public.stories where user_id=uid and created_at>now()-interval '10 minutes';
   if n>=5 then raise exception 'Please wait before sharing another story'; end if;
  else
   select count(*) into n from public.story_comments where user_id=uid and created_at>now()-interval '10 minutes';
   if n>=30 then raise exception 'Please wait before commenting again'; end if;
  end if;
 end if;
 if guest then new.is_anonymous:=true; end if;
 if tg_table_name='stories' then
  if length(btrim(new.title)) not between 1 and 160 or length(btrim(new.content)) not between 1 and 10000 then raise exception 'Invalid story length'; end if;
 else
  select raw_user_meta_data into meta from auth.users where id=uid;
  if coalesce((meta->>'always_anonymous')::boolean,false) then new.is_anonymous:=true; end if;
  new.author_name:=case when new.is_anonymous then 'Anonymous' else left(coalesce(nullif(btrim(meta->>'display_name'),''),'Member'),60) end;
 end if;
 return new;
end $$;
revoke all on function public.harmony_guest_guard() from public;
drop trigger if exists harmony_guest_guard on public.stories;
create trigger harmony_guest_guard before insert or update on public.stories for each row execute function public.harmony_guest_guard();
drop trigger if exists harmony_guest_guard on public.story_comments;
create trigger harmony_guest_guard before insert or update on public.story_comments for each row execute function public.harmony_guest_guard();
drop policy if exists harmony_stories_owner_update on public.stories;
drop policy if exists harmony_stories_owner_delete on public.stories;
drop policy if exists harmony_stories_update_guard on public.stories;
drop policy if exists harmony_stories_delete_guard on public.stories;
create policy harmony_stories_owner_update on public.stories for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy harmony_stories_owner_delete on public.stories for delete to authenticated using(user_id=auth.uid());
create policy harmony_stories_update_guard on public.stories as restrictive for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy harmony_stories_delete_guard on public.stories as restrictive for delete to authenticated using(user_id=auth.uid());
grant update,delete on public.stories to authenticated;
do $$ declare p record; begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='story_comments' loop
  execute format('drop policy %I on public.story_comments',p.policyname);
 end loop;
end $$;
create policy story_comments_read on public.story_comments for select to anon,authenticated using(true);
create policy story_comments_insert on public.story_comments for insert to authenticated with check(user_id=auth.uid());
create policy story_comments_update on public.story_comments for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy story_comments_delete on public.story_comments for delete to authenticated using(user_id=auth.uid());
revoke all on public.story_comments from anon,authenticated;
grant select on public.story_comments to anon,authenticated;
grant insert,update,delete on public.story_comments to authenticated;
grant usage,select on sequence public.story_comments_id_seq to authenticated;
-- Create the public media bucket if this project has not created one yet.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('media','media',true,20971520,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/ogg'])
on conflict(id) do nothing;
commit;

