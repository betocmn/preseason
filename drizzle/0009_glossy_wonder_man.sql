DROP TABLE "preseason_match" CASCADE;--> statement-breakpoint
DROP TABLE "preseason_recommendation" CASCADE;--> statement-breakpoint
DROP TABLE "preseason_run_result" CASCADE;--> statement-breakpoint
DROP TABLE "preseason_run" CASCADE;--> statement-breakpoint
ALTER TABLE "preseason_tool" DROP COLUMN "aliases";--> statement-breakpoint
ALTER TABLE "public"."preseason_comment" ALTER COLUMN "target_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."comment_target";--> statement-breakpoint
CREATE TYPE "public"."comment_target" AS ENUM('tool', 'prompt');--> statement-breakpoint
ALTER TABLE "public"."preseason_comment" ALTER COLUMN "target_type" SET DATA TYPE "public"."comment_target" USING "target_type"::"public"."comment_target";--> statement-breakpoint
DROP TYPE "public"."match_status";--> statement-breakpoint
DROP TYPE "public"."parse_status";--> statement-breakpoint
DROP TYPE "public"."run_status";