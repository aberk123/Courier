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

The domain is registered on Cloudflare. The decision (Ari, 2026-08-20) is that
**the dashboard** lives there — staff sign in at `lakewooddeliveries.com`. The
database stays on its Supabase hostname; Supabase's Custom Domains add-on was
considered and not taken, since nothing user-facing shows the API URL.

### State as of 2026-08-20

- A Vercel project named **`courier`** already exists, with Production, Preview
  and Development environments. Do **not** create a second one — list projects
  and link to this one.
- That project already has `SUPABASE_SERVICE_ROLE_KEY` set (Ari added it).
  Confirm it is scoped to Production before relying on it.
- Still to do: link the repo, set the two `NEXT_PUBLIC_*` vars, deploy from
  `main`, attach the domain, add DNS, then run the post-deploy checks below.
- Unrelated: Ari also set up **Vercel Connect** for `api.anthropic.com/courier`.
  That issues federated tokens for a deployment to call Anthropic's API. It is
  not a deploy credential and is not used by this app.

### Production values

```
NEXT_PUBLIC_SUPABASE_URL=https://qysltpkdmuozsphftzps.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Yn7zh9tlaB73Xo9XNrlhug_cJ6ydbSL
SUPABASE_SERVICE_ROLE_KEY=<from the dashboard; already set in Vercel>
```

The publishable key is public by design — it ships in every browser bundle and
RLS is what protects the data. The service_role key is the opposite: server-only,
never `NEXT_PUBLIC_`-prefixed, and it bypasses RLS entirely.

**Scope the two `NEXT_PUBLIC_*` vars to Production only.** For Preview, use the
test branch's URL and keys instead, or every preview deployment of every future
branch becomes a live editor for the real subscriber list.

### Deploy from `main`, not a feature branch

Vercel deploys the repo's default branch. Work merged only into a
`claude/...` branch will not ship. Check what `main` actually contains before
concluding a deploy is broken.

### Cloudflare DNS

Add the records Vercel prints when the domain is attached, then set both records
to **DNS only** (grey cloud). Vercel already terminates TLS and serves from its
own edge, so Cloudflare's proxy adds nothing here — and with the proxy on and
SSL/TLS mode left at "Flexible" you get an infinite redirect loop, which is the
classic Cloudflare-in-front-of-Vercel failure. Staying DNS-only also means no
zone-settings change is needed.

No Supabase change is required. Reset links deliberately point at the app's own
`/auth/confirm` rather than Supabase's `/verify`, so the project's redirect
allowlist is not involved.

### Post-deploy checks

These are the ones that pass in dev and can still fail in production:

1. Sign in as `ari@thevoiceoflakewood.com` (already courier-office in production).
2. Generate a password reset link from Manage Users and confirm its host is
   `lakewooddeliveries.com`. Those links are built from `X-Forwarded-Host`, so a
   proxy misconfiguration silently produces links pointing at the wrong domain —
   and they look fine until someone clicks one.
3. Download a booklet PDF for a real zone. Production has 2,623 stops across 5
   zones; the largest route is far bigger than anything tested on the branch, and
   PDF rendering is the heaviest thing in the app.
4. Import a spreadsheet over 1 MB. If it 500s, the `bodySizeLimit` setting in
   `next.config.ts` did not ship — meaning the deploy came from the wrong branch.

### Running the deploy from a Claude Code session

`api.vercel.com` is reachable under the default cloud network policy, but
`vercel.com`, `api.cloudflare.com` and `lakewooddeliveries.com` are **not** —
the egress gateway answers 403 to CONNECT. Consequences:

- `vercel login` cannot work: its browser flow needs `vercel.com`. Use a
  `VERCEL_TOKEN` with the CLI or the REST API instead.
- Cloudflare DNS cannot be touched, and the live site cannot be checked on its
  real domain (only on its `*.vercel.app` URL).

To do the whole deploy from a session, the environment's network policy must
also allow `vercel.com`, `api.cloudflare.com`, and `lakewooddeliveries.com`,
and these environment variables must be set:

| Variable | Where it comes from | Scope needed |
| --- | --- | --- |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens | Account/team owning `courier` |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens | Zone:Read + DNS:Edit, restricted to the `lakewooddeliveries.com` zone |

Both network-policy and environment-variable changes only take effect in a
container created *after* the change — they are injected at container start, so
an already-running session will not see them. Start a new session.

### Next.js specifics worth knowing before it goes wrong

- **Server Action CSRF check.** Next compares the request `Origin` against
  `Host`/`X-Forwarded-Host` and rejects mismatches. A straightforward
  Cloudflare → Vercel setup forwards the real host and needs nothing. If actions
  start failing with origin errors, add the domain to
  `experimental.serverActions.allowedOrigins` in `next.config.ts` — don't
  disable the check.
- **`bodySizeLimit` is set to `6mb`** and must stay above the import's own 5 MB
  limit. The framework rejects an oversized body *before* the action runs, which
  surfaces as a bare 500 with nothing shown to the user.
- **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`** only matters if the app is ever
  self-hosted across multiple instances; Vercel handles it. Set a stable shared
  key if that changes, or actions break on one instance and not another.
- Node >= 20.9 is required (Next 16.3.1). Vercel's default is newer; leave it.
- On Node >= 22.21 behind a proxy, set `NODE_USE_ENV_PROXY=1` or `fetch`
  silently bypasses the proxy. This bites the Vercel CLI too, not just Supabase.
