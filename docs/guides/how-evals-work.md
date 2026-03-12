# How Evals Work

## Overview

Promptfoo is now an optional, external development tool. The repository no
longer ships prompt markdown files or a checked-in `promptfooconfig.yaml`.

If you want to run Promptfoo locally, export the DB-backed prompt corpus first
and wire that export into your own Promptfoo config.

## Production vs. Promptfoo

| | Production benchmark | Local Promptfoo evals |
|---|---|---|
| Purpose | Generate authoritative benchmark data | QA prompts and model behavior during development |
| Source prompts | `preseason_prompt` + frozen prompt versions | JSON export from `pnpm run evals:export` |
| Trigger | `/api/cron/benchmark-run` or admin workflows | Your terminal |
| Stored data | `benchmark_run`, `benchmark_case_result`, `benchmark_case_decision` | Local files only |

## Exporting Prompts

Export the active prompt corpus:

```bash
pnpm run evals:export -- --output .context/promptfoo/prompts.json
```

Export all prompts, including inactive ones:

```bash
pnpm run evals:export -- --all --output .context/promptfoo/prompts-all.json
```

The export requires a working `DATABASE_URL` in `.env.local`.

## Export Shape

Each exported prompt includes:

- `rawPrompt` - the plain `content_md` body from `preseason_prompt`
- `benchmarkPrompt` - the full prompt after `buildBenchmarkPrompt(...)` adds the
  strict appendix contract
- `slug`, `level`, `title`, `expectedCategories`, and `isActive`

Use `benchmarkPrompt` when you want Promptfoo to mirror production benchmark
behavior as closely as possible.

## What the Repo No Longer Provides

- No checked-in prompt markdown directory
- No checked-in Promptfoo config file
- No production dependency on Promptfoo

That cleanup is intentional: the benchmark system is DB-backed, and Promptfoo is
now downstream of the app rather than the source of truth.
