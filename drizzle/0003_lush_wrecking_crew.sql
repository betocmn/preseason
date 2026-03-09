-- Add slug columns as nullable first
ALTER TABLE "preseason_critic_profile" ADD COLUMN "slug" varchar(255);--> statement-breakpoint
ALTER TABLE "preseason_match" ADD COLUMN "slug" varchar(255);--> statement-breakpoint

-- Backfill match slugs from tool + category slugs + period
WITH match_slug_candidates AS (
  SELECT
    m.id,
    LEFT(CONCAT(
      ta.slug, '-vs-', tb.slug, '-', c.slug, '-',
      TO_CHAR(m.period_start::date, 'YYYY-MM-DD')
    ), 255) AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY LEFT(CONCAT(
        ta.slug, '-vs-', tb.slug, '-', c.slug, '-',
        TO_CHAR(m.period_start::date, 'YYYY-MM-DD')
      ), 255)
      ORDER BY m.period_start, m.id
    ) AS slug_rank
  FROM "preseason_match" m
  INNER JOIN "preseason_tool" ta ON ta.id = m.tool_a_id
  INNER JOIN "preseason_tool" tb ON tb.id = m.tool_b_id
  INNER JOIN "preseason_category" c ON c.id = m.category_id
)
UPDATE "preseason_match" m
SET slug = CASE
  WHEN candidate.slug_rank = 1 THEN candidate.base_slug
  ELSE LEFT(LEFT(candidate.base_slug, 255 - LENGTH('-' || candidate.slug_rank)) || '-' || candidate.slug_rank, 255)
END
FROM match_slug_candidates candidate
WHERE candidate.id = m.id;--> statement-breakpoint

-- Backfill critic slugs from user display names
WITH critic_slug_candidates AS (
  SELECT
    cp.id,
    NULLIF(
      LOWER(
        REGEXP_REPLACE(
          REGEXP_REPLACE(up.display_name, '[^a-zA-Z0-9]+', '-', 'g'),
          '(^-|-$)',
          '',
          'g'
        )
      ),
      ''
    ) AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY NULLIF(
        LOWER(
          REGEXP_REPLACE(
            REGEXP_REPLACE(up.display_name, '[^a-zA-Z0-9]+', '-', 'g'),
            '(^-|-$)',
            '',
            'g'
          )
        ),
        ''
      )
      ORDER BY cp.id
    ) AS slug_rank
  FROM "preseason_critic_profile" cp
  INNER JOIN "preseason_user_profile" up ON up.id = cp.user_id
)
UPDATE "preseason_critic_profile" cp
SET slug = LEFT(CASE
  WHEN candidate.base_slug IS NULL THEN cp.id::text
  WHEN candidate.slug_rank = 1 THEN candidate.base_slug
  ELSE CONCAT(candidate.base_slug, '-', candidate.slug_rank)
END, 255)
FROM critic_slug_candidates candidate
WHERE candidate.id = cp.id;--> statement-breakpoint

-- Handle any NULL slugs that might remain (fallback to id)
UPDATE "preseason_match" SET slug = id::text WHERE slug IS NULL;--> statement-breakpoint
UPDATE "preseason_critic_profile" SET slug = id::text WHERE slug IS NULL;--> statement-breakpoint

-- Now set NOT NULL
ALTER TABLE "preseason_critic_profile" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "preseason_match" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint

-- Add indexes and unique constraints
CREATE INDEX "critic_profile_slug_idx" ON "preseason_critic_profile" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "match_slug_idx" ON "preseason_match" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "preseason_critic_profile" ADD CONSTRAINT "preseason_critic_profile_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "preseason_match" ADD CONSTRAINT "preseason_match_slug_unique" UNIQUE("slug");
