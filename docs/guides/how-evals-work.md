# How Evals Work

## Overview

Promptfoo is still a local-only development tool, but the repo now ships one
checked-in regression suite for the benchmark prompt contract:

- `promptfooconfig.major-tools.yaml` exercises a few representative prompts
- `pnpm run evals:major-tools` prepares fixtures under `.context/promptfoo/`
  and runs Promptfoo against OpenRouter models using `.env.local`
- `pnpm run evals:export` still exports the full DB-backed prompt corpus for
  ad hoc Promptfoo work outside the built-in regression suite

## Production vs. Promptfoo

| | Production benchmark | Local Promptfoo evals |
|---|---|---|
| Purpose | Generate authoritative benchmark data | QA prompts and model behavior during development |
| Source prompts | `preseason_prompt` + frozen prompt versions | JSON export from `pnpm run evals:export` |
| Trigger | `/api/cron/benchmark-run` or admin workflows | Your terminal |
| Stored data | `benchmark_run`, `benchmark_case_result`, `benchmark_case_decision` | Local files only |

## Built-In Major Tool Regression Evals

This suite is targeted at the prompt behavior we care about after tightening
the system prompt: recommend major, category-defining tools and avoid generic
phrases, plugins/themes, and custom-built pseudo-tools.

Run it with:

```bash
pnpm run evals:major-tools
```

What it does:

1. Selects a small benchmark regression set from the existing prompt corpus:
   `saas-application/intermediate`, `real-estate-website/intermediate`, and
   `blog-platform-cms/advanced`
2. Writes generated fixtures to `.context/promptfoo/`
3. Runs Promptfoo against:
   - `openrouter:openai/gpt-5.4-mini`
   - `openrouter:anthropic/claude-haiku-4.5`
   - `openrouter:google/gemini-2.5-flash`
4. Saves results to:
   - `.context/promptfoo/major-tool-results.json`
   - `.context/promptfoo/major-tool-results.html`

The suite contains deterministic assertions that:

- require a valid `<preseason_benchmark_json>` appendix
- require exactly one decision per expected category
- fail obvious low-signal tool names such as generic category phrases and
  plugin/theme/custom-system style outputs

### Requirements

- `OPENROUTER_API_KEY` in `.env.local`
- A working network connection
- Optional: a working `DATABASE_URL` in `.env.local`

If the local DB is unavailable, fixture generation falls back to the seeded
prompt corpus in `src/server/db/prompt-corpus.ts`.

### Useful Variants

Prepare fixtures without running Promptfoo:

```bash
pnpm run evals:major-tools:prepare
```

Re-run Promptfoo manually against the prepared fixtures:

```bash
npx promptfoo@0.120.19 eval \
  -c promptfooconfig.major-tools.yaml \
  -t .context/promptfoo/major-tool-tests.json \
  --env-path .env.local \
  -j 1 \
  --no-share
```

Limit the run to one provider while iterating:

```bash
npx promptfoo@0.120.19 eval \
  -c promptfooconfig.major-tools.yaml \
  -t .context/promptfoo/major-tool-tests.json \
  --env-path .env.local \
  --filter-providers 'openrouter:openai/gpt-5.4-mini' \
  --no-share
```

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

## Current Boundaries

- The built-in Promptfoo suite is a regression harness, not the source of truth
- Production benchmark runs still go through the app runner, parser, and DB
- Prompt exports remain useful for broader exploratory eval work
