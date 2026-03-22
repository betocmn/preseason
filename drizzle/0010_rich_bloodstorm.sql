ALTER TABLE "preseason_benchmark_prompt_version" DROP COLUMN "tier";--> statement-breakpoint
ALTER TABLE "preseason_prompt" ALTER COLUMN "level" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."preseason_benchmark_prompt_version" ALTER COLUMN "level" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."preseason_prompt" ALTER COLUMN "level" SET DATA TYPE text;--> statement-breakpoint
UPDATE "preseason_prompt" SET "level" = 'beginner' WHERE "level" = 'vibe-coder';--> statement-breakpoint
UPDATE "preseason_prompt" SET "level" = 'intermediate' WHERE "level" = 'software-dev-beginner';--> statement-breakpoint
UPDATE "preseason_prompt" SET "level" = 'advanced' WHERE "level" = 'software-dev-experienced';--> statement-breakpoint
UPDATE "preseason_benchmark_prompt_version" SET "level" = 'beginner' WHERE "level" = 'vibe-coder';--> statement-breakpoint
UPDATE "preseason_benchmark_prompt_version" SET "level" = 'intermediate' WHERE "level" = 'software-dev-beginner';--> statement-breakpoint
UPDATE "preseason_benchmark_prompt_version" SET "level" = 'advanced' WHERE "level" = 'software-dev-experienced';--> statement-breakpoint
DROP TYPE "public"."prompt_level";--> statement-breakpoint
CREATE TYPE "public"."prompt_level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
ALTER TABLE "public"."preseason_benchmark_prompt_version" ALTER COLUMN "level" SET DATA TYPE "public"."prompt_level" USING "level"::"public"."prompt_level";--> statement-breakpoint
ALTER TABLE "public"."preseason_prompt" ALTER COLUMN "level" SET DATA TYPE "public"."prompt_level" USING "level"::"public"."prompt_level";--> statement-breakpoint
ALTER TABLE "preseason_prompt" ALTER COLUMN "level" SET DEFAULT 'beginner';--> statement-breakpoint
DROP TYPE "public"."prompt_tier";
