# Preseason

Preseason tracks what tools and services LLMs recommend when given vibe-coding prompts. Think of it as a mix between an RL gym and a SaaS comparison site, with a Kalshi-inspired match/game UI.

## How the Product Works

Every day (or on manual trigger), Preseason runs a batch of real-world build prompts against a set of LLMs through OpenRouter. Each response is parsed into structured recommendations like "for category X, recommend tool Y," then stored with model, prompt, confidence, and reasoning metadata. This creates a continuously updated dataset of what major models are actually recommending in practice.

The app then turns that dataset into public rankings, feed views, and head-to-head tool matches by category. Rankings measure recommendation frequency and consistency across models, while matches track which tool is winning over a defined period. Admins control active prompts/models and can review unknown tools auto-discovered from model output before they become part of ongoing comparisons.

## Setup Instructions

### Stack Overview

- [Next.js 15](https://nextjs.org) (App Router)
- [tRPC v11](https://trpc.io)
- [Tailwind CSS v4](https://tailwindcss.com)
- [TypeScript](https://typescriptlang.org)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Supabase](https://supabase.com) (Authentication & Database)
- [OpenRouter](https://openrouter.ai) (LLM gateway)

### Prerequisites

- **Node.js 22** (LTS)
- **pnpm** (>= 10.x)
- **Docker** - Required for local Supabase and tests (Testcontainers)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### Getting Started

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Start Supabase locally**

   Make sure Docker is running, then:

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
   | `OPENROUTER_API_KEY` | Your [OpenRouter](https://openrouter.ai) API key |
   | `CRON_SECRET` | Any secure random token for cron authentication |

4. **Set up the database**

   ```bash
   supabase db reset
   pnpm run db:migrate
   pnpm run db:seed
   ```

5. **Run the development server**

   ```bash
   pnpm run dev
   ```

   The application will be available at: http://localhost:3000

## User Roles

- `admin` - Full access to manage prompts, tools, LLMs, runs, matches, critics
- `provider` - Tool company portal with recommendation analytics
- `critic` - Verified industry expert who can leave comments
- `user` - Default role for public users

## Common Commands

### Development

```bash
pnpm run dev            # Start dev server (Next.js with Turbo)
pnpm run build          # Production build
pnpm run start          # Start production server
pnpm run preview        # Build and start production server
```

### Database

```bash
pnpm run db:generate    # Generate migration from schema changes
pnpm run db:migrate     # Apply pending migrations
pnpm run db:seed        # Seed auth users and user profiles
pnpm run db:seed-test   # Seed test/demo data (matches, recommendations, etc.)
pnpm run db:studio      # Open Drizzle Studio
```

> **Note:** Never use `db:push`. Always use `db:generate` then `db:migrate`.

### Quality Checks

```bash
pnpm run check          # Run lint + typecheck together
pnpm run lint           # Check for lint issues
pnpm run lint:fix       # Auto-fix lint issues
pnpm run format         # Format all files with Biome
pnpm run typecheck      # TypeScript type checking
```

## Guides

- [How Prompts Work](docs/guides/how-prompts-work.md)
- [How Evals Work](docs/guides/how-evals-work.md)
- [How Rankings Work](docs/guides/how-rankings-work.md)
- [How LLM Service Works](docs/guides/how-llm-service-works.md)
- [How Automation Works](docs/guides/how-automation-works.md)
- [Recommendation Methodology](docs/guides/recommendation-methodology.md)
- [How to Manually Test Automation Locally](docs/guides/how-to-manually-test-automation-locally.md)

## Testing

Uses **Vitest** with Testcontainers for PostgreSQL (Docker required).

```bash
pnpm run test           # Run all tests once
pnpm run test:watch     # Run tests in watch mode
pnpm run test:ui        # Open Vitest UI
pnpm run test:coverage  # Run tests with coverage report
```

## Local Development URLs

| Service | URL |
|---------|-----|
| Next.js App | http://localhost:3000 |
| Supabase Studio | http://localhost:58823 |
| Inbucket (Test Emails) | http://localhost:58824 |
