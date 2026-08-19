# Setup

## Environment

Copy `.env.example` to `.env.local` and fill in the Supabase project's URL
and publishable (anon) key (Supabase dashboard → Settings → API). The
Supabase project itself (`lakewood-courier`, in the MyMatSH org) already
has the schema applied — see `supabase/migrations/` for what ran.

## Bootstrapping the first admin (courier office) account

There's a chicken-and-egg problem on a fresh database: access is
role x publication (see `docs/domain-notes.md`), but nobody has any
access rows yet. To create the first admin:

1. Sign up normally through `/login`'s underlying Supabase project (via
   the Supabase dashboard → Authentication → Add user, or have the
   person sign up once the app exposes a sign-up flow — not yet built).
2. Then, in the Supabase SQL editor, grant that account courier-office
   access (full access to every publication):

   ```sql
   update public.profiles
   set is_courier_office = true
   where id = (select id from auth.users where email = 'the-real-admin-email@example.com');
   ```

From there, that account can be used to grant scoped
`user_publication_access` rows to other staff (once an admin UI for that
exists — not yet built; do it via the SQL editor for now).

## Local development

```
npm install
npm run dev
```

Requires outbound network access to your Supabase project's host
(`https://<project-ref>.supabase.co`) from wherever you run this. That
works normally on a local machine or once deployed (e.g. to Vercel);
some remote sandboxed dev environments block direct outbound
connections to arbitrary hosts by policy, which would need to be
allowed there separately if you hit `fetch failed` errors from Supabase
calls.

On Node.js >= 22.21 running behind an HTTP(S)_PROXY, set
`NODE_USE_ENV_PROXY=1` so the built-in `fetch` (used by the Supabase
client) actually honors the proxy — otherwise requests silently bypass
it and fail.
