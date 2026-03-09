# Preseason: ChatGPT Review Prompt

Use this as a prompt in ChatGPT (web app) to run a design and engineering review of this repo.

---

You are a principal product + ML systems reviewer. Evaluate this repo with emphasis on the LLM automation quality, prompt quality, scheduling behavior, data model correctness, and release-readiness. Do not assume intent; cite what is currently implemented and identify improvements with priority.

## 1) What the project is

Preseason tracks how different LLMs recommend third-party developer tooling when given realistic build prompts. It turns these recommendations into: 

- public rankings, 
- per-prompt recommendation feeds,
- live tool-vs-tool matches over time windows,
- critic commentary on recommendations,
- and admin moderation of tools/critics/matches.

Core data flow: automation runs prompts against selected LLMs -> parse recommendations -> compute match/ranking signals -> surface on public pages.

## 2) How it works

### Runtime architecture

- Frontend: Next.js app router + server + client components.
- Backend API: tRPC routers in `src/server/api/routers/*`.
- DB: PostgreSQL via Drizzle ORM with `preseason_*` table prefix.
- Auth: Supabase session middleware + role-based page access.
- LLM execution: OpenRouter (`https://openrouter.ai/api/v1`) through provider abstraction in `src/server/llm/service/*`.
- Automation: scheduled in `src/server/llm/automation/*` and cron routes.

### Automation pipeline

1. Nightly cron route `/api/cron/run` creates a `pending` run with:
   - all active prompts (`is_active = true`)
   - all active LLMs (`is_active = true`)
   - `trigger = cron`, plus counts.
2. `runAutomation(runId)` executes prompt-by-prompt, llm-by-llm:
   - Loads prompt Markdown from file by slug and level.
   - Builds level-aware generation system prompt.
   - Sends completion request to selected LLM provider.
   - Parses output for recommendations.
   - If parse returns none, sends one fallback extraction pass with strict JSON schema.
   - Stores:
     - `preseason_run_result`
     - `preseason_recommendation`
   - Upserts results per `(runId, promptId, llmId)`.
3. `/api/cron/settle` runs every day and calls:
   - `settleExpiredMatches()` (active matches whose `periodEnd < today`), then
   - `generateMatches()` (creates new active matches for categories/tools with enough recommendations).

### Scoring/match behavior

- Match winner is computed by recommendation count per tool within match period/window.
- Tie => no winner.
- Settled matches keep period + scoreboard data.

### Comment system

- Users with role `critic` can create comments tied to `tool`, `match`, `recommendation`, or `prompt` targets.
- Public pages surface recent/target-specific comments.

## 3) Who’s the audience / users

### End users
- Builders/teams selecting tooling from AI recommendations.
- Developers looking for what models prefer for specific project tasks.
- Product/comparison-site style audience consuming recommendations.

### Internal roles
- `admin`: full control (tools/critics/matches, moderation actions).
- `critic`: verified expert commentary on specific entities.
- `provider` (placeholder portal): provider-facing analytics area.
- `user`: default signed-in profile.

### Business-minded audiences
- Tool vendors seeking discoverability.
- Internal teams evaluating model behavior and recommendation bias.

## 4) How we might make money (current status + ideas)

Current codebase has **no implemented monetization model** beyond the product itself.

Current hints for monetization:
- `/business` route exists but is currently placeholder text.
- Seeded `provider` role suggests future provider portal/partnering path.

Potential moves:
- Paid access to ranked data/history API.
- Provider subscription tiers for improved profile pages, lead visibility, and campaign analytics.
- Enterprise plan for custom prompt suites + private analyses.
- Historical trend exports / benchmark reporting.
- White-label / embedded leaderboard widgets.
- Sponsorship or boosted placement for neutral, clearly labeled tool promotions.

## 5) DB Schema (full)

