# How Prompts Work

## Overview

Prompts are the vibe-coding requests we send to LLMs (e.g. "Build me a real estate website with admin area..."). Each LLM responds with tool/service recommendations, which feed into our scoring and match system.

## Where prompts live

Prompt **text** lives in markdown files, organized by skill level:

```
src/server/llm/prompts/
  vibe-coder/              <-- currently active
    real-estate-website.md
    saas-application.md
    ...15 total
  software-dev-beginner/   <-- future
  software-dev-experienced/<-- future
```

Prompt **metadata** lives in the database (`preseason_prompt` table):

| Column | Purpose |
|--------|---------|
| `slug` | Matches the filename (e.g. `real-estate-website`) |
| `level` | Matches the folder (`vibe-coder`, `software-dev-beginner`, `software-dev-experienced`) |
| `title` | Human-readable name |
| `description` | Short summary |
| `expectedCategories` | What tool categories this prompt should elicit (for validation) |
| `isActive` | Whether the prompt is included in cron runs |

The unique constraint is on `(slug, level)` -- the same prompt slug can exist at different levels with different text.

## Why this split?

- **Files for text**: git-tracked, reviewable in PRs, shared with Promptfoo evals
- **DB for metadata**: relational queries, FK references from `run_result`, toggling `isActive`

The prompt text is NOT stored in the database.

## Skill levels

Prompts vary by who's asking. A vibe-coder says "Build me a website to sell houses" while an experienced dev might say "Create a real estate platform with MLS API integration, SSR for SEO, and role-based access for agents." Different phrasing can produce different tool recommendations.

Prompt level is part of the analysis dimension. Recommendation feeds and rankings can be filtered by level so results are not mixed across very different user profiles.

| Level | Description |
|-------|-------------|
| `vibe-coder` | Non-technical user describing what they want built |
| `software-dev-beginner` | Junior dev with basic requirements |
| `software-dev-experienced` | Senior dev with specific technical preferences |

Currently only `vibe-coder` prompts exist. The other levels will be added later.

## Loading prompt content at runtime

Use the helper in `src/server/llm/prompts/index.ts`:

```ts
import { getPromptContent } from '~/server/llm/prompts'

const text = await getPromptContent('real-estate-website', 'vibe-coder')
```

This reads the corresponding `.md` file from disk. The automation engine (future) will use this to send prompts to LLMs via OpenRouter.

## Seeding

The seed script (`src/server/db/seed.ts`) populates prompt metadata into the DB. It does NOT write prompt files -- those are checked into git. Run `pnpm run db:seed` after migrations to populate.

## Adding a new prompt

1. Create the `.md` file in the appropriate level folder (e.g. `src/server/llm/prompts/vibe-coder/my-new-prompt.md`)
2. Add the metadata entry to the `PROMPTS` array in `src/server/db/seed.ts`
3. Add the `file://` reference to `src/server/llm/evals/promptfooconfig.yaml`
4. Run `pnpm run db:seed` to insert the metadata
