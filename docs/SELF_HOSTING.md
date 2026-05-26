# Self-Hosting

This guide documents three deployment paths:

1. Vercel + Supabase Cloud (recommended)
2. Docker Compose local stack (community-supported)
3. Bring-your-own infrastructure

For environment variable details, see [`docs/CONFIGURATION.md`](CONFIGURATION.md).

## 1) Vercel + Supabase Cloud (Recommended)

This is the lowest-friction production path.

### Steps

1. Create a Supabase project.
2. Run database setup once:
   - `pnpm run db:migrate`
   - `pnpm run db:seed`
3. Deploy with the pre-filled Vercel button:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbetocmn%2Fpreseason&env=DATABASE_URL,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,OPENROUTER_API_KEY,CRON_SECRET&envDescription=See%20.env.example&envLink=https%3A%2F%2Fgithub.com%2Fbetocmn%2Fpreseason%2Fblob%2Fmain%2F.env.example)

4. Set production environment variables in Vercel (same names as `.env.example`).
5. Schedule the benchmark cron route (`/api/cron/benchmark-run`) in Vercel Cron
   or an external scheduler, with `Authorization: Bearer <CRON_SECRET>`.

### Notes

- Set `NEXT_PUBLIC_APP_URL` to your canonical app URL for metadata and OpenRouter
  referer headers.
- Use pooled Postgres connection strings in production where possible.

## 2) Docker Compose (Community-Supported)

`docker-compose.yml` provides a Postgres 16 + Next.js stack for local and
small self-managed environments.

### What this stack includes

- `db`: PostgreSQL 16
- `app`: Next.js runtime, migrations, seed, and server startup

### What this stack does not include

- Supabase Auth/Storage/Realtime services
- Managed cron scheduler
- Production hardening (TLS termination, WAF, autoscaling)

You can still run the app by pointing Supabase-related environment variables to
an existing Supabase project.

### Steps

1. Copy env template:

```bash
cp .env.example .env.compose
```

2. Edit `.env.compose` with real values. `DATABASE_URL` is ignored by Compose
   and replaced with the container-local Postgres URL.
3. Start the stack:

```bash
docker compose up --build
```

4. Open <http://localhost:3000>.

To stop:

```bash
docker compose down
```

To reset database volume:

```bash
docker compose down -v
```

## 3) Bring Your Own Infrastructure

For AWS/GCP/Azure/Fly.io/Render/Kubernetes style deployments:

1. Provision Postgres 16+.
2. Deploy the Next.js app as a long-running service (Node 22).
3. Set all required environment variables.
4. Run migrations (`pnpm run db:migrate`) before first traffic.
5. Seed baseline data (`pnpm run db:seed`) and optional demo data
   (`pnpm run db:seed-dev`).
6. Add an external scheduler that hits
   `/api/cron/benchmark-run` with `CRON_SECRET`.
7. Add monitoring/logging (health checks, request errors, cron failures).

## Recommended Production Checklist

- Use managed Postgres backups + point-in-time recovery.
- Rotate `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, and `CRON_SECRET`.
- Restrict cron endpoint access to known IPs or trusted scheduler where
  possible.
- Run `pnpm run check` and `pnpm run test` before every deployment.