```sql
CREATE TYPE "comment_target" AS ENUM ('recommendation', 'match', 'tool', 'prompt');
CREATE TYPE "match_status" AS ENUM ('active', 'settled', 'archived');
CREATE TYPE "parse_status" AS ENUM ('pending', 'success', 'failed');
CREATE TYPE "prompt_level" AS ENUM ('software-dev-beginner', 'software-dev-experienced', 'vibe-coder');
CREATE TYPE "run_status" AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE "user_role" AS ENUM ('admin', 'provider', 'critic', 'user');

CREATE TABLE "preseason_category_group" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(100) NOT NULL UNIQUE,
  "slug" varchar(100) NOT NULL UNIQUE,
  "description" text,
  "icon" varchar(50),
  "display_order" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone
);

CREATE TABLE "preseason_comment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "critic_id" uuid NOT NULL,
  "target_type" "comment_target" NOT NULL,
  "target_id" uuid NOT NULL,
  "content" text NOT NULL,
  "is_pinned" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone
);

CREATE TABLE "preseason_critic_profile" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(255) NOT NULL UNIQUE,
  "user_id" uuid NOT NULL UNIQUE,
  "title" varchar(255),
  "expertise_areas" text[],
  "excluded_categories" text[],
  "verified_at" timestamp with time zone,
  "verified_by" uuid,
  "is_active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone
);

CREATE TABLE "preseason_llm" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL UNIQUE,
  "provider" varchar(100) NOT NULL,
  "model_id" varchar(255) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone
);

CREATE TABLE "preseason_match" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(255) NOT NULL UNIQUE,
  "tool_a_id" uuid NOT NULL,
  "tool_b_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "status" match_status NOT NULL DEFAULT 'active',
  "started_at" timestamp with time zone,
  "settled_at" timestamp with time zone,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "tool_a_score" integer NOT NULL DEFAULT 0,
  "tool_b_score" integer NOT NULL DEFAULT 0,
  "total_prompts" integer NOT NULL DEFAULT 0,
  "winner_tool_id" uuid,
  CONSTRAINT "match_tool_order_chk" CHECK (tool_a_id < tool_b_id)
);

CREATE TABLE "preseason_prompt" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL,
  "level" prompt_level NOT NULL DEFAULT 'vibe-coder',
  "description" text,
  "expected_categories" text[],
  "is_active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone
);

CREATE TABLE "preseason_recommendation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_result_id" uuid NOT NULL,
  "tool_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "confidence" real,
  "reasoning" text,
  "rank" integer,
  "createdAt" timestamp with time zone NOT NULL
);

CREATE TABLE "preseason_run_result" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "prompt_id" uuid NOT NULL,
  "llm_id" uuid NOT NULL,
  "raw_response" text,
  "parse_status" parse_status NOT NULL DEFAULT 'pending',
  "response_time_ms" integer,
  "createdAt" timestamp with time zone NOT NULL
);

CREATE TABLE "preseason_run" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "status" run_status NOT NULL DEFAULT 'pending',
  "trigger" varchar(50) NOT NULL DEFAULT 'cron',
  "prompt_ids" uuid[],
  "llm_ids" uuid[],
  "prompt_count" integer,
  "llm_count" integer,
  "error_log" text,
  "createdAt" timestamp with time zone NOT NULL
);

CREATE TABLE "preseason_category" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "category_group_id" uuid NOT NULL,
  "name" varchar(100) NOT NULL UNIQUE,
  "slug" varchar(100) NOT NULL UNIQUE,
  "description" text,
  "icon" varchar(50),
  "display_order" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone
);

CREATE TABLE "preseason_tool_category" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tool_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  UNIQUE ("tool_id", "category_id")
);

CREATE TABLE "preseason_tool" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL UNIQUE,
  "slug" varchar(255) NOT NULL UNIQUE,
  "description" text,
  "website" varchar(512),
  "logo_url" varchar(512),
  "is_verified" boolean NOT NULL DEFAULT false,
  "provider_user_id" uuid,
  "aliases" text[],
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone
);

CREATE TABLE "preseason_user_profile" (
  "id" uuid PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  "display_name" varchar(150) NOT NULL,
  "avatar_url" varchar(512),
  "bio" text,
  "company" varchar(255),
  "website" varchar(255),
  "role" user_role NOT NULL DEFAULT 'user',
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone
);

-- Indexes
CREATE INDEX category_group_slug_idx ON preseason_category_group USING btree (slug);
CREATE INDEX category_group_display_order_idx ON preseason_category_group USING btree (display_order);
CREATE INDEX comment_target_idx ON preseason_comment USING btree (target_type, target_id);
CREATE INDEX comment_critic_id_idx ON preseason_comment USING btree (critic_id);
CREATE INDEX critic_profile_user_id_idx ON preseason_critic_profile USING btree (user_id);
CREATE INDEX critic_profile_slug_idx ON preseason_critic_profile USING btree (slug);
CREATE INDEX llm_slug_idx ON preseason_llm USING btree (slug);
CREATE INDEX llm_is_active_idx ON preseason_llm USING btree (is_active);
CREATE UNIQUE INDEX match_tools_category_period_idx ON preseason_match USING btree (tool_a_id, tool_b_id, category_id, period_start);
CREATE INDEX match_slug_idx ON preseason_match USING btree (slug);
CREATE INDEX match_status_idx ON preseason_match USING btree (status);
CREATE INDEX match_category_id_idx ON preseason_match USING btree (category_id);
CREATE UNIQUE INDEX prompt_slug_level_idx ON preseason_prompt USING btree (slug, level);
CREATE INDEX prompt_is_active_idx ON preseason_prompt USING btree (is_active);
CREATE INDEX recommendation_tool_category_idx ON preseason_recommendation USING btree (tool_id, category_id);
CREATE INDEX recommendation_run_result_id_idx ON preseason_recommendation USING btree (run_result_id);
CREATE UNIQUE INDEX run_result_run_prompt_llm_idx ON preseason_run_result USING btree (run_id, prompt_id, llm_id);
CREATE INDEX run_result_run_id_idx ON preseason_run_result USING btree (run_id);
CREATE INDEX run_status_idx ON preseason_run USING btree (status);
CREATE INDEX run_created_at_idx ON preseason_run USING btree (createdAt);
CREATE INDEX category_slug_idx ON preseason_category USING btree (slug);
CREATE INDEX category_display_order_idx ON preseason_category USING btree (display_order);
CREATE INDEX category_group_id_idx ON preseason_category USING btree (category_group_id);
CREATE UNIQUE INDEX tool_category_tool_category_idx ON preseason_tool_category USING btree (tool_id, category_id);
CREATE INDEX tool_slug_idx ON preseason_tool USING btree (slug);
CREATE INDEX tool_provider_user_id_idx ON preseason_tool USING btree (provider_user_id);
CREATE INDEX user_profile_email_idx ON preseason_user_profile USING btree (email);
CREATE INDEX user_profile_role_idx ON preseason_user_profile USING btree (role);

-- Foreign keys
ALTER TABLE preseason_comment
  ADD CONSTRAINT preseason_comment_critic_id_preseason_critic_profile_id_fk FOREIGN KEY (critic_id)
  REFERENCES preseason_critic_profile(id) ON DELETE CASCADE;

ALTER TABLE preseason_critic_profile
  ADD CONSTRAINT preseason_critic_profile_user_id_preseason_user_profile_id_fk FOREIGN KEY (user_id)
  REFERENCES preseason_user_profile(id) ON DELETE CASCADE;
ALTER TABLE preseason_critic_profile
  ADD CONSTRAINT critic_verified_by_user_fk FOREIGN KEY (verified_by)
  REFERENCES preseason_user_profile(id) ON DELETE SET NULL;

ALTER TABLE preseason_match
  ADD CONSTRAINT preseason_match_tool_a_id_preseason_tool_id_fk FOREIGN KEY (tool_a_id)
  REFERENCES preseason_tool(id) ON DELETE CASCADE;
ALTER TABLE preseason_match
  ADD CONSTRAINT preseason_match_tool_b_id_preseason_tool_id_fk FOREIGN KEY (tool_b_id)
  REFERENCES preseason_tool(id) ON DELETE CASCADE;
ALTER TABLE preseason_match
  ADD CONSTRAINT preseason_match_category_id_preseason_category_id_fk FOREIGN KEY (category_id)
  REFERENCES preseason_category(id) ON DELETE CASCADE;
ALTER TABLE preseason_match
  ADD CONSTRAINT preseason_match_winner_tool_id_preseason_tool_id_fk FOREIGN KEY (winner_tool_id)
  REFERENCES preseason_tool(id) ON DELETE SET NULL;

ALTER TABLE preseason_recommendation
  ADD CONSTRAINT preseason_recommendation_tool_id_preseason_tool_id_fk FOREIGN KEY (tool_id)
  REFERENCES preseason_tool(id) ON DELETE CASCADE;
ALTER TABLE preseason_recommendation
  ADD CONSTRAINT preseason_recommendation_category_id_preseason_category_id_fk FOREIGN KEY (category_id)
  REFERENCES preseason_category(id) ON DELETE CASCADE;
ALTER TABLE preseason_recommendation
  ADD CONSTRAINT recommendation_run_result_fk FOREIGN KEY (run_result_id)
  REFERENCES preseason_run_result(id) ON DELETE CASCADE;

ALTER TABLE preseason_run_result
  ADD CONSTRAINT preseason_run_result_run_id_preseason_run_id_fk FOREIGN KEY (run_id)
  REFERENCES preseason_run(id) ON DELETE CASCADE;
ALTER TABLE preseason_run_result
  ADD CONSTRAINT preseason_run_result_prompt_id_preseason_prompt_id_fk FOREIGN KEY (prompt_id)
  REFERENCES preseason_prompt(id) ON DELETE CASCADE;
ALTER TABLE preseason_run_result
  ADD CONSTRAINT preseason_run_result_llm_id_preseason_llm_id_fk FOREIGN KEY (llm_id)
  REFERENCES preseason_llm(id) ON DELETE CASCADE;

ALTER TABLE preseason_category
  ADD CONSTRAINT preseason_category_category_group_id_preseason_category_group_id_fk FOREIGN KEY (category_group_id)
  REFERENCES preseason_category_group(id) ON DELETE CASCADE;

ALTER TABLE preseason_tool_category
  ADD CONSTRAINT preseason_tool_category_tool_id_preseason_tool_id_fk FOREIGN KEY (tool_id)
  REFERENCES preseason_tool(id) ON DELETE CASCADE;
ALTER TABLE preseason_tool_category
  ADD CONSTRAINT preseason_tool_category_category_id_preseason_category_id_fk FOREIGN KEY (category_id)
  REFERENCES preseason_category(id) ON DELETE CASCADE;

ALTER TABLE preseason_tool
  ADD CONSTRAINT preseason_tool_provider_user_id_preseason_user_profile_id_fk FOREIGN KEY (provider_user_id)
  REFERENCES preseason_user_profile(id) ON DELETE SET NULL;
```

