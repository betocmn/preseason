# Background Cron + OpenRouter Audit

## Scope

This audit verified the two live background execution paths against the real
local database and the real OpenRouter key:

- `GET /api/cron/benchmark-run`
- `POST /api/match-run`

Audit timing:

- Local date: March 25, 2026
- Raw artifact timestamps: March 26, 2026 UTC

Raw artifacts:

- Baseline: `.context/background-smoke/2026-03-26T00-27-08-750Z-baseline/artifact.json`
- Post-fix: `.context/background-smoke/2026-03-26T00-35-04-521Z-post-fix/artifact.json`

## Fixture Matrix

Benchmark smoke panel:

- Prompts: `real-estate-website`, `chat-application`
- Models: `gemini-2-5-flash`, `gpt-5-4-mini`, `claude-haiku-4-5`, `qwen3-coder-next`
- Total benchmark cases: `8`

Match smoke panel:

- Category: `auth`
- Tools: `supabase` vs `clerk`
- Template: `balanced-comparison-v1`
- Total match evaluations: `8`

The smoke season is created as `verification-smoke-*`, used for the run, then
archived so future benchmark cron executions continue to target the real active
season.

## Baseline Results

### Benchmark Route

- HTTP status: `200`
- Run status: `qc_failed`
- Completed cases: `2/8`
- Invalid-output cases: `6/8`
- Unresolved tool count: `8`

What failed:

- Anthropic, OpenAI, and Qwen all completed the LLM call but were stored as
  `invalid_output` because the runner treated OpenRouter's returned dated model
  IDs as model drift.
- Gemini was the only provider that completed end to end without the drift bug.

Observed false-positive drift examples:

- `anthropic/claude-haiku-4.5` -> `anthropic/claude-4.5-haiku-20251001`
- `openai/gpt-5.4-mini` -> `openai/gpt-5.4-mini-20260317`
- `qwen/qwen3-coder-next` -> `qwen/qwen3-coder-next-2025-02-03`

### Match Route

- HTTP status: `200`
- Batch status: `failed`
- Completed evaluations: `2/8`
- Invalid-output evaluations: `6/8`

What failed:

- The same drift bug blocked Anthropic, OpenAI, and Qwen before the parsed
  match appendix could be stored.
- Gemini completed both presentation-order evaluations.

## Fixes Applied

### 1. Added a Repeatable Smoke Harness

New command:

```bash
pnpm run verify:background -- --label <name>
```

What it does:

- Reuses existing frozen prompt versions and model snapshots
- Creates an isolated smoke season in the real DB
- Invokes the exported route handlers directly, using the same auth checks and
  runner logic as the app routes
- Injects an ephemeral `CRON_SECRET` in-process if `.env.local` does not define
  one
- Writes raw JSON artifacts under `.context/background-smoke/`
- Archives the smoke season after the run

### 2. Fixed Model Drift Detection

`checkModelDrift()` now:

- Keeps strict comparison when the requested model already uses an explicit
  snapshot/build suffix
- Treats dated OpenRouter alias returns as the same model when the request used
  an alias
- Tolerates provider reordering like `claude-haiku-4.5` vs
  `claude-4.5-haiku-20251001`
- Still flags real family/tier changes like `gpt-4o` vs `gpt-4o-mini`

### 3. Fixed Deploy Cron Configuration

`vercel.json` now schedules only the route that actually exists:

- `/api/cron/benchmark-run`

The stale `/api/cron/run` and `/api/cron/settle` entries were removed.

## Post-Fix Results

### Benchmark Route

- HTTP status: `200`
- Run status: `qc_failed`
- Completed cases: `8/8`
- Invalid-output cases: `0/8`
- Unresolved tool count: `11`

What improved:

- The false model-drift failures disappeared.
- All four providers completed and stored parsed benchmark outputs.

Why the smoke run still ended as `qc_failed`:

- The smoke panel intentionally has only `2` prompt versions, so it will always
  fail the production QC threshold that expects at least `5`.
- The unresolved-tool rate remained high at `~22.45%`, which is a real data
  quality finding from live model outputs on this small panel.

### Match Route

- HTTP status: `200`
- Batch status: `failed`
- Completed evaluations: `6/8`
- Invalid-output evaluations: `2/8`

What improved:

- Anthropic, Gemini, and OpenAI all completed both presentation orders.
- Drift no longer blocked Anthropic or OpenAI after the fix.

What still failed:

- `qwen3-coder-next` failed both evaluations with strict parser errors:
  - `Required; Required`
  - `Malformed JSON: Expected ',' or ']' after array element in JSON at position 2248 (line 15 column 13)`

This is now a genuine prompt/structured-output reliability issue, not a drift
classification issue.

## Confirmed Bugs

### Fixed

1. OpenRouter alias returns were falsely classified as model drift, which broke
   both benchmark and match persistence for Anthropic, OpenAI, and Qwen.
2. `vercel.json` scheduled two deleted cron routes, which would have produced
   production 404s.

### Remaining

1. `qwen3-coder-next` is not reliable enough for the strict match appendix
   contract. It still produces invalid outputs in the real match batch flow.
2. `/api/match-run` is executable, but the repo still has no built-in dispatcher
   or schedule that discovers pending batches and submits `batchId`s.
3. `.env.local` on this machine does not define `CRON_SECRET`. The new harness
   works around that locally, but real deployed cron execution still requires
   the environment variable to be set.
4. The local `dotenv-cli` installation is broken on this machine because
   `/opt/homebrew/bin/dotenv` points to a missing Python 3.11 interpreter.
   Existing `pnpm run db:*` scripts are affected here even though the new smoke
   harness is not.

## Findings

1. The benchmark cron path is operational after the drift fix: route auth,
   runner execution, OpenRouter transport, strict parser, and DB persistence all
   worked end to end on the smoke panel.
2. The match execution path is operational for manual batch execution, but its
   structured-output reliability is model dependent. Qwen is the current outlier.
3. Tool resolution still leaves a meaningful number of unresolved tool names in
   a real run, so manual alias/candidate review remains part of the operating
   model.

## Recommended Next Steps

1. Set `CRON_SECRET` in the real deployment environment before relying on cron.
2. Decide whether to remove `qwen3-coder-next` from match batches or harden the
   match prompt/parser contract for that model family.
3. Add a dispatcher route or external scheduler for pending match batches if
   match execution should become fully automated.
