# Going To Prod

## Purpose

This is the production launch runbook for the code currently on `main`.

It is based on the repo state as of March 30, 2026 and is meant to answer two
practical questions:

1. what still needs to be done before the first real production benchmark run
2. how to get public benchmark data visible fast enough for a demo without
   waiting a full day

## Repo-Verified Current State

These points are already true in the current codebase:

- Benchmark cron is already chunked and resumable.
  - `vercel.json` runs `/api/cron/benchmark-run` every `10` minutes.
  - Each invocation processes `8` benchmark cases.
  - Unfinished runs are resumed before a new day is started.
  - Stale run recovery uses a `15` minute threshold.
- Match cron already exists.
  - `vercel.json` runs `/api/cron/match-run` every `15` minutes.
  - `vercel.json` runs `/api/cron/tool-candidate-review` every `30` minutes.
- Benchmark runs auto-publish when final QC passes.
  - New passing runs do not need a manual publish click.
- Public benchmark pages only read `published` runs.
  - Until the first run is published, public rankings, public matches, and the
    homepage prompt carousel stay empty.
- Public `/matches` pages are built from published benchmark decisions.
  - They do not depend on direct match batches.
- Direct match cron only executes existing match batches.
  - It does not create them automatically from benchmark runs.
- `pnpm run db:seed` is production-safe reference data only.
  - It seeds admin users, categories, tools, aliases, LLMs, and prompts.
  - It does not seed seasons, benchmark runs, critics, or comments.
- `pnpm run db:migrate` runs a post-migrate hook that already seeds:
  - default match prompt templates
  - canonical tool reconciliation invariants

## What Is Still Not Bootstrapped Automatically

These are the remaining manual setup items:

- A benchmark protocol row is not seeded automatically.
  - There is admin UI to create seasons, but no admin UI to create protocols.
  - You must insert at least one benchmark protocol row in Supabase before you
    can create a season.
- A model weight config is not seeded automatically.
  - You need exactly one active weight config before cron work is meaningful.
- A benchmark season is not created or frozen automatically.
  - An admin must create the season and click `Freeze Season`.
- Tool candidate review cron does not auto-resolve unknown tool names.
  - It only writes AI suggestions.
  - An admin still needs to approve or reject candidates in
    `/beto-admin/benchmark/tool-candidates`.
  - Approval auto-replays unresolved decisions.
- Critics and comments are not created automatically.
  - The homepage "Latest Verified Critics" section stays empty until you add
    real critic data.

## Hard Requirements

### Vercel

- Use Vercel `Pro` or `Enterprise`.
  - This repo defines cron schedules every `10`, `15`, and `30` minutes.
  - Vercel Hobby rejects cron schedules that run more than once per day.
- Only the production deployment should be treated as the live benchmark
  target.
  - That is the deployment cron jobs will hit.

### Supabase

- Email OTP sign-in must work.
  - The app uses email OTP for login and signup.
  - For a real public launch, configure custom SMTP.
  - For a quick demo, the seeded admin email can be enough if that inbox is
    usable, but do not rely on default email delivery for a broad launch.

## Environment Variables

Set these in Vercel production:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENROUTER_API_KEY`
- `CRON_SECRET`

Strongly recommended:

- `NEXT_PUBLIC_APP_URL`
  - used for metadata base URLs
  - used as the OpenRouter HTTP referer

Currently unused by app code:

- `SUPABASE_SERVICE_ROLE_KEY`

## Production Database Commands

Be careful here: the package scripts for database work load `.env.local`.

That is convenient in local dev, but it is easy to migrate or seed the wrong
database by accident when preparing production.

For production setup, prefer running the underlying commands with an explicit
`DATABASE_URL` in your shell instead of relying on `.env.local`.

Use this pattern:

```bash
export DATABASE_URL="postgres://..."

