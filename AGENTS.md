# AGENTS.md

Guidelines for AI agents working on this codebase.

## Project Context

Preseason — Tracks what tools LLMs recommend for vibe-coding prompts. See `CLAUDE.md` for full project details and commands.

## Critical Rules

### Database

- **NEVER run `pnpm run db:push`** - Always use `db:generate` then `db:migrate`
- **NEVER manually edit** files in `drizzle/` or `drizzle/meta/`
- All tables must use `preseason_*` prefix
- Always use `.where()` with update/delete operations

### Code Quality

- Run `pnpm run check` before committing (lint + typecheck)
- Run `pnpm run test` to verify tests pass
- Run `pnpm run format` to format code
- Place tests as colocated `*.test.ts` files next to implementation files
- Use `src/test/` only for shared test infra/utilities; do not use `__test__` or `__tests__` folders in app code
- English only — no i18n, plain strings in components
- **Never** add AI attribution (e.g. `Co-Authored-By`) to git commit messages

## Quick Reference

| Task | Command |
|------|---------|
| Start dev server | `pnpm run dev` |
| Run tests | `pnpm run test` |
| Lint + typecheck | `pnpm run check` |
| Format code | `pnpm run format` |
| Generate migration | `pnpm run db:generate` |
| Apply migration | `pnpm run db:migrate` |
| Open DB studio | `pnpm run db:studio` |

## File Locations

- Schema: `src/server/db/schema.ts`
- Auth utilities: `src/lib/auth.ts`
- Auth helpers (role checks): `src/server/api/helpers/auth.ts`
- Route protection: `src/middleware.ts`
- UI components: `src/components/ui/`
- Tests: `src/test/`
