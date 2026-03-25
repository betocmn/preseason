CREATE TYPE "public"."benchmark_mode" AS ENUM('exploration', 'benchmark');--> statement-breakpoint
CREATE TYPE "public"."benchmark_window_type" AS ENUM('run_day', 'trailing_7d', 'trailing_28d', 'season_to_date');--> statement-breakpoint
CREATE TYPE "public"."case_result_status" AS ENUM('pending', 'completed', 'failed', 'invalid_output');--> statement-breakpoint
CREATE TYPE "public"."comment_target" AS ENUM('tool', 'prompt');--> statement-breakpoint
CREATE TYPE "public"."decision_type" AS ENUM('tool', 'none', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."match_batch_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."match_evaluation_status" AS ENUM('pending', 'completed', 'failed', 'invalid_output');--> statement-breakpoint
CREATE TYPE "public"."match_presentation_order" AS ENUM('a_first', 'b_first');--> statement-breakpoint
CREATE TYPE "public"."match_trigger_mode" AS ENUM('manual', 'benchmark_run');--> statement-breakpoint
CREATE TYPE "public"."match_winner_decision" AS ENUM('tool_a', 'tool_b', 'tie', 'abstain');--> statement-breakpoint
CREATE TYPE "public"."model_tier" AS ENUM('frontier', 'mid', 'small');--> statement-breakpoint
CREATE TYPE "public"."prompt_level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."run_status_v2" AS ENUM('pending', 'running', 'completed', 'failed', 'qc_failed', 'published');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('draft', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."tool_candidate_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'provider', 'critic', 'user');--> statement-breakpoint
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
	CONSTRAINT "benchmark_decision_tool_check" CHECK (decision_type != 'tool' OR tool_id IS NOT NULL OR resolution_status = 'unresolved_tool'),
	CONSTRAINT "benchmark_decision_non_tool_no_tool_id" CHECK (decision_type = 'tool' OR tool_id IS NULL)
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_case_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
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
	"company" varchar(255) NOT NULL,
	"model_family" varchar(100) NOT NULL,
	"model_version" varchar(100) NOT NULL,
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
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "benchmark_run_id_season_unique" UNIQUE("id","season_id")
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_season_model" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"model_snapshot_id" uuid NOT NULL,
	CONSTRAINT "benchmark_season_model_unique" UNIQUE("season_id","model_snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "preseason_benchmark_season_prompt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	CONSTRAINT "benchmark_season_prompt_unique" UNIQUE("season_id","prompt_version_id")
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
CREATE TABLE "preseason_category_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"display_order" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "preseason_category_group_name_unique" UNIQUE("name"),
	CONSTRAINT "preseason_category_group_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "preseason_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"critic_id" uuid NOT NULL,
	"target_type" "comment_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "preseason_critic_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255),
	"expertise_areas" text[],
	"excluded_categories" text[],
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "preseason_critic_profile_slug_unique" UNIQUE("slug"),
	CONSTRAINT "preseason_critic_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "preseason_llm" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"provider" varchar(100) NOT NULL,
	"company" varchar(255) NOT NULL,
	"model_family" varchar(100) NOT NULL,
	"model_version" varchar(100) NOT NULL,
	"model_id" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "preseason_llm_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
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
	CONSTRAINT "match_batch_id_season_unique" UNIQUE("id","season_id"),
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
	CONSTRAINT "match_config_composite_fk_unique" UNIQUE("id","season_id","category_id","tool_a_id","tool_b_id","prompt_template_id"),
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
CREATE TABLE "preseason_prompt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"level" "prompt_level" DEFAULT 'beginner' NOT NULL,
	"description" text,
	"expected_categories" text[],
	"content_md" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "preseason_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_group_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"display_order" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "preseason_category_name_unique" UNIQUE("name"),
	CONSTRAINT "preseason_category_slug_unique" UNIQUE("slug")
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
CREATE TABLE "preseason_tool_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preseason_tool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"website" varchar(512),
	"logo_url" varchar(512),
	"is_verified" boolean DEFAULT false NOT NULL,
	"provider_user_id" uuid,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "preseason_tool_name_unique" UNIQUE("name"),
	CONSTRAINT "preseason_tool_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "preseason_user_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(150) NOT NULL,
	"avatar_url" varchar(512),
	"bio" text,
	"company" varchar(255),
	"website" varchar(255),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "preseason_user_profile_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_decision" ADD CONSTRAINT "preseason_benchmark_case_decision_case_result_id_preseason_benchmark_case_result_id_fk" FOREIGN KEY ("case_result_id") REFERENCES "public"."preseason_benchmark_case_result"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_decision" ADD CONSTRAINT "preseason_benchmark_case_decision_category_id_preseason_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."preseason_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_decision" ADD CONSTRAINT "preseason_benchmark_case_decision_tool_id_preseason_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."preseason_tool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_result" ADD CONSTRAINT "preseason_benchmark_case_result_season_id_preseason_benchmark_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."preseason_benchmark_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_result" ADD CONSTRAINT "preseason_benchmark_case_result_run_id_preseason_benchmark_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."preseason_benchmark_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case_result" ADD CONSTRAINT "preseason_benchmark_case_result_case_id_preseason_benchmark_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."preseason_benchmark_case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case" ADD CONSTRAINT "preseason_benchmark_case_season_id_preseason_benchmark_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."preseason_benchmark_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case" ADD CONSTRAINT "preseason_benchmark_case_prompt_version_id_preseason_benchmark_prompt_version_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."preseason_benchmark_prompt_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case" ADD CONSTRAINT "preseason_benchmark_case_model_snapshot_id_preseason_benchmark_model_snapshot_id_fk" FOREIGN KEY ("model_snapshot_id") REFERENCES "public"."preseason_benchmark_model_snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case" ADD CONSTRAINT "benchmark_case_season_prompt_fk" FOREIGN KEY ("season_id","prompt_version_id") REFERENCES "public"."preseason_benchmark_season_prompt"("season_id","prompt_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_benchmark_case" ADD CONSTRAINT "benchmark_case_season_model_fk" FOREIGN KEY ("season_id","model_snapshot_id") REFERENCES "public"."preseason_benchmark_season_model"("season_id","model_snapshot_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "preseason_comment" ADD CONSTRAINT "preseason_comment_critic_id_preseason_critic_profile_id_fk" FOREIGN KEY ("critic_id") REFERENCES "public"."preseason_critic_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_critic_profile" ADD CONSTRAINT "preseason_critic_profile_user_id_preseason_user_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."preseason_user_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_critic_profile" ADD CONSTRAINT "critic_verified_by_user_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."preseason_user_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "preseason_match_evaluation" ADD CONSTRAINT "match_evaluation_season_model_fk" FOREIGN KEY ("season_id","model_snapshot_id") REFERENCES "public"."preseason_benchmark_season_model"("season_id","model_snapshot_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_category" ADD CONSTRAINT "preseason_category_category_group_id_preseason_category_group_id_fk" FOREIGN KEY ("category_group_id") REFERENCES "public"."preseason_category_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_tool_alias" ADD CONSTRAINT "preseason_tool_alias_tool_id_preseason_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."preseason_tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_tool_candidate" ADD CONSTRAINT "preseason_tool_candidate_suggested_category_id_preseason_category_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."preseason_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_tool_candidate" ADD CONSTRAINT "preseason_tool_candidate_approved_tool_id_preseason_tool_id_fk" FOREIGN KEY ("approved_tool_id") REFERENCES "public"."preseason_tool"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_tool_category" ADD CONSTRAINT "preseason_tool_category_tool_id_preseason_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."preseason_tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_tool_category" ADD CONSTRAINT "preseason_tool_category_category_id_preseason_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."preseason_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_tool" ADD CONSTRAINT "preseason_tool_provider_user_id_preseason_user_profile_id_fk" FOREIGN KEY ("provider_user_id") REFERENCES "public"."preseason_user_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_case_decision_result_category_idx" ON "preseason_benchmark_case_decision" USING btree ("case_result_id","category_id");--> statement-breakpoint
CREATE INDEX "benchmark_case_decision_category_type_idx" ON "preseason_benchmark_case_decision" USING btree ("category_id","decision_type");--> statement-breakpoint
CREATE INDEX "benchmark_case_decision_tool_id_idx" ON "preseason_benchmark_case_decision" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "benchmark_case_decision_result_id_idx" ON "preseason_benchmark_case_decision" USING btree ("case_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_case_result_run_case_idx" ON "preseason_benchmark_case_result" USING btree ("run_id","case_id");--> statement-breakpoint
CREATE INDEX "benchmark_case_result_run_status_idx" ON "preseason_benchmark_case_result" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "benchmark_case_result_case_id_idx" ON "preseason_benchmark_case_result" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "benchmark_case_result_season_id_idx" ON "preseason_benchmark_case_result" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_case_season_prompt_model_idx" ON "preseason_benchmark_case" USING btree ("season_id","prompt_version_id","model_snapshot_id");--> statement-breakpoint
CREATE INDEX "benchmark_model_snapshot_llm_id_idx" ON "preseason_benchmark_model_snapshot" USING btree ("llm_id");--> statement-breakpoint
CREATE INDEX "benchmark_model_weight_config_slug_idx" ON "preseason_benchmark_model_weight_config" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_model_weight_config_one_active_idx" ON "preseason_benchmark_model_weight_config" USING btree ("is_active") WHERE is_active = true;--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_pvc_version_category_idx" ON "preseason_benchmark_prompt_version_category" USING btree ("prompt_version_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_prompt_version_prompt_version_idx" ON "preseason_benchmark_prompt_version" USING btree ("prompt_id","version");--> statement-breakpoint
CREATE INDEX "benchmark_prompt_version_prompt_id_idx" ON "preseason_benchmark_prompt_version" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "benchmark_protocol_slug_idx" ON "preseason_benchmark_protocol" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_run_season_date_idx" ON "preseason_benchmark_run" USING btree ("season_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "benchmark_run_season_status_idx" ON "preseason_benchmark_run" USING btree ("season_id","status");--> statement-breakpoint
CREATE INDEX "benchmark_season_slug_idx" ON "preseason_benchmark_season" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "category_group_slug_idx" ON "preseason_category_group" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "category_group_display_order_idx" ON "preseason_category_group" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "comment_target_idx" ON "preseason_comment" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "comment_critic_id_idx" ON "preseason_comment" USING btree ("critic_id");--> statement-breakpoint
CREATE INDEX "critic_profile_slug_idx" ON "preseason_critic_profile" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "critic_profile_user_id_idx" ON "preseason_critic_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "llm_slug_idx" ON "preseason_llm" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "llm_is_active_idx" ON "preseason_llm" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "match_batch_idempotency_key_idx" ON "preseason_match_batch" USING btree ("idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "match_batch_status_heartbeat_idx" ON "preseason_match_batch" USING btree ("status","last_heartbeat_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_config_active_matchup_idx" ON "preseason_match_config" USING btree ("season_id","category_id","tool_a_id","tool_b_id") WHERE is_active = true;--> statement-breakpoint
CREATE UNIQUE INDEX "match_evaluation_batch_model_order_idx" ON "preseason_match_evaluation" USING btree ("batch_id","model_snapshot_id","presentation_order");--> statement-breakpoint
CREATE UNIQUE INDEX "match_prompt_template_one_active_idx" ON "preseason_match_prompt_template" USING btree ("is_active") WHERE is_active = true;--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_slug_level_idx" ON "preseason_prompt" USING btree ("slug","level");--> statement-breakpoint
CREATE INDEX "prompt_is_active_idx" ON "preseason_prompt" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "category_slug_idx" ON "preseason_category" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "category_display_order_idx" ON "preseason_category" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "category_group_id_idx" ON "preseason_category" USING btree ("category_group_id");--> statement-breakpoint
CREATE INDEX "tool_alias_tool_id_idx" ON "preseason_tool_alias" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "tool_candidate_status_idx" ON "preseason_tool_candidate" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_category_tool_category_idx" ON "preseason_tool_category" USING btree ("tool_id","category_id");--> statement-breakpoint
CREATE INDEX "tool_slug_idx" ON "preseason_tool" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tool_provider_user_id_idx" ON "preseason_tool" USING btree ("provider_user_id");--> statement-breakpoint
CREATE INDEX "user_profile_email_idx" ON "preseason_user_profile" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_profile_role_idx" ON "preseason_user_profile" USING btree ("role");