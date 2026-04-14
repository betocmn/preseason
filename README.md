# Preseason

Preseason tracks what tools and services LLMs recommend for concrete web-app
build scenarios. The public site exposes benchmark rankings, category pages,
prompt detail pages, head-to-head matchups, and methodology notes backed by a
frozen benchmark protocol.

## How the Product Works

Each active benchmark season freezes a panel of prompt versions and model
snapshots. The cron route at `/api/cron/benchmark-run` executes every prompt x
model case for the active season, parses a strict benchmark appendix, stores
case results and case decisions, and records QC outcomes. The dispatcher runs
every minute, while fresh benchmark runs start on the cadence configured in
`src/constants/server-settings.ts`.

Admins review unresolved tool candidates, manage seasons and weight configs, and
publish runs that pass QC. Public rankings and matches read only from published
benchmark data. There is no longer a public exploration feed or a separate
legacy settlement pipeline.

## Setup Instructions

### Stack Overview

- [Next.js 15](https://nextjs.org) (App Router)
- [tRPC v11](https://trpc.io)
- [Tailwind CSS v4](https://tailwindcss.com)
- [TypeScript](https://typescriptlang.org)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Supabase](https://supabase.com) (authentication and database)
- [OpenRouter](https://openrouter.ai) (LLM gateway)

### Prerequisites

- **Node.js 22** (LTS)
- **pnpm** (>= 10.x)
- **Docker** for local Supabase and tests
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### Getting Started

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Start Supabase locally**

   ```bash
   supabase start
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Run `supabase status` and fill in `.env.local` with the output values:

   | Variable | Source |
   |----------|--------|
   | `DATABASE_URL` | "DB URL" from `supabase status` |
   | `NEXT_PUBLIC_SUPABASE_URL` | "API URL" from `supabase status` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | "anon key" from `supabase status` |
   | `SUPABASE_SERVICE_ROLE_KEY` | "service_role key" from `supabase status` |
   | `OPENROUTER_API_KEY` | your [OpenRouter](https://openrouter.ai) API key |
   | `CRON_SECRET` | any secure random token for cron authentication |

4. **Set up the database**

   ```bash
   supabase db reset
   pnpm run db:migrate
   pnpm run db:seed          # reference data (categories, tools, LLMs, prompts)
   pnpm run db:seed-dev      # synthetic benchmark + critic data for local dev
   ```

5. **Run the development server**

   ```bash
   pnpm run dev
   ```

   The application will be available at `http://localhost:3000`.

## User Roles

- `admin` - Manage benchmark seasons, runs, prompts, tools, critics, and tool candidates
- `provider` - Tool company portal role
- `critic` - Verified industry expert who can leave comments
- `user` - Default role for public users

## Common Commands

### Development

```bash
pnpm run dev            # Start dev server
pnpm run build          # Production build
pnpm run start          # Start production server
pnpm run preview        # Build and start production server
```

### Database

```bash
pnpm run db:generate    # Generate migration from schema changes
pnpm run db:migrate     # Apply pending migrations
pnpm run db:seed        # Seed reference data (categories, tools, LLMs, prompts)
pnpm run db:seed-dev    # Seed synthetic benchmark + critic data (dev only)
pnpm run db:seed-benchmark  # Seed large-scale benchmark data (28 days of runs)
pnpm run db:seed-test   # Seed critic profiles and comments for UI review
pnpm run db:studio      # Open Drizzle Studio
```

> **Note:** Never use `db:push`. Always use `db:generate` then `db:migrate`.

### Quality Checks

```bash
pnpm run check          # Run lint + typecheck together
pnpm run test           # Run the test suite once
pnpm run build          # Verify production build
pnpm run format         # Format all files with Biome
pnpm run evals:export   # Export DB-backed prompts for external Promptfoo usage
pnpm run evals:major-tools  # Run the default major-tool coverage evals
pnpm run evals:major-tools:broad  # Run the broader exploratory model matrix
```

## Guides

- [How Benchmarks Work](docs/guides/how-benchmarks-work.md)
- [How Prompts Work](docs/guides/how-prompts-work.md)
- [How Rankings Work](docs/guides/how-rankings-work.md)
- [How Cron Benchmarks Work](docs/guides/how-cron-benchmarks-work.md)
- [How Evals Work](docs/guides/how-evals-work.md)
- [How LLM Service Works](docs/guides/how-llm-service-works.md)
- [Recommendation Methodology](docs/guides/recommendation-methodology.md)
- [How to Manually Test Cron Benchmarks Locally](docs/guides/how-to-manually-test-cron-benchmarks-locally.md)

## Testing

Preseason uses **Vitest** with Testcontainers for PostgreSQL.

```bash
pnpm run test
pnpm run test:watch
pnpm run test:ui
pnpm run test:coverage
```

## Local Development URLs

| Service | URL |
|---------|-----|
| Next.js App | http://localhost:3000 |
| Supabase Studio | http://localhost:58823 |
| Inbucket (test emails) | http://localhost:58824 |
