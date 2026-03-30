# Going To Prod

## Purpose

This document is the production runbook for launching Preseason's benchmark
pipeline and public benchmark pages.

It covers:

- what must be done before deployment
- what an admin must do after the site is live
- what the public site will and will not show in the first 24 hours

## Current Production Blockers

As of March 26, 2026, these are the main blockers or caveats:

1. The benchmark cron is still designed as a once-per-day full run.
   It must be converted to chunked execution before production, because the
   current active season is too large for one Vercel invocation.
2. ~~`pnpm run db:seed` is not production-safe as-is.~~ **Resolved.**
   `db:seed` now only seeds reference data (categories, tools, LLMs, prompts).
   Synthetic benchmark and critic data moved to `pnpm run db:seed-dev`.
3. ~~There is no admin UI for managing LLMs or prompts.~~ **Resolved.**
   Admin CRUD pages now exist at `/beto-admin/llms` and `/beto-admin/prompts`
   with full create/edit/delete/toggle-active support.
4. Cron execution in production requires `CRON_SECRET` to be set.
5. ~~Runs only become public after an admin publishes them, and publishing is
   allowed only when the run is `completed` and `qcStatus = passed`.~~
   **Resolved.** QC-passing runs now auto-publish. Manual publish remains only
   as a backfill path for legacy completed runs.

## What Production Needs

### Environment Variables

Set these in Vercel production:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `OPENROUTER_API_KEY`
- `CRON_SECRET`

Notes:

- `OPENROUTER_API_KEY` is required for benchmark and match execution
- `CRON_SECRET` is required for both cron routes
- `SUPABASE_SERVICE_ROLE_KEY` exists in `src/env.js` but is currently unused by
  the app code

### Database

Before launch:

1. Point `DATABASE_URL` at the production Postgres / Supabase database
2. Run migrations with `pnpm run db:migrate`
3. Do not run `pnpm run db:push`

### Reference Data

The benchmark season freeze flow snapshots active prompts and active LLMs from
the database. Before production cron can work, production data must already
contain:

- categories
- tools
- tool aliases
- LLM rows
- prompts
- at least one active weight config
- at least one active match prompt template if you plan to use internal match
  batches

Important:

- `pnpm run db:seed` now seeds only production-safe reference data
- Synthetic benchmark/critic data lives in `pnpm run db:seed-dev` (do not run
  this against production)

### Admin Access

The benchmark admin lives under `/beto-admin`.

`/admin` redirects there, but the actual admin URL is `/beto-admin`.

Before launch, make sure your user profile has role `admin`. Otherwise you will
not be able to:

- create seasons
- freeze seasons
- review tool candidates
- backfill legacy runs if needed

## Recommended Pre-Deploy Checklist

1. Land the benchmark batching change from
   `docs/implementation/benchmark-cron-batching-plan.md`
2. Re-run the real OpenRouter smoke verification on the final code
3. Confirm `vercel.json` cron schedules are the intended production schedules
4. Prepare a production-safe reference-data load path
5. Run production migrations
6. Set production environment variables in Vercel
7. Confirm your own account is `admin`
8. Deploy

## Immediate Post-Deploy Checks

After the first production deploy:

1. Open the site and confirm basic app health
2. Log into `/beto-admin`
3. Open `/beto-admin/benchmark/weight-configs` and confirm exactly one weight
   config is active
4. Verify the database already contains the prompts and LLMs you expect to
   freeze into the season
5. Manually call the cron routes once with the production `CRON_SECRET` and
   confirm they return `200`

Suggested manual checks:

- `GET /api/cron/benchmark-run`
- `GET /api/cron/match-run`

The match cron is not required for public `/matches` pages to function, but it
should still be healthy if you plan to use background match batches.

## Admin Workflow In Production

### 1. Create the Benchmark Season

In `/beto-admin/benchmark`:

1. Click `New Season`
2. Create the new season record
3. Open the season detail page

At this point the season is still `draft`.

### 2. Freeze the Season

On `/beto-admin/benchmark/seasons/<seasonId>`:

1. Click `Freeze Season`

This is the important transition. Freeze does all of the following:

- snapshots the active prompts into immutable prompt versions
- snapshots the active LLMs into immutable model snapshots
- creates the full case matrix
- changes the season status from `draft` to `active`

After freeze, verify:

- prompt count looks correct
- model count looks correct
- the resulting case count is what you expect

With the current active local panel shape, a full benchmark season is
`45 prompts x 20 models = 900 cases`.

### 3. Let Cron Populate Runs

Once the season is `active`, the benchmark cron should start filling in runs.

Use:

