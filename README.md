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

   ```bash
   supabase start
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Fill in credentials from `supabase status`:
   - `DATABASE_URL` - Use the "DB URL" value
   - `NEXT_PUBLIC_SUPABASE_URL` - Use the "API URL" value
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Use the "anon key" value

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

```bash
pnpm run dev          # Start dev server
pnpm run build        # Production build
pnpm run check        # Lint + typecheck
pnpm run test         # Run tests
pnpm run format       # Format code
pnpm run db:generate  # Generate migration
pnpm run db:migrate   # Apply migrations
pnpm run db:seed      # Seed data
```

## Guides

- [How Prompts Work](docs/guides/how-prompts-work.md)
- [How Evals Work](docs/guides/how-evals-work.md)
- [How Rankings Work](docs/guides/how-rankings-work.md)
- [How LLM Service Works](docs/guides/how-llm-service-works.md)
- [How Automation Works](docs/guides/how-automation-works.md)
- [How to Manually Test Automation Locally](docs/guides/how-to-manually-test-automation-locally.md)

## Testing

Uses **Vitest** with Testcontainers for PostgreSQL (Docker required).

```bash
pnpm run test          # Run all tests
pnpm run test:watch    # Watch mode
pnpm run test:coverage # Coverage report
```

## Local Development URLs

| Service | URL |
|---------|-----|
| Next.js App | http://localhost:3000 |
| Supabase Studio | http://localhost:58823 |
| Inbucket (Test Emails) | http://localhost:58824 |
