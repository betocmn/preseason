# Preseason Development Roadmap

## Overview

This roadmap breaks the Preseason MVP into agent-promptable steps. Each step is a self-contained unit of work that a coding agent can complete in one session, including writing tests.

**What is Preseason?** A website that tracks what tools/services LLMs recommend when given vibe-coding prompts. Think of it as a mix between an RL gym and a SaaS comparison site, with a Kalshi-inspired match/game UI.

**Core flow:**
1. We maintain a collection of vibe-coding prompts ("Build me a real estate website with admin area...")
2. An automated daily cron runs these against multiple LLMs via OpenRouter (evaluated with Promptfoo)
3. Each LLM recommends 3rd party tools (Supabase, Resend, Stripe, etc.) per category
4. The public website displays results in a feed with category filtering, tool rankings, head-to-head matches, and verified critic comments
5. Provider portal for tool companies to see detailed recommendation analytics
6. Admin area for managing prompts, tools, runs, matches, critics, etc.

**Status legend:** `[DONE]` `[TODO]` `[TBD]` (decision pending)

**Tech stack:** Next.js 15 App Router, tRPC v11, Drizzle ORM, Supabase (PostgreSQL + Auth), Tailwind CSS v4, shadcn/ui, Vitest + Testcontainers, OpenRouter, Promptfoo

**Conventions:**
- All tables use `preseason_*` prefix (via `pgTableCreator`)
- Migrations: edit `schema.ts` → `pnpm run db:generate` → `pnpm run db:migrate`
- Tests use Testcontainers for PostgreSQL (Docker required)
- English only (no i18n)
- Dark mode default, with light mode toggle

---

## Step 1: Rebrand & Cleanup (Wine Fair → Preseason) `[DONE]`

**Goal:** Strip all wine-domain code, rename prefixes, remove i18n, establish new project identity. No new features — just a clean slate that builds and passes checks.

### 1.1 Rename Identifiers & Config

- [x] `src/server/db/schema.ts` — Change `pgTableCreator` prefix from `wine_fair_` to `preseason_`
- [x] `src/server/db/schema.ts` — Drop ALL wine-domain tables (wine, producer, fair, region, grape_variety, review, favorite + all junction tables). Keep only `userProfiles` table (will be adapted in Step 2)
- [x] `src/server/db/schema.ts` — Update `userRoleEnum` from `['admin', 'producer', 'attendee']` to `['admin', 'provider', 'critic', 'user']`
- [x] `src/server/db/schema.ts` — Remove `wineTypeEnum` and all wine-related enums
- [x] `drizzle.config.ts` — Change `tablesFilter` from `['wine_fair_*']` to `['preseason_*']`
- [x] `supabase/config.toml` — Change `project_id` from `wine2cents` to `preseason`
- [x] `package.json` — Change `name` from `cancun` to `preseason`. Remove `i18n:verify` script
- [x] `src/app/layout.tsx` — Change metadata title/description to "Preseason"
- [x] `src/env.js` — Add `OPENROUTER_API_KEY` server env var

### 1.2 Remove i18n

- [x] `next.config.js` — Remove `withNextIntl` plugin wrapper
- [x] `package.json` — Remove `next-intl` dependency
- [x] `src/middleware.ts` — Remove i18n middleware, simplify to pure Supabase auth + route protection
- [x] Delete `src/i18n/` directory (routing.ts, request.ts, navigation.ts)
- [x] Delete `messages/` directory (en.json, bg.json)
- [x] Delete `src/components/language-switcher.tsx`
- [x] Delete `scripts/verify-translations.ts`
- [x] Strip all `useTranslations()` / `getTranslations()` from auth components, replace with plain English strings
- [x] Replace `Link`, `useRouter`, `usePathname` from `~/i18n/navigation` with standard `next/link` and `next/navigation`

### 1.3 Restructure Routes

- [x] Move `src/app/[locale]/(attendee)/` → `src/app/(public)/` (remove locale segment)
- [x] Move `src/app/[locale]/manage/` → `src/app/admin/`
- [x] Move `src/app/[locale]/login/` → `src/app/login/`
- [x] Move `src/app/[locale]/signup/` → `src/app/signup/`
- [x] Create `src/app/provider/` shell (layout + empty dashboard page)
- [x] Merge `src/app/[locale]/layout.tsx` into `src/app/layout.tsx` (remove `NextIntlClientProvider`, keep `TRPCReactProvider`, `Toaster`, theme provider)
- [x] Delete `src/app/[locale]/` directory after migration

### 1.4 Remove Wine-Domain Code

