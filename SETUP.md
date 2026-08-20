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

### State as of 2026-08-20 — deployed and live

**The app is live at `https://lakewooddeliveries.com`.** The infrastructure half
of this runbook is done; what remains is the authenticated post-deploy checks
below, which need a real sign-in.

What is in place:

- Vercel project **`courier`** (`prj_hCRgALWYVHZuFCL9r5oNgiKo6XFp`, team
  `team_dBqX4yNuk7SW7tmGNqdYE4d6`). Do **not** create a second one.
- The GitHub repo `aberk123/Courier` was **already linked**, production branch
  `main`. Framework preset `nextjs`, Node 24.x, no root directory override.
- Production serves `main` @ `7622734` (the PR #1 merge), confirmed by commit
  sha and by `next.config.ts` in that commit carrying `bodySizeLimit: "6mb"`.
  So the 1 MB import bug is *not* in the live build.
- Env vars, **re-scoped 2026-08-20** (all three had been set to
  `preview` *and* `production`, which pointed every preview build of every
  branch at the real subscriber list, service-role key included):
  - Production only: `NEXT_PUBLIC_SUPABASE_URL`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
  - Preview only: the two `NEXT_PUBLIC_*` vars now point at the
    `browser-testing` branch project `txfulvngxgjwdoicurdv`.
  - **Preview has no service-role key**, deliberately. `/users` will not render
    on a preview deployment. If preview ever needs it, add the *branch's* key —
    never the production one.
- Domains: apex `lakewooddeliveries.com` plus `www.lakewooddeliveries.com` as a
  308 redirect to the apex. Both verified, both `misconfigured: false`.
- Cloudflare zone `3e928fc09c0e19417a04dde270bc71d1`, which had **no records at
  all** beforehand. Added, all three grey-cloud (DNS only):

  | Type | Name | Content |
  | --- | --- | --- |
  | A | `lakewooddeliveries.com` | `216.150.1.1` |
  | A | `lakewooddeliveries.com` | `216.150.16.1` |
  | CNAME | `www` | `19a6b68550b854f8.vercel-dns-016.com` |

- Unrelated: Ari also set up **Vercel Connect** for `api.anthropic.com/courier`.
  That issues federated tokens for a deployment to call Anthropic's API. It is
  not a deploy credential and is not used by this app.

Verified from outside on the live domain: valid TLS (`CN=lakewooddeliveries.com`),
`/` → 307 `/login`, `/login` renders 200, and `/users`, `/import`, `/zones` and
`/cover-sheet` all redirect an unauthenticated visitor to `/login`. The HTML the
apex serves is byte-identical to the production alias, so the domain is on the
production build and not a stale one.

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

These are the ones that pass in dev and can still fail in production. The
deploying session could run none of them — each needs a signed-in session and it
had no production password. Real use since has settled the first two; **checks 3
and 4 are still outstanding.**

1. Sign in as `ari@thevoiceoflakewood.com` (already courier-office in production).
   **Done.** Three production accounts have signed in successfully:
   `ari@thevoiceoflakewood.com` at 17:21:53 UTC, `rdonath@circmag.com` at
   17:22:20, and `amrom@mailpak.com` at 18:31:45 on 2026-08-20, each confirmed by
   `auth.users.last_sign_in_at`.
2. Generate a password reset link from Manage Users and confirm its host is
   `lakewooddeliveries.com`. Those links are built from `X-Forwarded-Host`, so a
   proxy misconfiguration silently produces links pointing at the wrong domain —
   and they look fine until someone clicks one.
   **Effectively confirmed in production on 2026-08-20, by real use rather than
   by testing.** A reset link generated from Manage Users at 18:31:37 was opened
   by its recipient at 18:31:45: `/auth/confirm` ran, Supabase logged a
   successful `/verify` and a `Login`, and `auth.users.last_sign_in_at` moved. A
   link pointing at the wrong host could not have produced any of that, since the
   recipient would never have reached our own route. The one thing this does not
   pin down is *which* origin the link carried — that depends on the host the
   office had open when generating it — so if the office ever works from the
   `*.vercel.app` alias, links will carry that instead of the apex.
3. Download a booklet PDF for a real zone. Production has 2,623 stops across 5
   zones; the largest route is far bigger than anything tested on the branch, and
   PDF rendering is the heaviest thing in the app.
   *Not run, and this is the one most likely to actually fail.*
   `src/app/(app)/zones/[number]/booklet/route.tsx` calls `renderToBuffer`,
   which builds the whole PDF in memory in one shot, and **no route in the app
   exports `maxDuration`** — so the booklet runs on Vercel's default function
   timeout. If the largest real route times out or runs out of memory, add
   `export const maxDuration = 60` (or higher, plan permitting) to that route
   before reaching for anything more invasive.
4. Import a spreadsheet over 1 MB. If it 500s, the `bodySizeLimit` setting in
   `next.config.ts` did not ship — meaning the deploy came from the wrong branch.
   *Cause ruled out, functional run still pending.* The live build is `main` @
   `7622734`, and that commit's `next.config.ts` does carry
   `bodySizeLimit: "6mb"`, so the wrong-branch failure mode is excluded.
   When running this for real, **upload and review only — do not click apply.**
   The check is about whether the upload survives the body-size cap, and
   stopping at the review table exercises that fully without writing a single
   row to the real subscriber list.

### Running the deploy from a Claude Code session

This was done from a session on 2026-08-20, with the network policy widened and
both tokens injected. What that took, and what still bites:

- `vercel.com`, `api.vercel.com`, `api.cloudflare.com` and
  `lakewooddeliveries.com` were all reachable. **`www.lakewooddeliveries.com`
  was not** — the egress gateway still answers 403 to CONNECT for it, because
  the allowlist entry is the bare apex. Add the `www` host too if the redirect
  itself ever needs checking from a session.
- The `VERCEL_TOKEN` supplied was **project-scoped**, not account-scoped:
  `/v9/projects` and everything under the `courier` project worked, but
  `/v2/user`, `/v2/teams` and `/v5/domains` all returned `forbidden` /
  `not_found`. That is enough for the whole deploy. Don't waste time concluding
  the token is broken because `/v2/user` 404s.
- Env vars stored with Vercel's **`sensitive`** type cannot be read back, even
  with `?decrypt=true` — the API returns an empty value. Overwrite rather than
  try to verify such a value in place.
- Reading env vars with `?decrypt=true` writes live secrets into the session.
  Fetch only the vars you actually need; there is no reason to decrypt
  `SUPABASE_SERVICE_ROLE_KEY` just to confirm its *scope*, which the
  undecrypted listing already shows.

For reference, if starting from a policy that has not been widened:
`api.vercel.com` is reachable by default but `vercel.com`,
`api.cloudflare.com` and `lakewooddeliveries.com` are not, so `vercel login`
cannot work (its browser flow needs `vercel.com`) — use a `VERCEL_TOKEN` with
the CLI or REST API instead, and expect Cloudflare DNS to be untouchable.

To do the whole deploy from a session, the environment's network policy must
allow `vercel.com`, `api.cloudflare.com`, and `lakewooddeliveries.com`,
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
