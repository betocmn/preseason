# Local Setup

This guide covers the full local development setup. For a one-command demo
path, see the [`Quick start`](../README.md#quick-start) in the README.

## Prerequisites

- **Node.js 22** (LTS)
- **pnpm** (>= 10.x) — `npm install -g pnpm`
- **Docker** — required for local Supabase and the test suite
- **[Supabase CLI](https://supabase.com/docs/guides/cli)** — `brew install supabase/tap/supabase` on macOS

## Step-by-step

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start Supabase locally

```bash
supabase start
```

Supabase will spin up Postgres, Studio, Inbucket (email capture), and the
auth/storage/realtime services in Docker. The first run pulls a few hundred MB
of images.

When it finishes, it prints a block of URLs and keys. Keep that terminal
output handy for the next step.

### 3. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` using `supabase status` output:

| Variable | Where to get it |
|----------|-----------------|
| `DATABASE_URL` | "DB URL" from `supabase status` |
| `NEXT_PUBLIC_SUPABASE_URL` | "API URL" from `supabase status` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | "anon key" from `supabase status` |
| `SUPABASE_SERVICE_ROLE_KEY` | "service_role key" from `supabase status` |
| `OPENROUTER_API_KEY` | your [OpenRouter](https://openrouter.ai) API key |
| `CRON_SECRET` | any secure random token, e.g. `openssl rand -hex 32` |
| `SEED_ADMIN_EMAIL` | (optional) admin email seeded by `pnpm db:seed` (default `admin@example.com`) |
| `SEED_ADMIN_NAME` | (optional) admin display name (default `Admin`) |

### 4. Set up the database

```bash
supabase db reset       # apply baseline + supabase/seed.sql
pnpm run db:migrate     # apply Drizzle migrations
pnpm run db:seed        # reference data: categories, tools, LLMs, prompts
pnpm run db:seed-dev    # synthetic benchmark + critic data for local dev
```

`db:seed-dev` populates rankings, matches, and comments so the UI is
non-empty when you first load it. Skip it if you want an empty slate.

### 5. Run the development server

```bash
pnpm run dev
```

Open `http://localhost:3000`.

## Local Development URLs

| Service | URL |
|---------|-----|
| Next.js App | http://localhost:3000 |
| Admin (after login) | http://localhost:3000/admin |
| Supabase Studio | http://localhost:58823 |
| Inbucket (test emails) | http://localhost:58824 |

To log in: navigate to `/login`, enter the seeded admin email
(`admin@example.com` by default), and grab the magic-link OTP from Inbucket.

## Common Commands

### Development

```bash
pnpm run dev            # Start dev server with Turbo
pnpm run build          # Production build
pnpm run start          # Start production server
pnpm run preview        # Build and start production server
```

### Database

```bash
pnpm run db:generate         # Generate migration from schema changes
pnpm run db:migrate          # Apply pending migrations
pnpm run db:seed             # Reference data (categories, tools, LLMs, prompts)
pnpm run db:seed-dev         # Synthetic benchmark + critic data (dev only)
pnpm run db:seed-benchmark   # Large-scale benchmark data (28 days of runs)
pnpm run db:seed-test        # Critic profiles and comments for UI review
pnpm run db:studio           # Open Drizzle Studio
```

> Never use `db:push`. Always use `db:generate` then `db:migrate`.

### Quality Checks

```bash
pnpm run check          # Lint + typecheck
pnpm run test           # Run the test suite (uses Testcontainers/Docker)
pnpm run test:watch     # Watch mode
pnpm run test:ui        # Vitest UI
pnpm run test:coverage  # Coverage report
pnpm run lint           # Lint only
pnpm run lint:fix       # Auto-fix lint issues
pnpm run format         # Format with Biome
pnpm run typecheck      # TypeScript only
```

### Evals

```bash
pnpm run evals:export        # Export DB-backed prompts for Promptfoo
pnpm run evals:major-tools   # Default coverage evals
pnpm run evals:major-tools:broad   # Broader exploratory matrix
```

## Troubleshooting

### `supabase start` fails or hangs
- Ensure Docker Desktop is running.
- `supabase stop --no-backup` then retry.

### `pnpm test` fails to start containers
- Tests use Testcontainers for Postgres. Confirm Docker is running.
- If you're on a Mac with limited resources, close other Docker projects first.

### Magic-link login never arrives
- Check Inbucket at http://localhost:58824 — local Supabase delivers all auth
  emails there.

### `db:seed` reports email conflicts
- `supabase/seed.sql` always seeds `admin@example.com`. If you set
  `SEED_ADMIN_EMAIL` to a different value, the TS seed will create a second
  profile. Either keep the default or run `supabase db reset` and seed once.

## Where to go next

- [`README.md`](../README.md) — project overview
- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — how the pieces fit together
- [`docs/CONCEPTS.md`](CONCEPTS.md) — glossary
- [`docs/SELF_HOSTING.md`](SELF_HOSTING.md) — deploying your own instance
- [`docs/guides/`](guides/) — deep dives on benchmarks, prompts, rankings, etc.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — how to send your first PR
