CREATE TYPE "public"."match_batch_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."match_evaluation_status" AS ENUM('pending', 'completed', 'failed', 'invalid_output');--> statement-breakpoint
CREATE TYPE "public"."match_presentation_order" AS ENUM('a_first', 'b_first');--> statement-breakpoint
CREATE TYPE "public"."match_trigger_mode" AS ENUM('manual', 'benchmark_run');--> statement-breakpoint
CREATE TYPE "public"."match_winner_decision" AS ENUM('tool_a', 'tool_b', 'tie', 'abstain');--> statement-breakpoint
CREATE TABLE "preseason_match_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"config_id" uuid,
	"category_id" uuid NOT NULL,
	"tool_a_id" uuid NOT NULL,
	"tool_b_id" uuid NOT NULL,
	"prompt_template_id" uuid NOT NULL,
	"benchmark_run_id" uuid,
	"trigger_mode" "match_trigger_mode" NOT NULL,
	"idempotency_key" varchar(255),
	"status" "match_batch_status" DEFAULT 'pending' NOT NULL,
	"total_evaluations" integer DEFAULT 0 NOT NULL,
	"completed_evaluations" integer DEFAULT 0 NOT NULL,
	"failed_evaluations" integer DEFAULT 0 NOT NULL,
	"invalid_output_evaluations" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"claim_token" uuid,
	"last_heartbeat_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"triggered_by" uuid,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "match_batch_tool_order_check" CHECK (tool_a_id < tool_b_id),
	CONSTRAINT "match_batch_running_requires_claim" CHECK (status != 'running' OR (claim_token IS NOT NULL AND last_heartbeat_at IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "preseason_match_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"tool_a_id" uuid NOT NULL,
	"tool_b_id" uuid NOT NULL,
	"prompt_template_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "match_config_tool_order_check" CHECK (tool_a_id < tool_b_id)
);
--> statement-breakpoint
CREATE TABLE "preseason_match_evaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"model_snapshot_id" uuid NOT NULL,
	"presentation_order" "match_presentation_order" NOT NULL,
	"status" "match_evaluation_status" DEFAULT 'pending' NOT NULL,
	"winner_decision" "match_winner_decision",
	"winner_id" uuid,
	"comparison_summary" text,
	"tool_a_pros" jsonb,
	"tool_a_cons" jsonb,
	"tool_b_pros" jsonb,
	"tool_b_cons" jsonb,
	"confidence" real,
	"natural_response" text,
	"appendix_raw" text,
	"appendix_json" jsonb,
	"raw_response" text,
	"requested_model_id" varchar(255),
	"returned_model_id" varchar(255),
	"provider" varchar(100),
	"finish_reason" varchar(50),
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"latency_ms" integer,
	"temperature" real,
	"top_p" real,
	"max_tokens" integer,
	"seed" integer,
	"parser_version" varchar(50),
	"rendered_user_prompt" text,
	"prompt_hash" varchar(64),
	"system_prompt_snapshot" text,
	"error_message" text,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preseason_match_prompt_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"template_md" text NOT NULL,
	"schema_version" varchar(50) NOT NULL,
	"system_prompt_snapshot" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "preseason_match_prompt_template_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_run_id_season_idx" ON "preseason_benchmark_run" USING btree ("id","season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_batch_idempotency_key_idx" ON "preseason_match_batch" USING btree ("idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "match_batch_id_season_idx" ON "preseason_match_batch" USING btree ("id","season_id");--> statement-breakpoint
CREATE INDEX "match_batch_status_heartbeat_idx" ON "preseason_match_batch" USING btree ("status","last_heartbeat_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_config_active_matchup_idx" ON "preseason_match_config" USING btree ("season_id","category_id","tool_a_id","tool_b_id") WHERE is_active = true;--> statement-breakpoint
CREATE UNIQUE INDEX "match_config_composite_fk_idx" ON "preseason_match_config" USING btree ("id","season_id","category_id","tool_a_id","tool_b_id","prompt_template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_evaluation_batch_model_order_idx" ON "preseason_match_evaluation" USING btree ("batch_id","model_snapshot_id","presentation_order");--> statement-breakpoint
CREATE UNIQUE INDEX "match_prompt_template_one_active_idx" ON "preseason_match_prompt_template" USING btree ("is_active") WHERE is_active = true;--> statement-breakpoint
ALTER TABLE "preseason_match_batch" ADD CONSTRAINT "preseason_match_batch_season_id_preseason_benchmark_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."preseason_benchmark_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_batch" ADD CONSTRAINT "preseason_match_batch_category_id_preseason_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."preseason_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_batch" ADD CONSTRAINT "preseason_match_batch_tool_a_id_preseason_tool_id_fk" FOREIGN KEY ("tool_a_id") REFERENCES "public"."preseason_tool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_batch" ADD CONSTRAINT "preseason_match_batch_tool_b_id_preseason_tool_id_fk" FOREIGN KEY ("tool_b_id") REFERENCES "public"."preseason_tool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_batch" ADD CONSTRAINT "preseason_match_batch_prompt_template_id_preseason_match_prompt_template_id_fk" FOREIGN KEY ("prompt_template_id") REFERENCES "public"."preseason_match_prompt_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_batch" ADD CONSTRAINT "preseason_match_batch_triggered_by_preseason_user_profile_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."preseason_user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_batch" ADD CONSTRAINT "match_batch_benchmark_run_season_fk" FOREIGN KEY ("benchmark_run_id","season_id") REFERENCES "public"."preseason_benchmark_run"("id","season_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_batch" ADD CONSTRAINT "match_batch_config_composite_fk" FOREIGN KEY ("config_id","season_id","category_id","tool_a_id","tool_b_id","prompt_template_id") REFERENCES "public"."preseason_match_config"("id","season_id","category_id","tool_a_id","tool_b_id","prompt_template_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_config" ADD CONSTRAINT "preseason_match_config_season_id_preseason_benchmark_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."preseason_benchmark_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_config" ADD CONSTRAINT "preseason_match_config_category_id_preseason_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."preseason_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_config" ADD CONSTRAINT "preseason_match_config_tool_a_id_preseason_tool_id_fk" FOREIGN KEY ("tool_a_id") REFERENCES "public"."preseason_tool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_config" ADD CONSTRAINT "preseason_match_config_tool_b_id_preseason_tool_id_fk" FOREIGN KEY ("tool_b_id") REFERENCES "public"."preseason_tool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_config" ADD CONSTRAINT "preseason_match_config_prompt_template_id_preseason_match_prompt_template_id_fk" FOREIGN KEY ("prompt_template_id") REFERENCES "public"."preseason_match_prompt_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_config" ADD CONSTRAINT "preseason_match_config_created_by_preseason_user_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."preseason_user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_evaluation" ADD CONSTRAINT "preseason_match_evaluation_batch_id_preseason_match_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."preseason_match_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_evaluation" ADD CONSTRAINT "preseason_match_evaluation_season_id_preseason_benchmark_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."preseason_benchmark_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_evaluation" ADD CONSTRAINT "preseason_match_evaluation_model_snapshot_id_preseason_benchmark_model_snapshot_id_fk" FOREIGN KEY ("model_snapshot_id") REFERENCES "public"."preseason_benchmark_model_snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_evaluation" ADD CONSTRAINT "preseason_match_evaluation_winner_id_preseason_tool_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."preseason_tool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_evaluation" ADD CONSTRAINT "match_evaluation_batch_season_fk" FOREIGN KEY ("batch_id","season_id") REFERENCES "public"."preseason_match_batch"("id","season_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match_evaluation" ADD CONSTRAINT "match_evaluation_season_model_fk" FOREIGN KEY ("season_id","model_snapshot_id") REFERENCES "public"."preseason_benchmark_season_model"("season_id","model_snapshot_id") ON DELETE no action ON UPDATE no action;