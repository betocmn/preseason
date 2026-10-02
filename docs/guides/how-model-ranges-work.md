# Continuous model ranges

Public rankings, tool summaries, prompts, and match comparisons default to all published benchmark history. Explicit date, season, prompting-level, and capability-tier filters still apply. Unpublished and quality-failed benchmark runs do not contribute. Scoring weights, confidence intervals, coverage, and publication thresholds are unchanged.

Each curated catalog entry has a stable `range.id` and explicit version order. Historical snapshots resolve through their recorded `requestedModelId`; their identity, settings, and results are never rewritten. GPT continues through Astra, historical coding models through Sol, and Mini through Luna. DeepSeek V3.2 belongs exclusively to the Flash line, separate from Pro.

Public dropdowns group ranges by company. Labels span the oldest and newest versions with valid decisions in published runs. A line with one measured version shows only its product-line name. Enabling a release does not extend its label until results publish. Public match breakdowns sum counts by range and recalculate win rates from those counts. Internal breakdowns retain exact snapshots.

`modelRangeId` is the public ranking filter and URL parameter. Legacy `modelSnapshotId` selections resolve to the entire range, including archived snapshots reused across seasons. The UI replaces legacy URLs while retaining other filters. Conflicting selections are validation errors. Range membership participates in scoring cache keys, and publication invalidates measured labels and public pages.

## Production rollout

No schema migration is needed. The rollout script defaults to a read-only transaction and reads the commented production URL after `PROD SUPABASE` in `.env.local` when `--production` is supplied. It never changes that file or prints credentials.

```sh
node --env-file=.env.local --import tsx scripts/rollout-model-ranges.ts --production --dry-run
```

Save the returned `sourceFingerprint`. Prepare the target with that exact value:

```sh
node --env-file=.env.local --import tsx scripts/rollout-model-ranges.ts --production --prepare --expected-source SOURCE_FINGERPRINT
```

Preparation clones the source season's exact 60 frozen prompt-version IDs and protocol, reuses unchanged snapshots with their original settings, and creates the refreshed 20-model matrix (1,200 cases). New catalog entries remain inactive and the target remains a draft until activation. It does not start a run.

Deploy the application first. Activation checks the protected deployment manifest, representative smoke evidence for every changed model, and the OpenRouter key's unchanged $20 monthly limit and remaining budget. The smoke report contains `finishedAt`, `after.limit`, `after.remaining`, and `results` entries with `modelId`, `promptId`, `level`, `params`, `parseStatus`, and `drift`. Each changed model must pass distinct beginner and advanced frozen prompts with the exact proposed settings. Provider-default reasoning is used; unsupported sampling values are omitted and stored as null. Repair and review workloads retain their existing settings.

```sh
node --env-file=.env.local --import tsx scripts/rollout-model-ranges.ts --production --activate --expected-source SOURCE_FINGERPRINT --smoke-report .context/panel-smoke.json
```

Activation locks the affected tables, rechecks the source fingerprint and prepared matrix, archives superseded entries, completes `season-dev-3`, and activates `season-dev-4` in one transaction. Source unfinished work or changed state aborts the transaction. Repeating preparation or activation verifies the existing result and returns without duplicating it. Historical runs, publication state, results, and frozen prompts are preserved. Existing quality failures and unfinished work in older seasons are outside this rollout.

The protected `POST /api/benchmark-rollout` refreshes public caches after activation. It uses the existing `CRON_SECRET`. `GET` on the same route verifies the deployed runtime contract without changing data.

Vercel Bot Protection remains set to Challenge. The `Benchmark rollout endpoint` firewall rule bypasses it only when Request Path equals `/api/benchmark-rollout`; other paths retain their protection. Both endpoint methods still require `CRON_SECRET` and reject unauthenticated requests with 401. Supply the deployed production credential through the process environment when it differs from the local development value, without changing `.env.local` or logging the credential.

The next full benchmark starts on the 5th at 12:00 UTC. Vercel processes frequently on the 5th–8th and polls for recovery on other days. Match and candidate-review schedules are unchanged. The estimated full run costs about $13 using historical token counts; reasoning, retries, and repairs can change the actual cost.