## 6) Description of website functionality / pages

### Public website (`src/app/(public)/`)

- `/` (Home): hero + latest prompts list + active matches + verified critic snippets.
- `/feed`: recommendation feed with category and model filters.
- `/prompts`: discover prompts with filters by level/group/subcategory.
- `/prompts/[level]/[slug]`: prompt detail (content, expected categories, top recommendations, run history, comments).
- `/prompts/[level]`: convenience redirect to canonical active prompt variant.
- `/rankings`: ranking pages with category/subcategory/time filters.
- `/rankings/[slug]`: group-level ranking page.
- `/rankings/[slug]/[subSlug]`: subcategory ranking page.
- `/matches`: live matches table/list with filters by category/subcategory/tool.
- `/matches/[slug]`: individual match detail + score breakdown + comments.
- `/tools/[slug]`: tool detail with 30-day stats, active matches, and comments.
- `/llms/[slug]`: LLM detail with recommendations grouped by category and timestamps.
- `/critics`: verified critics directory + recent commentary.
- `/critics/[slug]`: critic profile + target comments.
- `/trending`: rate trend table for tools.
- `/about`, `/methodology`, `/business`, `/privacy`, `/terms`: placeholder/coming-soon pages with static metadata.
- `/login`, `/signup`: OTP auth flows.
- `(fallback) /api/health/db`: health check.