pnpm exec tsx src/server/db/pre-migrate.ts
pnpm exec drizzle-kit migrate
pnpm exec tsx src/server/db/post-migrate.ts
pnpm exec tsx src/server/db/seed.ts
```

Important:

- do not run `pnpm run db:push`
- do not run `pnpm run db:seed-dev`
- do not run `pnpm run db:seed-benchmark`

## Launch Timing Reality

### First Benchmark Run Size

Current seeded reference data produces:

- `45` active prompts
- `20` active LLMs
- `900` benchmark cases per frozen season run

Current benchmark cron capacity:

- `8` cases per invocation
- one invocation every `10` minutes
- `144` invocations per day
- `1152` cases/day of total scheduled capacity

That means:

- one full `900` case benchmark run needs `113` invocations
- cron-only completion time is about `18h 50m` after season freeze

### What This Means For Your Demo

If you freeze a season and do nothing else:

- the first published run should still happen in less than `24` hours
- it will not reliably happen within `12` hours

If you want first public data inside `12` hours, you should manually trigger
extra benchmark cron invocations immediately after freezing.

Two workable options:

1. Recommended: manually call `/api/cron/benchmark-run` in a serial loop until
   the run finishes and auto-publishes.
2. Minimum front-load for a `~12h` finish: manually trigger about `45-50`
   extra chunks right after freeze, then let normal cron finish the rest.

Do not parallelize those manual calls. The runner is resumable and ownership
guarded, but the fastest reliable path is still one chunk at a time.

## What Public Pages Will Show After The First Published Run

Once the first benchmark run is `published`:

- the homepage prompt carousel can populate
- the homepage featured matches can populate
- `/rankings` can populate
- `/matches` can populate

Current prompt-covered subcategories all clear the ranking publication
thresholds after one published run:

- `analytics`: `240` eligible decisions
- `api`: `180`
- `auth`: `660`
- `cms`: `120`
- `database`: `780`
- `email`: `420`
- `hosting`: `900`
- `notifications`: `240`
- `orm`: `780`
- `payments`: `180`
- `realtime`: `180`
- `search`: `300`
- `state`: `180`
- `storage`: `420`
- `styling`: `240`
- `ui-components`: `300`

These seeded subcategories still stay empty because the current prompt corpus
does not cover them:

- `monitoring`
- `ai`
- `testing`
- `ci-cd`
- `jobs`

Important nuance for public matches:

- the public matches UI can appear after the first published run
- many individual matchups may still display "Insufficient data"
- that label clears only when a specific head-to-head reaches `30` decisive
  cases

Important nuance for the homepage:

- the benchmark-driven sections can populate after the first published run
- the "Latest Verified Critics" section stays hidden until you create critic
  comments manually

## Recommended Launch Sequence

### 1. Prepare Supabase Production

Create the production Supabase project and collect:

- project URL
- anon key
- direct Postgres connection string for `DATABASE_URL`

Also make sure email OTP sign-in is usable for the admin account you plan to
use.

### 2. Run Production Migrations

From your machine, with the production `DATABASE_URL` exported:

```bash
pnpm exec tsx src/server/db/pre-migrate.ts
pnpm exec drizzle-kit migrate
pnpm exec tsx src/server/db/post-migrate.ts
```

### 3. Seed Production Reference Data

Still against the production `DATABASE_URL`:

```bash
pnpm exec tsx src/server/db/seed.ts
```

This seeds:

- `humberto.mn@gmail.com` as an admin user profile
- category groups and subcategories
- tools and aliases
- LLM catalog rows
- prompts

### 4. Insert The Benchmark Protocol

Run this once in the Supabase SQL editor:

```sql
insert into public.preseason_benchmark_protocol (
  slug,
  name,
  description,
  mode,
  parser_version,
  scoring_version,
  prompt_contract_version,
  "createdAt"
)
values (
  'benchmark-v1',
  'Benchmark Protocol v1',
  'Standard benchmark protocol for tool recommendation evaluation',
  'benchmark',
  '1.0',
  '1.0',
  '1.0',
  now()
)
on conflict (slug) do nothing;
```

Without this row, the "New Season" admin page has no usable protocol to select.

### 5. Verify Admin Access

If you are using the seeded admin email, confirm that account is the one you
will log into.

If you need a different email to be admin, update it directly in Supabase
before launch.

### 6. Configure Vercel Production

Set the production env vars:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENROUTER_API_KEY`
- `CRON_SECRET`
- `NEXT_PUBLIC_APP_URL`

