# How Prompts Work

## Overview

Prompt text and prompt metadata now live in the database. There are no prompt
markdown files on disk anymore.

The runtime source of truth is the `preseason_prompt` table:

| Column | Purpose |
|--------|---------|
| `slug` | Stable identifier used in URLs and versioning |
| `level` | Audience segment (`vibe-coder`, `software-dev-beginner`, `software-dev-experienced`) |
| `title` | Human-readable prompt name |
| `description` | Short summary for public/admin views |
| `expected_categories` | The categories this prompt should produce decisions for |
| `content_md` | The actual prompt body sent into the benchmark prompt builder |
| `is_active` | Whether the prompt is available for the active corpus |

The unique key is `(slug, level)`.

## Runtime Loading

`src/server/llm/prompts/index.ts` no longer reads the filesystem. It resolves
prompt content from `preseason_prompt.content_md`:

```ts
import { getPromptContent } from '~/server/llm/prompts'

const content = await getPromptContent('real-estate-website', 'vibe-coder', db)
```

That helper is used by the public prompt pages and by benchmark-related flows
that still need the current prompt body.

## Prompt Freezing

Benchmark runs do not execute directly from mutable prompt rows. Before a prompt
is used in a season, it is frozen into `preseason_benchmark_prompt_version`.

Each frozen prompt version stores:

- The prompt content snapshot
- A SHA-256 content hash
- The prompt tier (`basic`, `intermediate`, `advanced`)
- The prompt contract version
- The system prompt snapshot used at freeze time
- The eligible categories for that version

This happens in `src/server/llm/benchmark/prompt-freezer.ts`. If the prompt
content or eligible categories change, freezing creates a new version instead of
mutating historical data.

## Prompt Levels

Prompt levels are still part of the corpus:

| Level | Description |
|-------|-------------|
| `vibe-coder` | Non-technical builder describing an outcome |
| `software-dev-beginner` | Junior developer with some technical detail |
| `software-dev-experienced` | Experienced developer with explicit technical constraints |

Season 1 is still mostly `vibe-coder` web-app prompts, but the schema supports
multiple levels without mixing them accidentally.

## Editing the Corpus

The seeded prompt corpus currently lives in `src/server/db/seed.ts`, where both
metadata and `contentMd` are inserted together.

When you change prompt text:

1. Update the prompt row content and metadata.
2. Freeze a new benchmark prompt version for any season that should use it.
3. Re-run tests that touch prompt freezing, ranking, or runner behavior.

## Prompt Export for Evals

Because prompts live in the DB, external eval tooling should export from the DB
instead of reading checked-in markdown files:

```bash
pnpm run evals:export -- --output .context/promptfoo/prompts.json
```

The export includes both `rawPrompt` and `benchmarkPrompt`, so you can test
either the plain prompt body or the full benchmark contract in external tools.