### Admin area (`/beto-admin`, `/admin` redirects)

- route protected by `admin` role.
- `/admin` redirects to `/beto-admin/tools`.
- `/beto-admin/tools`: list + create/edit/delete tools, subcategories, verification flag.
- `/beto-admin/critics`: list/create/edit/verify critics + active/inactive state.
- `/beto-admin/matches`: list active/settled matches + create match form + settle action.

### Provider area (`/provider`)

- Protected by `provider` role.
- currently placeholder dashboard text.

### Cron + API routes

- `GET /api/cron/run`: auth-protected by `Authorization: Bearer <CRON_SECRET>`.
- `GET /api/cron/settle`: auth-protected same way.
- `GET /api/health/db`: database ping endpoint.

## 7) LLM prompts, models, and schedule

### LLM system prompts (current behavior)

`src/server/llm/service/system-prompt.ts`:

- `buildGenerationSystemPrompt(level)`:
  - persona is `software-dev-beginner | software-dev-experienced | vibe-coder`
  - constraints: suggest third-party tools only when useful; response natural + short rationale.
- `buildExtractionSystemPrompt(categorySlugs)`:
  - strict JSON format expected:
    `{"recommendations":[{"category":"<slug>","tool":"<name>","reasoning":"<1-2 sentences>","confidence":<0-1>}]}`
  - category constrained to known slugs.

