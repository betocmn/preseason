ALTER TYPE "public"."case_result_status" ADD VALUE 'running' BEFORE 'completed';--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_result" ADD COLUMN "claim_token" uuid;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_result" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_result" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_result" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "benchmark_case_result_run_status_started_idx" ON "preseason_benchmark_case_result" USING btree ("run_id","status","started_at");