- [x] Delete all wine routers: `src/server/api/routers/wine.ts`, `fair.ts`, `producer.ts`, `review.ts`, `favorite.ts`, `region.ts`, `grape-variety.ts` + all `.test.ts` counterparts
- [x] Delete `src/server/api/routers/homepage.test.ts`
- [x] Delete all attendee components: `src/components/attendee/` directory
- [x] Delete `src/lib/wine-type-styles.ts`
- [x] Update `src/server/api/root.ts` — Remove all wine routers, keep only `userRouter`
- [x] Update `src/server/api/helpers/auth.ts` — Update role types to match new enum
- [x] Clean `src/server/api/routers/user.ts` — Remove wine-related logic if any

### 1.5 Update Documentation & Seed

- [x] Rewrite `CLAUDE.md` for Preseason context
- [x] Rewrite `AGENTS.md` for Preseason context
- [x] Rewrite `README.md` for Preseason
- [x] Simplify `src/server/db/seed.ts` — Keep admin user seeding only, remove all wine seed data
- [x] Delete old migration files in `drizzle/` (start fresh)
- [x] Update `src/test/db.ts` — Remove wine table CREATE TABLEs, keep only user_profile
- [x] Update/remove `src/test/db-schema.test.ts` and `src/test/example.test.ts`
- [x] Delete `src/middleware.test.ts` or update for new route structure

### 1.6 Replace Public Shell Pages

- [x] `src/app/(public)/page.tsx` — Simple "Preseason" placeholder homepage
- [x] `src/app/(public)/layout.tsx` — Basic public layout with navbar placeholder
- [x] `src/app/admin/dashboard/page.tsx` — Simple "Admin Dashboard" placeholder
- [x] `src/app/admin/layout.tsx` — Adapt admin layout, update sidebar nav items
- [x] `src/app/provider/page.tsx` — Simple "Provider Dashboard" placeholder
- [x] `src/app/provider/layout.tsx` — Basic provider layout
- [x] Clean up admin stubs: update nav for Preseason menu items (Prompts, Tools, Categories, LLMs, Runs, Matches, Critics, Users)

**Key files:** `src/server/db/schema.ts`, `drizzle.config.ts`, `src/middleware.ts`, `next.config.js`, `package.json`, `src/app/layout.tsx`

**Verify:** `pnpm run check` passes, `pnpm run build` succeeds, auth flow works (login/signup/redirect), empty shell pages render for all three layouts (public, admin, provider)

---

## Step 2: Database Schema & Seed Data `[DONE]`

**Goal:** Design and implement the full Preseason database schema. Create seed data for all reference tables.

### 2.1 Core Domain Tables

- [x] Adapt `preseason_user_profile` — Drop `birthDate`, rename `firstName`/`lastName` to `displayName` varchar(150), add `avatarUrl` varchar(512), `bio` text, `company` varchar(255), `website` varchar(255)
- [x] Create `preseason_category` table — `id` uuid PK, `name` varchar(100) unique, `slug` varchar(100) unique, `description` text, `icon` varchar(50) (lucide icon name), `displayOrder` integer, timestamps
- [x] Create `preseason_tool` table — `id` uuid PK, `name` varchar(255) unique, `slug` varchar(255) unique, `description` text, `website` varchar(512), `logoUrl` varchar(512), `isVerified` boolean default false, `providerUserId` uuid FK nullable, `aliases` text[] (for name normalization), timestamps
- [x] Create `preseason_tool_category` junction — `id` uuid PK, `toolId` FK, `categoryId` FK, `isPrimary` boolean default false, unique on (toolId, categoryId)
- [x] Create `preseason_llm` table — `id` uuid PK, `name` varchar(255), `slug` varchar(255) unique, `provider` varchar(100), `modelId` varchar(255) (OpenRouter model ID), `isActive` boolean default true, timestamps
- [x] Create `preseason_prompt` table — `id` uuid PK, `title` varchar(255), `slug` varchar(255) unique, `content` text (full prompt), `description` text, `expectedCategories` text[], `isActive` boolean default true, timestamps

### 2.2 Run & Recommendation Tables

