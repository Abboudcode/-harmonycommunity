# Repository update: preserve English and Arabic

This patch is based on Abboudcode/-harmonycommunity main at c382e4e4144ba574af3806348c514922f89c1570, not the older desktop copy.

## Changes
- Preserve all eight existing pages, English/Arabic text, language persistence and RTL layout.
- Centralize the current Supabase project in site-config.js. About and Contact previously used a different older project.
- Share one Supabase client across helpers and page code.
- Complete the password-recovery UI in both languages.
- Let the Supabase SDK process authentication redirects once; avoid duplicate code exchange and move auth callback requests outside the callback lock.
- Accept 8–128-character new passwords and allow existing long passwords at sign-in.
- Validate attachment MIME types and sizes, use safe extensions, and restrict rendered URLs to the configured project's media buckets.
- Never retry failed story inserts with user_id or media fields removed.
- Abort publishing when uploads fail, guard double submissions, restore the form on failure and attempt unused-upload cleanup.
- Keep Contact drafts visible: the existing contact form still honestly states that it is a demo and does not send messages.
- Restore mobile navigation and visible keyboard focus.
- Keep private email addresses out of display-name fallbacks.
- Add an optional restrictive database/storage security migration.

## Database setup
The site still uses the repository's existing Supabase project. GitHub Pages hosts the static files; it does not run the database.
After reviewing and backing up the project, run supabase_harmony_security_upgrade.sql AFTER the existing supabase_harmony_full_setup.sql.
The new migration adds restrictive policies instead of assuming permissive older policies are absent.
Existing stories are not deleted or migrated. No live database changes have been made.

## Verification
Run with Node 24:
  npm install
  npm test

11 local DOM/script checks passed, plus the database security check:
- All eight pages switch English/Arabic and RTL/LTR correctly.
- The recovery dialog updates passwords using the selected language.
- A failed post write is not retried without ownership.
- Invalid attachment MIME types and off-project media URLs are rejected.

A separate local PostgreSQL check validates the security migration and repeatability.
Live email delivery, storage uploads, database access and visual browser layout still require acceptance testing.
The broad feature upgrade from the earlier desktop-folder work has NOT been substituted into the live bilingual website.
Guest stories and comments are now implemented in this working copy; see GUEST-ACCESS.md for activation.
