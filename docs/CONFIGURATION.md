# Configuration

Preseason reads environment variables from `.env.local` in local development,
or from your deployment platform's environment settings in production.

Use `.env.example` as the baseline template.

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | Postgres connection string used by Drizzle and server routes. | `postgresql://...` |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL for browser/server auth clients. | `https://xyzcompany.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key used by client-facing auth calls. | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended in runtime | Server-side Supabase admin access for privileged operations. Optional in tests. | `eyJ...` |
| `OPENROUTER_API_KEY` | Required for benchmark/match generation | API key for OpenRouter model calls. | `sk-or-...` |
| `CRON_SECRET` | Required for production cron | Bearer token required by `/api/cron/benchmark-run`. | `openssl rand -hex 32` |
| `SEED_ADMIN_EMAIL` | Optional | Admin email created by `pnpm run db:seed`. Defaults to `admin@example.com`. | `admin@example.com` |
| `SEED_ADMIN_NAME` | Optional | Admin display name seeded with the email above. Defaults to `Admin`. | `Admin` |
| `NEXT_PUBLIC_APP_URL` | Recommended in production | Canonical public app URL used in metadata and OpenRouter referer fallback. | `https://preseason.ai` |

## Platform-Provided Variables

These do not usually need to be set manually:

| Variable | Source | Usage |
|----------|--------|-------|
| `NODE_ENV` | Node/runtime | Controls framework mode (`development`, `test`, `production`). |
| `PORT` | Hosting platform | Used for local server URL fallback in tRPC client bootstrap. |
| `VERCEL_URL` | Vercel | Fallback app origin when `NEXT_PUBLIC_APP_URL` is unset. |
| `VERCEL_PROJECT_PRODUCTION_URL` | Vercel | Preferred production hostname fallback for outbound headers. |
| `VERCEL_ENV` | Vercel | Used to detect preview deployments in prerender paths. |

## Validation Controls

| Variable | Use Case | Warning |
|----------|----------|---------|
| `SKIP_ENV_VALIDATION` | Test harness / isolated scripts | Do not use in production. It bypasses schema validation. |

## Local Setup Flow

```bash
cp .env.example .env.local
```

Then fill values from `supabase status` and your OpenRouter account.

## Deployment Notes

- Prefer setting variables in your hosting dashboard, not in committed files.
- Rotate secrets regularly and after contributor offboarding.
- Use different credentials for development and production environments.