- [x] Create `run_status` enum: `pending`, `running`, `completed`, `failed`
- [x] Create `parse_status` enum: `pending`, `success`, `failed`
- [x] Create `preseason_run` table — `id` uuid PK, `startedAt` timestamptz, `completedAt` timestamptz, `status` run_status default 'pending', `trigger` varchar(50) default 'cron' (cron | manual), `promptCount` integer, `llmCount` integer, `errorLog` text, `createdAt` timestamptz
- [x] Create `preseason_run_result` table — `id` uuid PK, `runId` FK, `promptId` FK, `llmId` FK, `rawResponse` text, `parseStatus` parse_status default 'pending', `evalScore` real, `evalDetails` jsonb, `responseTimeMs` integer, `createdAt` timestamptz. Unique on (runId, promptId, llmId)
- [x] Create `preseason_recommendation` table — `id` uuid PK, `runResultId` FK (cascade delete), `toolId` FK, `categoryId` FK, `confidence` real, `reasoning` text, `rank` integer, `createdAt` timestamptz. Index on (toolId, categoryId)

### 2.3 Match Tables

- [x] Create `match_status` enum: `active`, `settled`, `archived`
- [x] Create `preseason_match` table — `id` uuid PK, `toolAId` FK, `toolBId` FK, `categoryId` FK, `status` match_status default 'active', `startedAt` timestamptz, `settledAt` timestamptz, `periodStart` date, `periodEnd` date, `toolAScore` integer default 0, `toolBScore` integer default 0, `totalPrompts` integer default 0, `winnerToolId` FK nullable. Unique on (toolAId, toolBId, categoryId, periodStart)

### 2.4 Critic & Comment Tables

- [x] Create `comment_target` enum: `recommendation`, `match`, `tool`
- [x] Create `preseason_critic_profile` table — `id` uuid PK, `userId` FK unique (cascade delete), `title` varchar(255), `expertiseAreas` text[], `excludedCategories` text[] (conflict of interest), `verifiedAt` timestamptz, `verifiedBy` FK nullable, `isActive` boolean default true, timestamps
- [x] Create `preseason_comment` table — `id` uuid PK, `criticId` FK (cascade delete), `targetType` comment_target, `targetId` uuid, `content` text, `isPinned` boolean default false, timestamps. Index on (targetType, targetId)

### 2.5 Relations & Indexes

- [x] Define all Drizzle relations: category ↔ tool (many-to-many via tool_category), tool ↔ provider user, llm ↔ run_result, prompt ↔ run_result, run ↔ run_result, run_result ↔ recommendation, recommendation ↔ tool, recommendation ↔ category, match ↔ tools, critic_profile ↔ user_profile, comment ↔ critic_profile
- [x] Add performance indexes on: `recommendation(toolId, categoryId)`, `recommendation(runResultId)`, `run_result(runId)`, `comment(targetType, targetId)`, `match(status)`, `match(categoryId)`

### 2.6 Seed Data

- [x] Seed ~20 initial categories:
  - Authentication (`auth`), Database (`database`), ORM / Data Access (`orm`), Email (`email`), Payments (`payments`), File Storage (`storage`), Hosting / Deployment (`hosting`), CSS / Styling (`styling`), UI Components (`ui-components`), State Management (`state`), API Framework (`api`), CMS (`cms`), Search (`search`), Analytics (`analytics`), Monitoring / Error Tracking (`monitoring`), AI / LLM Integration (`ai`), Realtime (`realtime`), Testing (`testing`), CI/CD (`ci-cd`), Background Jobs (`jobs`), Notifications (`notifications`)
- [x] Seed ~30-40 popular tools with category assignments:
  - Auth: Supabase Auth, Clerk, Auth0, NextAuth.js, Firebase Auth, Lucia
  - Database: Supabase, PlanetScale, Neon, Firebase, MongoDB Atlas, Turso
  - ORM: Prisma, Drizzle, Kysely, TypeORM
  - Email: Resend, SendGrid, Postmark, Amazon SES, Mailgun
  - Payments: Stripe, Paddle, LemonSqueezy, PayPal
  - Storage: Supabase Storage, Cloudinary, UploadThing, AWS S3, Cloudflare R2
  - Hosting: Vercel, Netlify, Railway, Fly.io, Render, Cloudflare Pages
  - Styling: Tailwind CSS, Bootstrap, Panda CSS
  - UI Components: shadcn/ui, Radix UI, Chakra UI, MUI, Ant Design, Mantine
  - API: tRPC, GraphQL (Apollo), REST (Express/Hono)
  - Analytics: PostHog, Plausible, Mixpanel, Google Analytics
  - Monitoring: Sentry, LogRocket, Datadog
  - AI: OpenAI, Anthropic, Replicate, Hugging Face
  - Realtime: Pusher, Ably, Supabase Realtime, Socket.io
  - Search: Algolia, Typesense, Meilisearch, Elasticsearch
  - Testing: Vitest, Jest, Playwright, Cypress
  - CI/CD: GitHub Actions, Vercel CI, CircleCI
  - Jobs: Inngest, Trigger.dev, BullMQ, Quirrel
  - CMS: Sanity, Contentful, Strapi, Payload CMS
  - Notifications: Novu, OneSignal, Firebase Cloud Messaging
