import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not configured')
}

const sql = postgres(databaseUrl, { max: 1 })

try {
  // Backfill legacy matches before the NOT NULL migration runs.
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'preseason_match'
          AND column_name = 'period_end'
      ) THEN
        UPDATE public.preseason_match
        SET period_end = period_start
        WHERE period_end IS NULL;
      END IF;
    END
    $$;
  `
} finally {
  await sql.end({ timeout: 5 })
}
