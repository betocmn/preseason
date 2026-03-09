-- Add slug columns as nullable first
ALTER TABLE "preseason_critic_profile" ADD COLUMN "slug" varchar(255);--> statement-breakpoint
ALTER TABLE "preseason_match" ADD COLUMN "slug" varchar(255);--> statement-breakpoint

-- Backfill match slugs from tool + category slugs + period
UPDATE "preseason_match" m
SET slug = CONCAT(
  ta.slug, '-vs-', tb.slug, '-', c.slug, '-',
  TO_CHAR(m.period_start::date, 'YYYY-MM')
)
FROM "preseason_tool" ta, "preseason_tool" tb, "preseason_category" c
WHERE ta.id = m.tool_a_id AND tb.id = m.tool_b_id AND c.id = m.category_id;--> statement-breakpoint

-- Backfill critic slugs from user display names
UPDATE "preseason_critic_profile" cp
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(up.display_name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
FROM "preseason_user_profile" up
WHERE up.id = cp.user_id;--> statement-breakpoint

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