- [x] Seed ~5-8 LLMs with OpenRouter model IDs:
  - Claude 3.5 Sonnet (`anthropic/claude-3.5-sonnet`), GPT-4o (`openai/gpt-4o`), Gemini 1.5 Pro (`google/gemini-pro-1.5`), Llama 3.1 70B (`meta-llama/llama-3.1-70b-instruct`), Claude 3 Opus (`anthropic/claude-3-opus`), GPT-4o Mini (`openai/gpt-4o-mini`), Mistral Large (`mistralai/mistral-large-latest`), DeepSeek V2.5 (`deepseek/deepseek-chat`)
- [x] Seed 10-20 vibe-coding prompts (varied categories):
  - "Create a real estate website with admin area for uploading listings"
  - "Build a SaaS application with user authentication, subscription billing, and a dashboard"
  - "Create a blog platform with a CMS, comments, and email newsletter"
  - "Build an e-commerce store with product catalog, shopping cart, and payment processing"
  - "Create a project management tool like Trello with real-time collaboration"
  - "Build a social media platform with user profiles, posts, likes, and comments"
  - "Create a job board where companies post positions and applicants apply"
  - "Build a restaurant reservation system with email confirmations"
  - "Create an online learning platform with courses, quizzes, and certificates"
  - "Build a multi-tenant CRM with contact management and email integration"
  - "Create a weather dashboard that pulls data from external APIs"
  - "Build a chat application with real-time messaging and file sharing"
  - "Create a fitness tracking app with workout logging and progress charts"
  - "Build a URL shortener with analytics tracking"
  - "Create a documentation site with search, versioning, and dark mode"
- [x] Seed admin user
- [x] Make seed script idempotent (check before insert)

### 2.7 Test Infrastructure

- [x] Rewrite `src/test/db.ts` — New CREATE TABLE statements for all Preseason tables
- [x] Write `src/test/db-schema.test.ts` — Smoke tests for all tables: insert/query, enum values, unique constraints, FK cascades, junction table operations

**Key files modified:** `src/server/db/schema.ts`, `src/server/db/seed.ts`, `src/test/db.ts`
**Key files created:** `drizzle/0000_flaky_la_nuit.sql` (fresh migration), `src/test/db-schema.test.ts`

**Verify:** `pnpm run db:generate` produces correct migration, `pnpm run db:migrate` succeeds, `pnpm run db:seed` populates all tables, `pnpm run test` passes schema tests

**Depends on:** Step 1

---

## Step 3: tRPC API Layer `[DONE]`

**Goal:** Build all tRPC routers for managing and querying domain entities. Admin CRUD, provider-scoped reads, and public queries.

### 3.1 Reference Data Routers

- [x] Create `src/server/api/routers/category.ts` — `list` (public), `getBySlug` (public), `create` (admin), `update` (admin), `delete` (admin)
- [x] Create `src/server/api/routers/tool.ts` — `list` (public, filterable by category slug), `getBySlug` (public, with categories), `search` (public, text search across name/aliases), `create` (admin), `update` (admin), `delete` (admin), `verify` (admin, sets isVerified=true)
- [x] Create `src/server/api/routers/llm.ts` — `listActive` (public), `getBySlug` (public), `create` (admin), `update` (admin), `delete` (admin), `toggleActive` (admin)
- [x] Create `src/server/api/routers/prompt.ts` — `listActive` (public, with descriptions only), `getBySlug` (public), `create` (admin), `update` (admin), `delete` (admin), `toggleActive` (admin)

### 3.2 Run & Recommendation Routers

- [x] Create `src/server/api/routers/run.ts` — `listRecent` (public, paginated), `getById` (public, with run_results summary), `triggerManual` (admin, calls automation runner)
- [x] Create `src/server/api/routers/recommendation.ts` — `getFeed` (public, paginated, filterable by category/tool/llm/date range), `getStats` (public, aggregated recommendation rates per tool per category over configurable time window), `getTrending` (public, tools with biggest rate changes)

### 3.3 Match & Ranking Routers

- [x] Create `src/server/api/routers/match.ts` — `listActive` (public), `listSettled` (public, paginated), `getById` (public, with per-LLM breakdown and per-prompt breakdown), `create` (admin), `settle` (admin)
- [x] Create `src/server/api/routers/ranking.ts` — `byCategorySlug` (public, tool rankings with recommendation rate, trend, consistency score over rolling window), `overall` (public, cross-category tool ranking)

