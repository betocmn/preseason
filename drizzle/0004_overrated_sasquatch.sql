CREATE TYPE "public"."benchmark_mode" AS ENUM('exploration', 'benchmark');--> statement-breakpoint
CREATE TYPE "public"."benchmark_window_type" AS ENUM('run_day', 'trailing_7d', 'trailing_28d', 'season_to_date');--> statement-breakpoint
CREATE TYPE "public"."case_result_status" AS ENUM('pending', 'completed', 'failed', 'invalid_output');--> statement-breakpoint
CREATE TYPE "public"."decision_type" AS ENUM('tool', 'none', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."model_tier" AS ENUM('frontier', 'mid', 'small');--> statement-breakpoint
CREATE TYPE "public"."prompt_tier" AS ENUM('basic', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."run_status_v2" AS ENUM('pending', 'running', 'completed', 'failed', 'qc_failed', 'published');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('draft', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."tool_candidate_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "preseason_benchmark_case_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_result_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"decision_type" "decision_type" NOT NULL,
	"tool_id" uuid,
	"raw_tool_name" varchar(255),
	"reasoning" text,
	"self_reported_confidence" real,
	"resolution_status" varchar(50) DEFAULT 'resolved' NOT NULL,
	CONSTRAINT "benchmark_decision_tool_check" CHECK (decision_type != 'tool' OR tool_id IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_case_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"status" "case_result_status" DEFAULT 'pending' NOT NULL,
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
	"parser_version" varchar(50),
	"prompt_hash" varchar(64),
	"system_prompt_snapshot" text,
	"error_message" text,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"model_snapshot_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_model_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"llm_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"provider" varchar(100) NOT NULL,
	"tier" "model_tier" NOT NULL,
	"model_family_key" varchar(100),
	"requested_model_id" varchar(255) NOT NULL,
	"label_returned_model_id" varchar(255),
	"temperature" real,
	"top_p" real,
	"max_tokens" integer,
	"seed" integer,
	"is_deterministic" boolean DEFAULT false NOT NULL,
	"snapshot_key" varchar(512) NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "preseason_benchmark_model_snapshot_snapshot_key_unique" UNIQUE("snapshot_key")
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_model_weight_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"frontier_weight" real DEFAULT 1 NOT NULL,
	"mid_weight" real DEFAULT 1 NOT NULL,
	"small_weight" real DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "preseason_benchmark_model_weight_config_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_prompt_version_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_prompt_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"slug" varchar(255) NOT NULL,
	"level" "prompt_level" NOT NULL,
	"version" integer NOT NULL,
	"tier" "prompt_tier" DEFAULT 'basic' NOT NULL,
	"content_md" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"system_prompt_snapshot" text,
	"prompt_contract_version" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "preseason_benchmark_prompt_version_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_protocol" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"mode" "benchmark_mode" NOT NULL,
	"parser_version" varchar(50) NOT NULL,
	"scoring_version" varchar(50) NOT NULL,
	"prompt_contract_version" varchar(50) NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "preseason_benchmark_protocol_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"scheduled_for" date NOT NULL,
	"trigger" varchar(50) DEFAULT 'cron' NOT NULL,
	"status" "run_status_v2" DEFAULT 'pending' NOT NULL,
	"weight_config_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expected_case_count" integer,
	"completed_case_count" integer,
	"failed_case_count" integer,
	"qc_status" varchar(50),
	"qc_summary_json" jsonb,
	"error_log" text,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_season_model" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"model_snapshot_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_season_prompt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"prompt_version_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "season_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"published_at" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "preseason_benchmark_season_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "preseason_tool_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_id" uuid NOT NULL,
	"alias" varchar(255) NOT NULL,
	"normalized_alias" varchar(255) NOT NULL,
	"source" varchar(100),
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "preseason_tool_alias_normalized_alias_unique" UNIQUE("normalized_alias")
);
--> statement-breakpoint
CREATE TABLE "preseason_tool_candidate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_name" varchar(255) NOT NULL,
	"normalized_name" varchar(255) NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	"suggested_category_id" uuid,
	"status" "tool_candidate_status" DEFAULT 'pending' NOT NULL,
	"approved_tool_id" uuid,
	"notes" text,
	CONSTRAINT "preseason_tool_candidate_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
ALTER TABLE "preseason_prompt" ADD COLUMN "content_md" text;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_decision" ADD CONSTRAINT "preseason_benchmark_case_decision_case_result_id_preseason_benchmark_case_result_id_fk" FOREIGN KEY ("case_result_id") REFERENCES "public"."preseason_benchmark_case_result"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_decision" ADD CONSTRAINT "preseason_benchmark_case_decision_category_id_preseason_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."preseason_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_decision" ADD CONSTRAINT "preseason_benchmark_case_decision_tool_id_preseason_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."preseason_tool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_result" ADD CONSTRAINT "preseason_benchmark_case_result_run_id_preseason_benchmark_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."preseason_benchmark_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_result" ADD CONSTRAINT "preseason_benchmark_case_result_case_id_preseason_benchmark_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."preseason_benchmark_case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case" ADD CONSTRAINT "preseason_benchmark_case_season_id_preseason_benchmark_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."preseason_benchmark_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case" ADD CONSTRAINT "preseason_benchmark_case_prompt_version_id_preseason_benchmark_prompt_version_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."preseason_benchmark_prompt_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case" ADD CONSTRAINT "preseason_benchmark_case_model_snapshot_id_preseason_benchmark_model_snapshot_id_fk" FOREIGN KEY ("model_snapshot_id") REFERENCES "public"."preseason_benchmark_model_snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_model_snapshot" ADD CONSTRAINT "preseason_benchmark_model_snapshot_llm_id_preseason_llm_id_fk" FOREIGN KEY ("llm_id") REFERENCES "public"."preseason_llm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_prompt_version_category" ADD CONSTRAINT "preseason_benchmark_prompt_version_category_prompt_version_id_preseason_benchmark_prompt_version_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."preseason_benchmark_prompt_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_prompt_version_category" ADD CONSTRAINT "preseason_benchmark_prompt_version_category_category_id_preseason_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."preseason_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_prompt_version" ADD CONSTRAINT "preseason_benchmark_prompt_version_prompt_id_preseason_prompt_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."preseason_prompt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_run" ADD CONSTRAINT "preseason_benchmark_run_season_id_preseason_benchmark_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."preseason_benchmark_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_run" ADD CONSTRAINT "preseason_benchmark_run_weight_config_id_preseason_benchmark_model_weight_config_id_fk" FOREIGN KEY ("weight_config_id") REFERENCES "public"."preseason_benchmark_model_weight_config"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_season_model" ADD CONSTRAINT "preseason_benchmark_season_model_season_id_preseason_benchmark_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."preseason_benchmark_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_season_model" ADD CONSTRAINT "preseason_benchmark_season_model_model_snapshot_id_preseason_benchmark_model_snapshot_id_fk" FOREIGN KEY ("model_snapshot_id") REFERENCES "public"."preseason_benchmark_model_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_season_prompt" ADD CONSTRAINT "preseason_benchmark_season_prompt_season_id_preseason_benchmark_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."preseason_benchmark_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_season_prompt" ADD CONSTRAINT "preseason_benchmark_season_prompt_prompt_version_id_preseason_benchmark_prompt_version_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."preseason_benchmark_prompt_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_season" ADD CONSTRAINT "preseason_benchmark_season_protocol_id_preseason_benchmark_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."preseason_benchmark_protocol"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_tool_alias" ADD CONSTRAINT "preseason_tool_alias_tool_id_preseason_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."preseason_tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_tool_candidate" ADD CONSTRAINT "preseason_tool_candidate_suggested_category_id_preseason_category_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."preseason_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_tool_candidate" ADD CONSTRAINT "preseason_tool_candidate_approved_tool_id_preseason_tool_id_fk" FOREIGN KEY ("approved_tool_id") REFERENCES "public"."preseason_tool"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_case_decision_result_category_idx" ON "preseason_benchmark_case_decision" USING btree ("case_result_id","category_id");--> statement-breakpoint
CREATE INDEX "benchmark_case_decision_category_type_idx" ON "preseason_benchmark_case_decision" USING btree ("category_id","decision_type");--> statement-breakpoint
CREATE INDEX "benchmark_case_decision_tool_id_idx" ON "preseason_benchmark_case_decision" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "benchmark_case_decision_result_id_idx" ON "preseason_benchmark_case_decision" USING btree ("case_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_case_result_run_case_idx" ON "preseason_benchmark_case_result" USING btree ("run_id","case_id");--> statement-breakpoint
CREATE INDEX "benchmark_case_result_run_status_idx" ON "preseason_benchmark_case_result" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "benchmark_case_result_case_id_idx" ON "preseason_benchmark_case_result" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_case_season_prompt_model_idx" ON "preseason_benchmark_case" USING btree ("season_id","prompt_version_id","model_snapshot_id");--> statement-breakpoint
CREATE INDEX "benchmark_model_snapshot_llm_id_idx" ON "preseason_benchmark_model_snapshot" USING btree ("llm_id");--> statement-breakpoint
CREATE INDEX "benchmark_model_weight_config_slug_idx" ON "preseason_benchmark_model_weight_config" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_pvc_version_category_idx" ON "preseason_benchmark_prompt_version_category" USING btree ("prompt_version_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_prompt_version_prompt_version_idx" ON "preseason_benchmark_prompt_version" USING btree ("prompt_id","version");--> statement-breakpoint
CREATE INDEX "benchmark_prompt_version_prompt_id_idx" ON "preseason_benchmark_prompt_version" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "benchmark_protocol_slug_idx" ON "preseason_benchmark_protocol" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_run_season_date_idx" ON "preseason_benchmark_run" USING btree ("season_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "benchmark_run_season_status_idx" ON "preseason_benchmark_run" USING btree ("season_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_season_model_idx" ON "preseason_benchmark_season_model" USING btree ("season_id","model_snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_season_prompt_idx" ON "preseason_benchmark_season_prompt" USING btree ("season_id","prompt_version_id");--> statement-breakpoint
CREATE INDEX "benchmark_season_slug_idx" ON "preseason_benchmark_season" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tool_alias_tool_id_idx" ON "preseason_tool_alias" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "tool_candidate_status_idx" ON "preseason_tool_candidate" USING btree ("status");