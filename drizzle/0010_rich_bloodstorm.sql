-- Step 1: Change default for prompts.level
ALTER TABLE "preseason_prompt" ALTER COLUMN "level" SET DEFAULT 'beginner';--> statement-breakpoint

-- Step 2: Drop tier column from benchmark_prompt_version
ALTER TABLE "preseason_benchmark_prompt_version" DROP COLUMN "tier";--> statement-breakpoint

-- Step 3: Convert columns to text temporarily so we can migrate data
ALTER TABLE "public"."preseason_benchmark_prompt_version" ALTER COLUMN "level" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."preseason_prompt" ALTER COLUMN "level" SET DATA TYPE text;--> statement-breakpoint

-- Step 4: Migrate existing data to new values
UPDATE "preseason_prompt" SET "level" = 'beginner' WHERE "level" = 'vibe-coder';--> statement-breakpoint
UPDATE "preseason_prompt" SET "level" = 'intermediate' WHERE "level" = 'software-dev-beginner';--> statement-breakpoint
UPDATE "preseason_prompt" SET "level" = 'advanced' WHERE "level" = 'software-dev-experienced';--> statement-breakpoint
UPDATE "preseason_benchmark_prompt_version" SET "level" = 'beginner' WHERE "level" = 'vibe-coder';--> statement-breakpoint
UPDATE "preseason_benchmark_prompt_version" SET "level" = 'intermediate' WHERE "level" = 'software-dev-beginner';--> statement-breakpoint
UPDATE "preseason_benchmark_prompt_version" SET "level" = 'advanced' WHERE "level" = 'software-dev-experienced';--> statement-breakpoint

-- Step 5: Also migrate benchmark prompt version tier values to level for any rows
-- that had tier=basic but no matching level migration (tier was a separate concept)
-- Note: tier column is already dropped in step 2, this is for the level column only

-- Step 6: Recreate the enum with new values
DROP TYPE "public"."prompt_level";--> statement-breakpoint
CREATE TYPE "public"."prompt_level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint

-- Step 7: Cast columns back to the enum type
ALTER TABLE "public"."preseason_benchmark_prompt_version" ALTER COLUMN "level" SET DATA TYPE "public"."prompt_level" USING "level"::"public"."prompt_level";--> statement-breakpoint
ALTER TABLE "public"."preseason_prompt" ALTER COLUMN "level" SET DATA TYPE "public"."prompt_level" USING "level"::"public"."prompt_level";--> statement-breakpoint

-- Step 8: Drop the now-unused prompt_tier enum
DROP TYPE "public"."prompt_tier";