`parseRecommendations` fallback extraction request content pattern in runner:
- raw text includes:
  - `Project request: <prompt content>`
  - `Assistant response: <primary completion>`
  - `Extract recommendations into JSON only.`

### LLM service / model tech stack

- Gateway: OpenRouter API (`src/server/llm/service/openrouter-client.ts`), provider normalizes model namespace prefixes.
- Provider classes: `anthropic`, `openai`, `google`, `meta`, `mistral`, `deepseek`.
- Provider aliases support (examples): `openai`, `gemini`, `metallama`, `mistralai`, `mistral`.

Seeded model set currently used in `src/server/db/seed.ts`:

- Claude 3.5 Sonnet — provider `Anthropic`, modelId `anthropic/claude-3.5-sonnet`, slug `claude-3-5-sonnet`
- GPT-4o — provider `OpenAI`, modelId `openai/gpt-4o`, slug `gpt-4o`
- Gemini 1.5 Pro — provider `Google`, modelId `google/gemini-pro-1.5`, slug `gemini-1-5-pro`
- Llama 3.1 70B — provider `Meta`, modelId `meta-llama/llama-3.1-70b-instruct`, slug `llama-3-1-70b`
- Claude 3 Opus — provider `Anthropic`, modelId `anthropic/claude-3-opus`, slug `claude-3-opus`
- GPT-4o Mini — provider `OpenAI`, modelId `openai/gpt-4o-mini`, slug `gpt-4o-mini`
- Mistral Large — provider `Mistral AI`, modelId `mistralai/mistral-large-latest`, slug `mistral-large`
- DeepSeek V2.5 — provider `DeepSeek`, modelId `deepseek/deepseek-chat`, slug `deepseek-v2-5`

### Prompt assets sent (Markdown files)

Prompts stored at `src/server/llm/prompts/vibe-coder/*.md`:

1. `real-estate-website.md`
2. `saas-application.md`
3. `blog-platform-cms.md`
4. `ecommerce-store.md`
5. `project-management-tool.md`
6. `social-media-platform.md`
7. `job-board.md`
8. `restaurant-reservation-system.md`
9. `online-learning-platform.md`
10. `multi-tenant-crm.md`
11. `weather-dashboard.md`
12. `chat-application.md`
13. `fitness-tracking-app.md`
14. `url-shortener.md`
15. `documentation-site.md`

These are loaded by `getPromptContent(slug, level)` in `src/server/llm/prompts/index.ts` and not stored in DB.

### Scheduled job cadence

In `vercel.json`:

- `/api/cron/run` at `0 6 * * *`
- `/api/cron/settle` at `0 8 * * *`

Notes:
- The route only runs if `CRON_SECRET` is configured and `Authorization: Bearer <CRON_SECRET>` header is valid.
- `/api/cron/run` uses all active prompts + active LLMs.
- `/api/cron/settle` handles both settlement and match generation in one run.

## 8) Review checklist you should apply

When you review, focus on:
- Prompt quality risks: verbosity, hallucinated tool names, non-third-party responses, confidence calibration.
- Parsing risk: strict vs heuristic extraction balance, false positives, auto-created tool quality.
- Match fairness: period generation window, tie handling, winner visibility, stale match cleanup.
- Ranking validity: consistency score and composite weighting assumptions.
- Schedule reliability: cron trigger failure modes, idempotency (`prompt x llm` overwrite behavior), recovery path.
- Data quality controls: unverified tool auto-creation, comment moderation, slug collisions, FK integrity.