### 3.4 Critic & Comment Routers

- [x] Create `src/server/api/routers/critic.ts` — `list` (public, verified critics with expertise), `getById` (public, with comments), `verify` (admin), `unverify` (admin), `updateOwn` (critic role, own profile)
- [x] Create `src/server/api/routers/comment.ts` — `listByTarget` (public, by targetType + targetId), `create` (critic, with conflict-of-interest enforcement via excludedCategories), `update` (critic, own only), `delete` (critic own or admin)

### 3.5 User Router Updates

- [x] Adapt `src/server/api/routers/user.ts` — Update `createProfile` input (drop birthDate, add displayName), update `updateProfile`, add `getProfile`

### 3.6 Register All Routers

- [x] Update `src/server/api/root.ts` — Register all new routers: category, tool, llm, prompt, run, recommendation, match, ranking, critic, comment, user

### 3.7 Tests

- [x] One `.test.ts` file per router using Testcontainers pattern from existing codebase
- [x] Test: public read operations, admin CRUD with role enforcement, provider-scoped access, critic conflict-of-interest on comments, pagination/filtering, edge cases (not found, duplicate, unauthorized)
- [x] Target: ~100+ test cases across all routers

**Key files created:** `src/server/api/routers/{category,tool,llm,prompt,run,recommendation,match,ranking,critic,comment}.ts` + `.test.ts` counterparts
**Key files modified:** `src/server/api/root.ts`, `src/server/api/routers/user.ts`

