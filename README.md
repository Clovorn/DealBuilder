# OneRonnoco Deal Builder

A rebuild of the Ronnoco sales team's Deal Builder, wired to a **single**
Supabase database — the OneRonnoco project (`gmttcwimwvdupqnxbiaq`) — instead of
the original three-project setup (catalog + deal-pipeline + distributor-leads).

The UI is the same proven app the team already uses. What changed is the data
layer: every read and write now flows through one client against OneRonnoco's
**native** model — `deals.stage` + integer `current_step`, `assigned_rep_id` /
`customer_id` foreign keys, `leads` + `lead_events`, and `deal_events` for the
audit trail. Deals now link to the customer record of truth automatically.

## Architecture

- **One client** — `src/lib/supabase.js`, env-driven, points at OneRonnoco.
- **`src/lib/oneronnoco.js`** — the translation layer. Maps the UI's
  phase/string-step vocabulary to native stage/integer-step, resolves reps to
  `users.id`, and does customer match-or-create on deal submit.
- **`src/lib/dealPipeline.js`** — same function names the UI imports, but every
  body now runs against OneRonnoco `deals` / `deal_events` / `deal_bundles`.
- **`src/lib/leadsPortal.js`** — leads against native `leads` / `lead_events`,
  scoped by `assigned_rep_id`.
- **`src/lib/useAuth.js`** — reads `public.users` (not the old `user_profiles`).
- A `user_profiles` **compatibility view** and `admin_list_users` /
  `get_my_director` RPCs keep the admin + profile screens working unchanged.

## Prerequisites

1. **Apply the schema migration** to the OneRonnoco project (idempotent —
   already applied during the build, included here for reproducibility):
   `supabase/migrations/20260602_oneronnoco_deal_builder.sql`
2. **Deploy the admin edge function** (only needed for in-app user creation):
   ```
   supabase functions deploy admin-create-user --project-ref gmttcwimwvdupqnxbiaq
   ```
   It needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the function env
   (Supabase sets these automatically for deployed functions).
3. **Users/auth are already migrated** — the OneRonnoco project has auth
   accounts 1:1 with `public.users`. Reps sign in with their email. If a rep
   has no working password yet, use the standard Supabase password-reset/invite
   flow (or the admin "create user" screen for net-new people). The existing
   apps are unaffected — they authenticate against the separate catalog project,
   which this build never touches.

## Local development

```bash
cp .env.example .env       # fill in the OneRonnoco URL + anon/publishable key
npm install
npm run dev                # http://localhost:5173
```

## Deploy to GitHub + Netlify

1. Create a new GitHub repo and push this folder:
   ```bash
   git init && git add . && git commit -m "OneRonnoco Deal Builder — single-DB rebuild"
   git branch -M main
   git remote add origin git@github.com:<you>/oneronnoco-deal-builder.git
   git push -u origin main
   ```
2. In Netlify: **Add new site → Import from Git**, pick the repo.
   Build settings come from `netlify.toml` (build `npm run build`, publish
   `dist`, Node 20, SPA redirect).
3. In **Site settings → Environment variables**, add:
   - `VITE_SUPABASE_URL` = `https://gmttcwimwvdupqnxbiaq.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the OneRonnoco publishable key
   - `VITE_LOGO_URL` (optional)
4. Deploy. The first build provisions the PWA service worker automatically.

## Notes & follow-ups

- **Customer linking** is on: submitting a deal matches an existing customer
  (by account number, then name + city/state or email) or creates a new
  `ONE-######` placeholder customer, and stamps `deals.customer_id`.
- **Email notification preference** (old pipeline `team_members` table) has no
  native equivalent yet — the Profile toggle is a default-on no-op until a
  native preference column is added. The in-app notification bell works fully.
- **RLS**: the app uses the anon/publishable key. Tighten Row Level Security on
  OneRonnoco before wide rollout; the email-based scoping of the old app is now
  FK-based, which makes future RLS policies straightforward.
