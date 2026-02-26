# AGENTS.md

Guidelines for AI agents working on this codebase.

## Project Context

Wine2cents - A wine rating and review web application. See `CLAUDE.md` for full project details and commands.

## Critical Rules

### Database

- **NEVER run `pnpm run db:push`** - Always use `db:generate` then `db:migrate`
- **NEVER manually edit** files in `drizzle/` or `drizzle/meta/`
- All tables must use `wine_fair_*` prefix
- Always use `.where()` with update/delete operations

### Internationalization (i18n)

- **All user-facing strings must be in both `messages/en.json` and `messages/bg.json`** — never hardcode English in components
- Client components: `useTranslations('namespace')` from `next-intl`
- Server components: `await getTranslations('namespace')` from `next-intl/server`
- Use `Link`, `useRouter`, `usePathname` from `~/i18n/navigation` (not `next/link` or `next/navigation`)
- Run `pnpm run i18n:verify` to check key parity between locales
- See `docs/guides/how-translations-work.md` for full details

### Code Quality

- Run `pnpm run check` before committing (lint + typecheck)
- Run `pnpm run test` to verify tests pass
- Run `pnpm run format` to format code

## Quick Reference

| Task | Command |
|------|---------|
| Start dev server | `pnpm run dev` |
| Run tests | `pnpm run test` |
| Lint + typecheck | `pnpm run check` |
| Format code | `pnpm run format` |
| Verify translations | `pnpm run i18n:verify` |
| Generate migration | `pnpm run db:generate` |
| Apply migration | `pnpm run db:migrate` |
| Open DB studio | `pnpm run db:studio` |

## Permissions

Before adding or modifying routes and tRPC procedures, consult `docs/implementation/permissions.md` for the role-based access control reference. It defines which roles can access which routes and API procedures, ownership rules, and the pattern for adding permissions to new code.

## File Locations

- Schema: `src/server/db/schema.ts`
- Auth utilities: `src/lib/auth.ts`
- Auth helpers (role checks): `src/server/api/helpers/auth.ts`
- Permissions reference: `docs/implementation/permissions.md`
- Route protection: `src/middleware.ts`
- UI components: `src/components/ui/`
- Tests: `src/test/`
- i18n config: `src/i18n/`
- Translation files: `messages/en.json`, `messages/bg.json`
- Translation guide: `docs/guides/how-translations-work.md`