**Reuse:** Zod validation patterns, `requireRole` helper, pagination with limit/offset, test helpers from existing wine routers (adapt, don't copy wine logic)

**Verify:** `pnpm run test` — all router tests pass

**Depends on:** Step 2

---

## Step 4: Automation Engine (OpenRouter + Promptfoo + Cron) `[TODO]`

**Goal:** Build the automated system that runs prompts against LLMs daily, parses responses, extracts recommendations, evaluates quality, and manages matches.

### 4.1 OpenRouter Client

- [ ] Create `src/server/automation/openrouter.ts` — Uses `openai` npm package with OpenRouter base URL (`https://openrouter.ai/api/v1`). Function: `queryLLM(modelId, systemPrompt, userPrompt)` → returns `{ response: string, responseTimeMs: number }`
- [ ] System prompt template requests structured JSON output:
  ```
  You are an expert software architect evaluating third-party tools for web development.
  Given a project description, recommend the best tool/service for each relevant category.
  Respond in JSON: { recommendations: [{ category: "<slug>", tool: "<name>", reasoning: "<1-2 sentences>", confidence: <0.0-1.0> }] }
  Available categories: <list>
  Rules: only 3rd-party tools, one per category, only categories the project needs
  ```

### 4.2 Response Parser

- [ ] Create `src/server/automation/parser.ts` — Extracts tool recommendations from LLM responses
  - Primary: `JSON.parse` structured output
  - Fallback: regex extraction from markdown/prose + fuzzy tool name matching against DB
  - Tool name normalization via `aliases` column on tool table
  - Auto-creates unknown tools with `isVerified=false` and flags for admin review
- [ ] Map category slugs from response to category IDs in DB
- [ ] Return array of `{ toolId, categoryId, confidence, reasoning, rank }`

### 4.3 Promptfoo Integration

- [ ] Create `src/server/automation/promptfoo-eval.ts` — Evaluates each LLM response for quality/relevance
  - Score: 0-1 based on response format compliance, category coverage, reasoning quality
  - Returns `{ score: number, details: object }`

### 4.4 Run Orchestrator

- [ ] Create `src/server/automation/runner.ts` — Full pipeline orchestrator:
  1. Create `run` record with status `running`
  2. Fetch all active prompts and active LLMs
  3. For each prompt × LLM pair: call OpenRouter, store `run_result` with raw response
  4. Parse each response into `recommendation` rows
  5. Run Promptfoo eval, update `evalScore` and `evalDetails`
  6. Handle per-pair failures gracefully (log error, continue with next pair)
  7. Update `run` status to `completed` (or `failed` if all pairs failed)

### 4.5 Match Management

- [ ] Create `src/server/automation/match-settler.ts` — For each active match past `periodEnd`: tally recommendation counts for both tools in the category over the period, set scores, determine winner, update status to `settled`
- [ ] Create `src/server/automation/match-generator.ts` — Scan for tool pairs in the same category with N+ recommendations but no active match. Auto-create matches with configurable period (default: 7-day rolling windows)

### 4.6 Cron Endpoints

- [ ] Create `src/app/api/cron/run/route.ts` — POST endpoint protected by `CRON_SECRET` header. Calls runner orchestrator. Can be triggered by Vercel Cron, GitHub Actions, or any external scheduler
- [ ] Create `src/app/api/cron/settle/route.ts` — POST endpoint for match settlement + new match generation. Runs after daily run completes

### 4.7 Dependencies & Config

- [ ] Add `openai` npm package (for OpenRouter API compatibility)
- [ ] Add `OPENROUTER_API_KEY` to `.env.example`
- [ ] Add `CRON_SECRET` to `.env.example` and `src/env.js`

### 4.8 Tests

- [ ] `src/server/automation/__tests__/parser.test.ts` — ~20 test cases: clean JSON, markdown-wrapped JSON, prose fallback, unknown tools, malformed responses, empty responses, alias matching
- [ ] `src/server/automation/__tests__/runner.test.ts` — Integration tests with mocked OpenRouter (no real API calls)
- [ ] `src/server/automation/__tests__/match-settler.test.ts` — Deterministic recommendation data → correct scores and winners

**Key files created:** `src/server/automation/` (6 files), `src/app/api/cron/` (2 routes), 3 test files

**Verify:** Trigger manual run, verify data flows through pipeline (run → run_result → recommendation), match settlement produces correct scores

**Depends on:** Steps 2 and 3

---

## Step 5: Public Website UI `[TODO]`

**Goal:** Build the main public-facing website. Dark-mode-first, Kalshi-inspired design.

### 5.1 Theme & Layout

- [ ] Update `src/app/globals.css` — Dark-mode-first color scheme: dark navy/charcoal backgrounds, bright green/red for trends, white/off-white text. Keep shadcn/ui CSS variable system
- [ ] Add `ThemeProvider` from `next-themes` to root layout with dark default
- [ ] Create `src/components/public/public-navbar.tsx` — Logo, category tabs/dropdown, dark/light toggle, Login CTA
- [ ] Create `src/components/public/public-footer.tsx` — Links, branding
- [ ] Update `src/app/(public)/layout.tsx` — Navbar + main + footer

### 5.2 Homepage

- [ ] `src/app/(public)/page.tsx` — Hero section ("What tools do AI models actually recommend?"), live feed of recent recommendations (last 24h), trending matches sidebar, top tools by category cards
- [ ] Create `src/components/public/hero-section.tsx`

### 5.3 Feed Page

- [ ] `src/app/(public)/feed/page.tsx` — Full recommendation feed, paginated with load-more
- [ ] Create `src/components/public/feed-filters.tsx` — Filter by category, LLM, tool, date range
- [ ] Create `src/components/public/recommendation-card.tsx` — Shows prompt title, LLM name, recommended tool with logo, category badge, reasoning excerpt, confidence indicator

### 5.4 Rankings Pages

- [ ] `src/app/(public)/rankings/page.tsx` — Category selector → tool ranking table
- [ ] `src/app/(public)/rankings/[categorySlug]/page.tsx` — Category-specific ranking with historical chart
- [ ] Create `src/components/public/ranking-table.tsx` — Rank, tool name+logo, recommendation rate %, trend arrow, LLM breakdown
- [ ] Create `src/components/public/trend-indicator.tsx` — Up/down/flat arrows with color

### 5.5 Match Pages

- [ ] `src/app/(public)/matches/page.tsx` — Grid of active match cards, filter by category
- [ ] `src/app/(public)/matches/[id]/page.tsx` — Match detail: percentage bar, per-LLM breakdown, per-prompt breakdown, critic comments section
- [ ] Create `src/components/public/match-card.tsx` — Kalshi-style: two tools with logos, percentage bar, category badge, period dates
- [ ] Create `src/components/public/percentage-bar.tsx` — Animated split bar showing tool A vs tool B percentages

### 5.6 Entity Detail Pages

- [ ] `src/app/(public)/tool/[slug]/page.tsx` — Tool profile: description, categories, recommendation rate chart, which LLMs recommend it, recent matches, critic comments
- [ ] `src/app/(public)/llm/[slug]/page.tsx` — LLM profile: what it tends to recommend per category, consistency stats
- [ ] `src/app/(public)/prompt/[slug]/page.tsx` — Prompt detail: how different LLMs responded, latest run results
- [ ] Create `src/components/public/tool-badge.tsx` — Tool logo + name badge
- [ ] Create `src/components/public/category-pill.tsx` — Category colored pill

### 5.7 Shared Components

- [ ] Loading skeletons for all data-fetching sections
- [ ] Empty states for pages with no data yet
- [ ] Responsive design: mobile-first, tablet, desktop

**Key files created:** ~15 page files in `src/app/(public)/`, ~12 components in `src/components/public/`
**Key files modified:** `src/app/globals.css`, `src/app/(public)/layout.tsx`, `src/app/layout.tsx`

**Verify:** `pnpm run build` succeeds, visual review of all pages, responsive design check, dark/light toggle works

**Depends on:** Step 3 (API layer for data). Step 4 ideally complete so there's real data, but can build with seed data.

---

## Step 6: Admin & Provider Areas `[TODO]`

**Goal:** Admin dashboard for managing all entities. Provider portal for tool companies to see their analytics.

### 6.1 Admin Dashboard & Navigation

- [ ] Update `src/app/admin/layout.tsx` — Adapted from existing manage layout
- [ ] Update admin sidebar navigation items: Dashboard, Prompts, Tools, Categories, LLMs, Runs, Matches, Critics, Users
- [ ] `src/app/admin/page.tsx` or `src/app/admin/dashboard/page.tsx` — Stats overview: total tools, total LLMs, total prompts, total runs, active matches, system health

### 6.2 Admin CRUD Pages

- [ ] `src/app/admin/prompts/page.tsx` — List, create, edit, toggle active, preview prompt content
- [ ] `src/app/admin/tools/page.tsx` — List (filterable), create, edit, verify, assign categories
- [ ] `src/app/admin/categories/page.tsx` — List, create, edit, reorder (display order)
- [ ] `src/app/admin/llms/page.tsx` — List, create, edit, toggle active
- [ ] `src/app/admin/runs/page.tsx` — Run history with status badges, drill into run details, "Trigger Manual Run" button
- [ ] `src/app/admin/matches/page.tsx` — List active/settled, create manual match, settle
- [ ] `src/app/admin/critics/page.tsx` — List, verify/unverify, view comments
- [ ] `src/app/admin/users/page.tsx` — List, change roles (user → provider, user → critic, etc.)

### 6.3 Admin Components

- [ ] Create `src/components/admin/data-table.tsx` — Generic admin table with sort, filter, pagination (reuse shadcn table)
- [ ] Create `src/components/admin/stat-card.tsx` — Dashboard stat card
- [ ] Create `src/components/admin/run-status-badge.tsx` — Color-coded run status

### 6.4 Provider Portal

- [ ] `src/app/provider/layout.tsx` — Simpler layout, scoped to provider's tool
- [ ] `src/app/provider/page.tsx` — Provider dashboard: their tool's recommendation stats, trend chart, category breakdown, which LLMs recommend them
- [ ] `src/app/provider/matches/page.tsx` — Matches involving their tool
- [ ] `src/app/provider/analytics/page.tsx` — Detailed analytics: recommendation rate over time, per-prompt breakdown, head-to-head comparisons

### 6.5 Role-Based Routing

- [ ] Update `src/middleware.ts` — Route protection for `/admin` (admin role only), `/provider` (provider role only)
- [ ] Role-based redirects after login: admin → `/admin`, provider → `/provider`, others → `/`

**Key files created:** ~10 admin pages, ~4 provider pages, ~5 admin/provider components
**Key files modified:** `src/middleware.ts`, `src/app/admin/layout.tsx`

**Reuse:** Admin layout/sidebar pattern from `src/components/manage/admin-layout.tsx` (same structure, new nav items)

**Verify:** Admin CRUD flows work end-to-end, non-admin users blocked from `/admin`, provider can only see own tool's data, role-based redirects work

**Depends on:** Steps 3 and 5

---

## Step 7: Critics, Comments & Polish `[TODO]`

**Goal:** Verified critic flow, commenting system, SEO, performance optimization, error handling, and final polish.

### 7.1 Critic System

- [ ] `src/app/(public)/critics/page.tsx` — Public critic directory: verified critics with photo, bio, expertise areas
- [ ] `src/app/(public)/critic/[id]/page.tsx` — Critic profile: bio, expertise, all their comments

### 7.2 Comment Threads

- [ ] Create `src/components/public/comment-section.tsx` — Comment thread component, used on match detail, tool profile, recommendation views
- [ ] Create `src/components/public/comment-form.tsx` — Comment creation form (only visible to verified critics, disabled for conflicted categories)
- [ ] Create `src/components/public/critic-badge.tsx` — Verified critic badge with title/company
- [ ] Integrate comment sections into match detail, tool profile, and recommendation pages

### 7.3 SEO & Social

- [ ] Create `src/app/api/og/route.tsx` — Open Graph image generation for tool pages, match pages (for social sharing)
- [ ] Create `src/app/sitemap.ts` — Dynamic sitemap covering tools, matches, categories, prompts
- [ ] Create `src/app/robots.ts` — Robots.txt
- [ ] Add `<head>` metadata (title, description, OG tags) to every page

### 7.4 Error Handling & Loading States

- [ ] Add loading skeletons for all data-fetching pages
- [ ] Add error boundaries with meaningful error states
- [ ] Add empty states for all pages when no data exists
- [ ] Add rate limiting on cron endpoints

### 7.5 Performance & Logging

- [ ] Ensure recommendation aggregation queries have proper database indexes
- [ ] Add logging for automation pipeline (run results, parse failures, API errors)
- [ ] Mobile-responsive pass on all pages

**Key files created:** 2 critic pages, 3 comment components, OG route, sitemap, robots
**Key files modified:** Various public pages to add comment sections

**Verify:** Full end-to-end flow: admin creates prompt → triggers run → results appear in feed → match auto-creates → critic comments → provider views analytics. Lighthouse performance audit. Mobile responsive check.

**Depends on:** Steps 5 and 6

---

## Dependency Graph

```
Step 1 (Rebrand & Cleanup)
  └→ Step 2 (Database Schema & Seed)
       └→ Step 3 (tRPC API Layer)
            ├→ Step 4 (Automation Engine) ──┐
            └→ Step 5 (Public Website UI) ──┤
                                            └→ Step 6 (Admin & Provider)
                                                 └→ Step 7 (Critics & Polish)
```

**Parallelism:** Steps 4 and 5 can be worked on simultaneously after Step 3 is complete.

---

## Initial Tool Categories

| # | Category | Slug | Examples |
|---|---|---|---|
| 1 | Authentication | `auth` | Clerk, Auth0, Supabase Auth, NextAuth.js |
| 2 | Database | `database` | Supabase, PlanetScale, Neon, MongoDB Atlas |
| 3 | ORM / Data Access | `orm` | Prisma, Drizzle, Kysely |
| 4 | Email | `email` | Resend, SendGrid, Postmark |
| 5 | Payments | `payments` | Stripe, Paddle, LemonSqueezy |
| 6 | File Storage | `storage` | Supabase Storage, Cloudinary, UploadThing, S3 |
| 7 | Hosting / Deployment | `hosting` | Vercel, Netlify, Railway, Fly.io |
| 8 | CSS / Styling | `styling` | Tailwind CSS, Bootstrap, Panda CSS |
| 9 | UI Components | `ui-components` | shadcn/ui, Radix UI, Chakra UI, MUI |
| 10 | State Management | `state` | Zustand, Jotai, Redux Toolkit |
| 11 | API Framework | `api` | tRPC, GraphQL (Apollo), REST (Hono) |
| 12 | CMS | `cms` | Sanity, Contentful, Strapi, Payload |
| 13 | Search | `search` | Algolia, Typesense, Meilisearch |
| 14 | Analytics | `analytics` | PostHog, Plausible, Mixpanel |
| 15 | Monitoring / Error Tracking | `monitoring` | Sentry, LogRocket, Datadog |
| 16 | AI / LLM Integration | `ai` | OpenAI, Anthropic, Replicate |
| 17 | Realtime | `realtime` | Pusher, Ably, Supabase Realtime |
| 18 | Testing | `testing` | Vitest, Jest, Playwright, Cypress |
| 19 | CI/CD | `ci-cd` | GitHub Actions, Vercel CI |
| 20 | Background Jobs | `jobs` | Inngest, Trigger.dev, BullMQ |
| 21 | Notifications | `notifications` | Novu, OneSignal |

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| LLM Gateway | OpenRouter | Single API for all models, unified billing, model switching |
| LLM Evaluation | Promptfoo | Industry standard for LLM eval, structured scoring |
| Response Parsing | Structured JSON output with regex fallback | Most LLMs support structured output; fallback handles edge cases |
| Unknown Tools | Auto-create as unverified, flag for admin | Keeps system self-extending as LLMs recommend new tools |
| Match Scoring | Recommendation count over time period | Objective metric from data, not user votes |
| Match Creation | Auto-generated when tool pairs have enough data | Scales without manual curation |
| Dark Mode | Default via next-themes | Developer audience preference, Kalshi inspiration |
| i18n | Dropped (English only) | Global dev audience, simplifies codebase |
| Auth | Supabase OTP (kept from wine project) | Works well, already implemented |
| Table Prefix | `preseason_*` | Multi-project schema safety via pgTableCreator |
