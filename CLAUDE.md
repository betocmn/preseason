# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Preseason — A website that tracks what tools/services LLMs recommend when given vibe-coding prompts. Think of it as a mix between an RL gym and a SaaS comparison site, with a Kalshi-inspired match/game UI.

**Stack:** Next.js 15 App Router, tRPC v11, Drizzle ORM, Supabase (PostgreSQL + Auth), Tailwind CSS v4, shadcn/ui, Vitest + Testcontainers, OpenRouter, Promptfoo

## Common Commands

### Development

```bash
pnpm run dev          # Start Next.js dev server with Turbo
```

### Database Operations

```bash
pnpm run db:generate  # Generate migration from schema changes
pnpm run db:migrate   # Apply pending migrations
pnpm run db:seed      # Seed auth users and user profiles
pnpm run db:studio    # Open Drizzle Studio
```

**Important:** Never use `db:push`. Always use `db:generate` then `db:migrate`.

### Local Database Reset

```bash
supabase db reset     # Reset Supabase database
pnpm run db:migrate   # Apply Drizzle migrations
pnpm run db:seed      # Seed auth users and user profiles
```

### Testing

```bash
pnpm run test          # Run all tests once
pnpm run test:watch    # Run tests in watch mode
pnpm run test:ui       # Open Vitest UI
pnpm run test:coverage # Run tests with coverage report
```

### Quality Checks

```bash
pnpm run check     # Run lint + typecheck together
pnpm run lint      # Check for lint issues
pnpm run lint:fix  # Auto-fix lint issues
pnpm run format    # Format all files with Biome
pnpm run typecheck # TypeScript type checking
```

### Build

```bash
pnpm run build   # Production build
pnpm run preview # Build and start production server
```

## Architecture

### Directory Structure

- **`src/app/`** - Next.js App Router pages
  - `(public)/` - Public-facing pages (homepage, feed, rankings, matches)
  - `admin/` - Admin dashboard and CRUD pages
  - `provider/` - Provider portal for tool companies
  - `login/`, `signup/` - Auth pages
- **`src/server/`** - Server-side code
  - `db/` - Drizzle schema and client
  - `api/` - tRPC routers and helpers
- **`src/components/`** - React components
  - `ui/` - shadcn/ui components
  - `auth/` - Auth forms
- **`src/lib/`** - Utilities
  - `auth.ts` - Supabase auth helpers
  - `supabase/` - Supabase client setup
- **`src/test/`** - Test utilities and setup

### Key Patterns

#### Database Schema

- All tables use `preseason_*` prefix (enforced by `pgTableCreator`)
- Schema in `src/server/db/schema.ts`
- Migrations generated in `drizzle/` directory
- **Migration workflow:**
  1. Edit `src/server/db/schema.ts`
  2. Run `pnpm run db:generate` to create migration
  3. Review generated SQL in `drizzle/`
  4. Run `pnpm run db:migrate` to apply

#### Authentication & Permissions

- Uses Supabase email OTP authentication
- Auth utilities in `src/lib/auth.ts`
- Protected routes via `src/middleware.ts`
- Roles: `admin`, `provider`, `critic`, `user`
- Route protection: `/admin` (admin only), `/provider` (provider only)

#### Component Patterns

- App Router defaults to Server Components
- Add `"use client"` only when needed for hooks/state/events
- Tailwind with `cn()` helper for conditional classes
- shadcn/ui components in `src/components/ui/`
- English only (no i18n)
- Dark mode default, with light mode toggle (next-themes)

## Development Workflow

### Before Committing

1. Run `pnpm run check` - Fix all lint/type issues
2. Run `pnpm run test` - Ensure tests pass
3. Run `pnpm run format` - Format code with Biome
4. Use semantic commits: `feat|fix|docs|refactor|test|chore: summary`

### Code Style

- Use `~/` import alias
- Prefer `type` over `interface`
- Prefix unused vars with `_`
- Use Zod for input validation
- Always pair `update`/`delete` with `.where()`
- Place tests as colocated `*.test.ts` files next to implementation files
- Keep `src/test/` for shared test infra/utilities only; avoid `__test__` and `__tests__` folders in app code

### Local Testing

- Supabase Studio: http://localhost:58823
- Inbucket (test emails): http://localhost:58824
- Next.js app: http://localhost:3000

## Important Notes

- **Never** use `pnpm run db:push` - always use generate + migrate
- Tests use Testcontainers for PostgreSQL (Docker required)
- All timestamps stored as UTC in the database
- **Never** add AI attribution (e.g. `Co-Authored-By`) to git commit messages
