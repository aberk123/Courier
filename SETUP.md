# Setup

## Environment

Copy `.env.example` to `.env.local` and fill in the Supabase project's URL
and publishable (anon) key (Supabase dashboard → Settings → API). The
Supabase project itself (`lakewood-courier`, in the MyMatSH org) already
has the schema applied — see `supabase/migrations/` for what ran.

Also set `SUPABASE_SERVICE_ROLE_KEY` (same API settings page, "service_role"
key — **not** the publishable/anon key) as a **server-only** env var, both
in `.env.local` and in Vercel's project environment variables. It powers the
Manage Users page (inviting users, generating password-reset links via the
Supabase Admin API). Never prefix it with `NEXT_PUBLIC_` — it bypasses Row
Level Security entirely and must never reach the browser.

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

From there, that account can sign in and use the "Manage users" page
(visible in the header for courier-office accounts) to invite other staff,
set their courier-office/publication-scoped access, and generate
password-reset links — no more manual SQL needed beyond this first
bootstrap step.

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

## Deploying to lakewooddeliveries.com

The domain is registered on Cloudflare (bought 2026-08-20). The decision is that
**the dashboard** lives there — staff sign in at `lakewooddeliveries.com`. The
database stays on its Supabase hostname; Supabase's own Custom Domains add-on
was considered and not taken, since nothing user-facing shows the API URL.

None of this can be done from a sandboxed session — it needs the Cloudflare
account and a hosting account. Steps, in order:

1. **Deploy the app** (Vercel is the natural fit for Next.js; nothing here
   depends on Vercel specifically). Import the repo, framework preset Next.js,
   default build command.
2. **Set the environment variables** on the host, for Production *and* Preview:
   - `NEXT_PUBLIC_SUPABASE_URL` — `https://qysltpkdmuozsphftzps.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` — server-only, no `NEXT_PUBLIC_` prefix
   Point Preview deployments at the test branch, not production, or a preview
   URL becomes a live editor for the real subscriber list.
3. **DNS in Cloudflare.** A `CNAME` for the apex (Cloudflare flattens it) and
   for `www`, per the host's instructions. Proxy status can stay on; see the
   caveat below.
4. **Verify the password-reset flow specifically.** `siteOrigin()` in
   `src/app/(app)/users/actions.ts` builds reset links from `X-Forwarded-Host`,
   so a misconfigured proxy silently produces links pointing at the wrong
   domain. Generate one from Manage Users and confirm the link's host is
   `lakewooddeliveries.com` before handing any out. (These links deliberately go
   to our own `/auth/confirm` rather than Supabase's `/verify`, so the project's
   redirect allowlist is *not* involved — see the comment on `confirmUrl`.)

### Next.js specifics worth knowing before it goes wrong

- **Server Action CSRF check.** Next compares the request `Origin` against
  `Host`/`X-Forwarded-Host` and rejects mismatches. A straightforward
  Cloudflare → host setup forwards the real host and needs nothing. If actions
  start failing with origin errors, add the domain to
  `experimental.serverActions.allowedOrigins` in `next.config.ts` — don't
  disable the check.
- **`bodySizeLimit` is already set to `6mb`** in `next.config.ts`. It must stay
  above the import's own 5 MB limit: the framework rejects an oversized body
  *before* the action runs, which surfaces as a bare 500 with nothing shown to
  the user. This bit us with a 2 MB file on the default 1 MB cap.
- **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`** only matters if the app is ever
  self-hosted across multiple instances; Vercel handles it. Set a stable shared
  key if that changes, or actions break on one instance and not another.
