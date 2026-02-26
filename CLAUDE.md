# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Wine2cents - A wine rating and review web application for wine fair attendees and producers.

**Stack:** T3 Stack (Next.js 15 App Router, Drizzle ORM, PostgreSQL via Supabase, Tailwind v4, TypeScript)

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
- **`src/server/`** - Server-side code
  - `db/` - Drizzle schema and client
- **`src/components/`** - React components
  - `ui/` - shadcn/ui components
- **`src/lib/`** - Utilities
  - `auth.ts` - Supabase auth helpers
  - `supabase/` - Supabase client setup
- **`src/test/`** - Test utilities and setup

### Key Patterns

#### Database Schema

- All tables use `wine_fair_*` prefix (enforced by `pgTableCreator`)
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
- **Permissions reference:** `docs/implementation/permissions.md` — role definitions, route access matrix, API permission matrix, and the pattern for adding permissions to new procedures

#### Component Patterns

- App Router defaults to Server Components
- Add `"use client"` only when needed for hooks/state/events
- Tailwind with `cn()` helper for conditional classes
- shadcn/ui components in `src/components/ui/`

#### Internationalization (i18n)

- **All user-facing strings must be translated** — never hardcode English in components
- Add strings to both `messages/en.json` and `messages/bg.json`
- Client components: `useTranslations('namespace')` from `next-intl`
- Server components: `await getTranslations('namespace')` from `next-intl/server`
- Use `Link`, `useRouter`, `usePathname` from `~/i18n/navigation` (not `next/link` or `next/navigation`)
- Run `pnpm run i18n:verify` to check key parity between locales
- See `docs/guides/how-translations-work.md` for full details

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

### Local Testing

- Supabase Studio: http://localhost:56423
- Inbucket (test emails): http://localhost:56424
- Next.js app: http://localhost:3000

## Important Notes

- **Never** use `pnpm run db:push` - always use generate + migrate
- Tests use Testcontainers for PostgreSQL (Docker required)
- All timestamps stored as UTC in the database
