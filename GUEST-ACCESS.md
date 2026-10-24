# Guest stories and comments

Visitors can share stories and comment without registration, email or password. Supabase creates an internal anonymous browser session only when the visitor submits; merely reading does not create a session. Registered accounts remain optional.

English, Arabic and right-to-left layout are preserved. Guests are shown publicly as Anonymous and can edit/delete their own stories and comments while their browser retains the same identity. Clearing browser storage, switching accounts or moving to another browser can lose guest ownership access. Existing stories are preserved.

## Activate once in Supabase
1. Open the existing project from site-config.js in the Supabase dashboard.
2. Enable Anonymous Sign-Ins in Authentication settings.
3. Review and run supabase_guest_access.sql in SQL Editor after backing up the project. This single file includes the earlier setup and security policies plus the comments table and guest ownership/rate-limit rules. It can be rerun.
4. Merge the guest-stories-comments pull request only when these settings are ready.
5. Test in a private browser window: read, share a guest story, comment, edit/delete your own contribution, then switch English/Arabic.

The guest flow creates no email/password signup form. Comments are public. Guests cannot edit/delete another browser's contributions. Media cleanup for deleted stories remains a separate owner/admin storage maintenance task; public copies may persist.

## Verification
npm install
npm test

Local checks cover all eight English/Arabic pages; recovery and safe uploads; guest identity creation on demand; simultaneous submissions reusing a single guest identity; safe comment rendering and owner edit/delete; and a repeatable PostgreSQL setup enforcing ownership, anonymity, cascade deletion and posting limits.

Live Supabase settings were not changed by the code update. End-to-end live activation requires the dashboard steps above.