Then deploy to production.

### 7. Confirm Base App Health

After the production deploy:

1. open the site
2. confirm the public homepage loads
3. log in at `/login`
4. confirm `/beto-admin` opens successfully

### 8. Create And Activate A Weight Config

Open:

- `/beto-admin/benchmark/weight-configs`

Create one if needed, then make sure exactly one config is active.

A simple first production config is uniform `1 / 1 / 1`.

### 9. Create The Season

Open:

- `/beto-admin/benchmark`

Then:

1. click `New Season`
2. select the benchmark protocol
3. create the season record

### 10. Freeze The Season

On the season detail page:

1. click `Freeze Season`
2. confirm the frozen counts

With the current seeded corpus, you should expect:

- `45` prompt versions
- `20` model snapshots
- `900` benchmark cases

### 11. Start Benchmark Work Immediately

Do not wait for the next scheduled cron tick.

Set:

```bash
export APP_URL="https://your-production-domain.com"
export CRON_SECRET="your-production-cron-secret"
```

Smoke test one benchmark chunk:

```bash
curl -sS \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$APP_URL/api/cron/benchmark-run"
```

If you want the first run to finish as fast as possible, keep calling it
serially until the response reports `"hasRemainingWork":false`.

Example loop:

```bash
for i in {1..130}; do
  echo "benchmark chunk $i"
  body=$(curl -sS \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$APP_URL/api/cron/benchmark-run")
  echo "$body"

  if [[ "$body" == *'"hasRemainingWork":false'* ]]; then
    break
  fi
done
```

If you do not want to babysit the full run, do at least `45-50` manual chunks,
then let normal cron finish the remaining work over the next several hours.

### 12. Keep Tool Candidate Review Moving

While benchmark chunks are running, also trigger tool-candidate review a few
times so the suggestion queue stays fresh:

```bash
curl -sS \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$APP_URL/api/cron/tool-candidate-review"
```

Then actively review:

- `/beto-admin/benchmark/tool-candidates`

Important:

- the cron writes suggestions
- it does not auto-approve them
- approval from the admin UI auto-replays unresolved benchmark decisions

### 13. Watch The First Run

Monitor:

- `/beto-admin/benchmark`
- `/beto-admin/benchmark/seasons/<seasonId>`
- `/beto-admin/benchmark/runs/<runId>`

Healthy first-run outcome:

- status becomes `published`
- `qcStatus = passed`
- public pages start filling in

### 14. If The First Run Ends As `qc_failed`

Most likely causes:

- unresolved tool names
- too many invalid outputs
- too many failed cases

Recovery path:

1. approve tool candidates in `/beto-admin/benchmark/tool-candidates`
2. let approval auto-replay unresolved decisions
3. open the run detail page
4. click `Retry Failed Cases`
5. call `/api/cron/benchmark-run` again once or a few times

Because retry resets the run to `pending`, the benchmark runner can recompute
the final QC state and auto-publish the run if the repaired metrics now pass.

## Direct Match Cron

This is optional for tomorrow's demo.

Facts to keep straight:

- public `/matches` pages already come from published benchmark runs
- direct match cron only works when pending match batches already exist
- no automatic benchmark-to-match batch creation is wired in

So if your only goal is to make public matches visible, focus on getting the
first benchmark run published. That is the actual unlock.

Only trigger `/api/cron/match-run` if you intentionally create direct match
batches in admin tooling.

## Minimal Demo Checklist

If your demo is tomorrow and you want the fewest moving parts:

1. migrate production
2. seed production reference data
3. insert benchmark protocol row
4. deploy to Vercel production with env vars
5. log into `/beto-admin`
6. create one active weight config
7. create season
8. freeze season
9. manually drive benchmark cron until the first run publishes
10. review and approve tool candidates if QC needs help

That is the shortest path to getting the homepage, rankings, and public matches
filled with real data.
