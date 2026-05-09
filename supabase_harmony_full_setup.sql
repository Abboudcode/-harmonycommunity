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
