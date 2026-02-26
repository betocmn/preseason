# Wine2cents - Wine Fair Software (for Velin, Tipchenizta)

Wine2cents is a wine rating and review web application designed for wine fair attendees and producers. The app allows users to scan wine labels, rate wines, take notes, and share their reviews.

## Setup Instructions

### Stack Overview

This project uses the T3 Stack:

- [Next.js 15](https://nextjs.org) (App Router)
- [tRPC v11](https://trpc.io)
- [Tailwind CSS v4](https://tailwindcss.com)
- [TypeScript](https://typescriptlang.org)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Supabase](https://supabase.com) (Authentication & Database)

### Prerequisites

- **Node.js 22** (LTS)
- **pnpm** (>= 10.x) - This project uses pnpm as the package manager
- **Docker** - Required for local Supabase and tests (Testcontainers)
- [Supabase CLI](https://supabase.com/docs/guides/cli) - For local development

### Getting Started

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Start Supabase locally**

   ```bash
   supabase start
   ```

   View your Supabase credentials with:

   ```bash
   supabase status
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Fill in the required credentials from `supabase status`:
   - `DATABASE_URL` - Use the "DB URL" value
   - `NEXT_PUBLIC_SUPABASE_URL` - Use the "API URL" value
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Use the "anon key" value

4. **Set up the database**

   ```bash
   # Reset Supabase and seed auth users
   supabase db reset

   # Apply Drizzle migrations
   pnpm run db:migrate

   # Seed app data (user profiles)
   pnpm run db:seed
   ```

5. **Run the development server**

   ```bash
   pnpm run dev
   ```

   The application will be available at: http://localhost:3000

## Supabase Auth Setup

This app uses Supabase email OTP (One-Time Password) authentication. When running locally:

- Emails are **not** sent to real addresses
- All authentication emails are captured by Inbucket (test mail server)
- View captured emails at: http://localhost:56424
- To find your login email, enter just the username part (e.g., for "beto@vinte.ai", search for "beto")

### Pre-seeded Test Users

The following users are automatically created when you run `supabase db reset`:

- `beto@vinte.ai`
- `elliott@vinte.ai`

## Adding New Users

Since this is an internal dashboard, users must be manually added (no self-registration).

### Step 1: Create Auth User in Supabase

1. Open Supabase Studio: http://localhost:56423
2. Navigate to **Authentication** → **Users**
3. Click **Add user** → **Create new user**
4. Enter the user's email address
5. Leave password blank (users will sign in via OTP)
6. Check "Auto Confirm User"
7. Click **Create user**

### Step 2: Create User Profile

After creating the auth user, add their profile to the app database:

**Option A: Using Supabase Studio**

1. In Supabase Studio, go to **Table Editor**
2. Select the `wine_fair_user_profile` table
3. Click **Insert** → **Insert row**
4. Fill in:
   - `id`: Copy the user's UUID from the Authentication → Users page
   - `email`: The user's email address
   - `role`: One of `admin`, `internal`, or `external_viewer`
   - `display_name`: (Optional) User's display name
   - `createdAt`: Current timestamp
5. Click **Save**

**Option B: Using SQL**

Run this in Supabase Studio → SQL Editor:

```sql
INSERT INTO wine_fair_user_profile (id, email, role, "createdAt")
SELECT id, email, 'internal', now()
FROM auth.users
WHERE email = 'newuser@vinte.ai';
```

### User Roles

- `admin` - Full access to all features
- `internal` - Standard internal user access
- `external_viewer` - Read-only access for external stakeholders

## Common Commands

### Development

```bash
pnpm run dev          # Start dev server with Turbo
```

### Database

```bash
pnpm run db:generate  # Generate migration from schema changes
pnpm run db:migrate   # Apply pending migrations
pnpm run db:seed      # Seed app data (user profiles)
pnpm run db:studio    # Open Drizzle Studio
```

**Important:** Never use `db:push`. Always use `db:generate` then `db:migrate`.

### Quality Checks

```bash
pnpm run check        # Run lint + typecheck together
pnpm run lint         # Check for lint issues
pnpm run lint:fix     # Auto-fix lint issues
pnpm run format       # Format code with Biome
pnpm run typecheck    # TypeScript type checking
```

### Build

```bash
pnpm run build        # Production build
pnpm run preview      # Build and start production server
```

## Testing

This project uses **Vitest** for testing with Testcontainers for PostgreSQL.

```bash
pnpm run test          # Run all tests (single run)
pnpm run test:watch    # Run tests in watch mode
pnpm run test:coverage # Run tests with coverage report
pnpm run test:ui       # Open Vitest UI (interactive)
```

**Note:** Tests require Docker to be running (for Testcontainers).

## Local Development URLs

| Service | URL |
|---------|-----|
| Next.js App | http://localhost:3000 |
| Supabase Studio | http://localhost:56423 |
| Inbucket (Test Emails) | http://localhost:56424 |

## Resetting Local Environment

To fully reset and re-seed your local database:

```bash
supabase db reset     # Reset Supabase, seeds auth.users
pnpm run db:migrate   # Apply Drizzle migrations
pnpm run db:seed      # Seed app data (user profiles)
```
