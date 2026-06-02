# Deployment

Preseason currently supports one launch-ready deployment path:

- Vercel for the Next.js app
- Supabase Cloud for Postgres and Auth
- OpenRouter for model calls

For environment variable details, see [`docs/CONFIGURATION.md`](CONFIGURATION.md).

## Vercel + Supabase Cloud

This is the lowest-friction production path.

### Steps

1. Create a Supabase project.
2. Run database setup once with the production Supabase connection string:

```bash
export DATABASE_URL="postgresql://..."
export SEED_ADMIN_EMAIL="admin@example.com"
export SEED_ADMIN_NAME="Admin"

pnpm install
pnpm exec tsx src/server/db/pre-migrate.ts
pnpm exec drizzle-kit migrate
pnpm exec tsx src/server/db/post-migrate.ts
pnpm exec tsx src/server/db/seed.ts
```

Do not use the package `db:migrate` / `db:seed` scripts for production setup;
they intentionally load `.env.local` for local development.

3. Deploy with the pre-filled Vercel button:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbetocmn%2Fpreseason&env=DATABASE_URL,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,OPENROUTER_API_KEY,CRON_SECRET&envDescription=See%20.env.example&envLink=https%3A%2F%2Fgithub.com%2Fbetocmn%2Fpreseason%2Fblob%2Fmain%2F.env.example)

4. Set production environment variables in Vercel (same names as `.env.example`).
5. Schedule the benchmark cron route (`/api/cron/benchmark-run`) in Vercel Cron
   or an external scheduler, with `Authorization: Bearer <CRON_SECRET>`.

### Notes

- Set `NEXT_PUBLIC_APP_URL` to your canonical app URL for metadata and OpenRouter
  referer headers.
- Use pooled Postgres connection strings in production where possible.

## Not Supported Yet

Docker Compose and plain Postgres self-hosting are intentionally not supported
yet. Preseason currently depends on Supabase Auth behavior and seed data that
touches Supabase-managed `auth.users` / `auth.identities` tables, so a
Postgres-only Compose stack is not a reliable launch path.

For local development, use the Supabase CLI flow in [`docs/SETUP.md`](SETUP.md).

Future Docker/self-hosting support should include:

- Supabase-compatible auth services or an app-level auth abstraction
- A seed path that works outside Supabase-managed schemas
- Managed cron scheduler
- TLS, logging, backups, and operational hardening

## Recommended Production Checklist

- Enable Supabase backups + point-in-time recovery where appropriate.
- Rotate `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, and `CRON_SECRET`.
- Restrict cron endpoint access to known IPs or trusted scheduler where
  possible.
- Run `pnpm run check` and `pnpm run test` before every deployment.
