# How Evals Work

## Overview

Evals use [Promptfoo](https://promptfoo.dev) as an **ad-hoc development tool** to test prompt quality and LLM response quality before deploying changes. Evals are NOT part of the production cron pipeline.

## Two separate pipelines

| | Production Cron | Promptfoo Evals |
|---|---|---|
| **When** | Daily automated runs | Ad-hoc, from your terminal |
| **Purpose** | Generate tool recommendations for the site | QA prompts and LLM responses during development |
| **Data** | Stored in DB (`run_result`, `recommendation`) | Stored locally (`promptfoo-results.json`) |
| **Triggered by** | Cron / manual API call | `npx promptfoo eval` |

The production cron calls LLMs, parses responses, and extracts tool recommendations. It does NOT evaluate response quality -- if parsing succeeds, the recommendation is valid.

Promptfoo evals are for you (the developer) to validate that prompts produce useful, parseable responses before shipping them.

## Running evals

```bash
# Run all evals (requires OPENROUTER_API_KEY in .env.local)
npx promptfoo eval --config src/server/llm/evals/promptfooconfig.yaml

# View results in browser
npx promptfoo view
```

## Config location

The Promptfoo config lives at `src/server/llm/evals/promptfooconfig.yaml`.

## What gets evaluated

The config sends each of the 15 prompt files to each of the 8 LLM providers (120 combinations) and checks:

### Assertions

1. **Valid JSON** -- Response should be parseable JSON (or contain JSON in a code block)
2. **Tool recommendations** -- Response should mention recognizable tool names (Supabase, Stripe, Vercel, etc.)
3. **Category coverage** -- Response should reference at least 2 tool categories (auth, database, hosting, etc.)
4. **Minimum length** -- Response should be substantial (500+ chars for full score)

## Providers

All 8 LLMs from the `preseason_llm` table, called via OpenRouter:

- Claude 3.5 Sonnet, Claude 3 Opus (Anthropic)
- GPT-4o, GPT-4o Mini (OpenAI)
- Gemini 1.5 Pro (Google)
- Llama 3.1 70B (Meta)
- Mistral Large (Mistral AI)
- DeepSeek V2.5 (DeepSeek)

## When to run evals

- After adding or editing a prompt file
- After adding a new LLM provider
- After changing the system prompt or response format
- Before merging prompt-related PRs

## Output

Results are written to `promptfoo-results.json` (gitignored). Use `npx promptfoo view` to open an interactive dashboard showing pass/fail per prompt per LLM.

## File structure

```
src/server/llm/
  evals/
    promptfooconfig.yaml    <-- config with providers, prompts, and assertions
  prompts/
    vibe-coder/*.md         <-- prompt files referenced by the config
  service/                  <-- future OpenRouter client (not evals-related)
```