- `/beto-admin/benchmark`
- `/beto-admin/benchmark/seasons/<seasonId>`
- `/beto-admin/benchmark/runs/<runId>`

to watch progress.

What to look for on the run page:

- case counts are increasing
- status eventually becomes `published` or `qc_failed`
- `invalid_output` is low
- drift errors are absent
- unresolved tool names are manageable

### 4. Review Tool Candidates

Open:

- `/beto-admin/benchmark/tool-candidates`

Any unknown tool names extracted from live model outputs land here.

This review matters because unresolved tool decisions count against QC and do
not contribute cleanly to rankings.

Do this continuously during the first few days of production, because live
outputs will surface naming variants you did not seed as aliases yet.

### 5. QC-Passing Runs Auto-Publish

Open the run detail page:

- `/beto-admin/benchmark/runs/<runId>`

Once a run finishes with:

- `qcStatus = passed`

it is automatically moved to `published` and starts contributing to public
rankings, matches, and prompt summaries.

Manual publish is still available only for older completed runs that predate
auto-publish.

If the run is `qc_failed`, fix the actual issue first. Common causes are:

- too many unresolved tool names
- too many invalid outputs
- too few completed prompt/model cases

### 6. Manage Season Changes

When you want to change the prompt panel or model panel:

1. stop treating the current season as the live benchmark panel
2. click `Complete Season` on the active season page
3. create a new season
4. freeze the new season

Do not mutate an active season's frozen panel in place.

## What The Public Site Will Show In The First 24 Hours

## Short Answer

Yes, the website can be technically usable in the first 24 hours, but the
benchmark story should still be considered early and incomplete.

## What Must Happen First

Public rankings and matches do not read raw in-progress runs.

They read the latest published benchmark season and published benchmark runs.

So, in the first 24 hours, the public benchmark pages stay empty until:

1. a benchmark run finishes
2. QC passes
3. the run auto-publishes

If none of that has happened yet:

- `/rankings` shows no published benchmark data
- `/matches` shows no benchmark matchups yet

## What Can Be Visible After Day One

With the current active panel shape, one published daily run can already meet
the `>= 100 eligible decisions` threshold for several categories, because the
threshold is per category and the season has `20` models.

Current estimated eligible decisions per single published run:

- `hosting`: `300`
- `database`: `260`
- `orm`: `260`
- `auth`: `220`
- `email`: `140`
- `storage`: `140`
- `search`: `100`
- `ui-components`: `100`

These categories can clear the minimum eligible-decision threshold after the
first published run, assuming the run completes and publishes cleanly.

Categories below that threshold after one run:

- `analytics`: `80`
- `notifications`: `80`
- `styling`: `80`
- `api`: `60`
- `payments`: `60`
- `realtime`: `60`
- `state`: `60`
- `cms`: `40`

Those should still show insufficient data states after day one.

## Important Nuance

Even if some categories become visible after the first published run, the repo's
own benchmark launch bar is still much higher:

- at least `21` published daily runs in the active season
- enough category coverage
- enough decisive head-to-head trials
- zero published drift incidents

So the right interpretation is:

- **Usable in the first 24 hours:** yes, technically
- **Ready for strong benchmark claims in the first 24 hours:** no

## Matches In The First 24 Hours

Public `/matches` pages are generated from published benchmark decisions, not
from the internal match-batch cron.

That means:

- you do not need internal match batches for public match pages to render
- you do need published benchmark runs
- many head-to-heads may still show thin-data states because public matchups
  require `>= 30` decisive trials

## Recommended Public Rollout Positioning

### Day 0 to Day 1

- Launch the site
- Confirm benchmark cron is healthy
- Do not market the rankings as stable yet
- Expect some benchmark pages to be empty or marked insufficient

### Days 2 to 7

- Review tool candidates daily
- Investigate any `qc_failed` runs
- Watch which categories consistently clear thresholds

### After 21 Published Runs

This is the first point where the benchmark can be positioned as an
authoritative recurring signal rather than a fresh experiment.

At that point, re-check:

- run QC health
- unresolved tool backlog
- category threshold coverage
- head-to-head sample sizes
- public methodology wording

## Practical Step-By-Step Summary

1. Implement benchmark batching before launch
2. Migrate the production database
3. Load production-safe reference data
4. Set production env vars
5. Deploy
6. Confirm your account has admin access
7. Create and freeze the benchmark season in `/beto-admin/benchmark`
8. Let cron accumulate cases
9. Review tool candidates
10. Publish only QC-passing runs
11. Expect partial public usefulness on day one
12. Treat `>= 21` published runs as the real benchmark public launch bar
