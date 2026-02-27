CREATE TYPE "public"."comment_target" AS ENUM('recommendation', 'match', 'tool');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('active', 'settled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."parse_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'provider', 'critic', 'user');--> statement-breakpoint
CREATE TABLE "preseason_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"user_id" uuid NOT NULL,
	"title" varchar(255),
	"expertise_areas" text[],
	"excluded_categories" text[],
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "preseason_critic_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "preseason_llm" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"provider" varchar(100) NOT NULL,
	"model_id" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "preseason_llm_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "preseason_match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_a_id" uuid NOT NULL,
	"tool_b_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"status" "match_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"period_start" date NOT NULL,
	"period_end" date,
	"tool_a_score" integer DEFAULT 0 NOT NULL,
	"tool_b_score" integer DEFAULT 0 NOT NULL,
	"total_prompts" integer DEFAULT 0 NOT NULL,
	"winner_tool_id" uuid
);
--> statement-breakpoint
CREATE TABLE "preseason_prompt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"description" text,
	"expected_categories" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "preseason_prompt_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "preseason_recommendation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_result_id" uuid NOT NULL,
	"tool_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"confidence" real,
	"reasoning" text,
	"rank" integer,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preseason_run_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"llm_id" uuid NOT NULL,
	"raw_response" text,
	"parse_status" "parse_status" DEFAULT 'pending' NOT NULL,
	"eval_score" real,
	"eval_details" jsonb,
	"response_time_ms" integer,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preseason_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"trigger" varchar(50) DEFAULT 'cron' NOT NULL,
	"prompt_count" integer,
	"llm_count" integer,
	"error_log" text,
	"createdAt" timestamp with time zone NOT NULL
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
	"aliases" text[],
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
ALTER TABLE "preseason_comment" ADD CONSTRAINT "preseason_comment_critic_id_preseason_critic_profile_id_fk" FOREIGN KEY ("critic_id") REFERENCES "public"."preseason_critic_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_critic_profile" ADD CONSTRAINT "preseason_critic_profile_user_id_preseason_user_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."preseason_user_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_critic_profile" ADD CONSTRAINT "preseason_critic_profile_verified_by_preseason_user_profile_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."preseason_user_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match" ADD CONSTRAINT "preseason_match_tool_a_id_preseason_tool_id_fk" FOREIGN KEY ("tool_a_id") REFERENCES "public"."preseason_tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match" ADD CONSTRAINT "preseason_match_tool_b_id_preseason_tool_id_fk" FOREIGN KEY ("tool_b_id") REFERENCES "public"."preseason_tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match" ADD CONSTRAINT "preseason_match_category_id_preseason_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."preseason_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_match" ADD CONSTRAINT "preseason_match_winner_tool_id_preseason_tool_id_fk" FOREIGN KEY ("winner_tool_id") REFERENCES "public"."preseason_tool"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_recommendation" ADD CONSTRAINT "preseason_recommendation_run_result_id_preseason_run_result_id_fk" FOREIGN KEY ("run_result_id") REFERENCES "public"."preseason_run_result"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_recommendation" ADD CONSTRAINT "preseason_recommendation_tool_id_preseason_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."preseason_tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_recommendation" ADD CONSTRAINT "preseason_recommendation_category_id_preseason_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."preseason_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_run_result" ADD CONSTRAINT "preseason_run_result_run_id_preseason_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."preseason_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_run_result" ADD CONSTRAINT "preseason_run_result_prompt_id_preseason_prompt_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."preseason_prompt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_run_result" ADD CONSTRAINT "preseason_run_result_llm_id_preseason_llm_id_fk" FOREIGN KEY ("llm_id") REFERENCES "public"."preseason_llm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_tool_category" ADD CONSTRAINT "preseason_tool_category_tool_id_preseason_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."preseason_tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_tool_category" ADD CONSTRAINT "preseason_tool_category_category_id_preseason_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."preseason_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preseason_tool" ADD CONSTRAINT "preseason_tool_provider_user_id_preseason_user_profile_id_fk" FOREIGN KEY ("provider_user_id") REFERENCES "public"."preseason_user_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_slug_idx" ON "preseason_category" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "category_display_order_idx" ON "preseason_category" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "comment_target_idx" ON "preseason_comment" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "comment_critic_id_idx" ON "preseason_comment" USING btree ("critic_id");--> statement-breakpoint
CREATE INDEX "critic_profile_user_id_idx" ON "preseason_critic_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "llm_slug_idx" ON "preseason_llm" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "llm_is_active_idx" ON "preseason_llm" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "match_tools_category_period_idx" ON "preseason_match" USING btree ("tool_a_id","tool_b_id","category_id","period_start");--> statement-breakpoint
CREATE INDEX "match_status_idx" ON "preseason_match" USING btree ("status");--> statement-breakpoint
CREATE INDEX "match_category_id_idx" ON "preseason_match" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "prompt_slug_idx" ON "preseason_prompt" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "prompt_is_active_idx" ON "preseason_prompt" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "recommendation_tool_category_idx" ON "preseason_recommendation" USING btree ("tool_id","category_id");--> statement-breakpoint
CREATE INDEX "recommendation_run_result_id_idx" ON "preseason_recommendation" USING btree ("run_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_result_run_prompt_llm_idx" ON "preseason_run_result" USING btree ("run_id","prompt_id","llm_id");--> statement-breakpoint
CREATE INDEX "run_result_run_id_idx" ON "preseason_run_result" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_status_idx" ON "preseason_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "run_created_at_idx" ON "preseason_run" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_category_tool_category_idx" ON "preseason_tool_category" USING btree ("tool_id","category_id");--> statement-breakpoint
CREATE INDEX "tool_slug_idx" ON "preseason_tool" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tool_provider_user_id_idx" ON "preseason_tool" USING btree ("provider_user_id");--> statement-breakpoint
CREATE INDEX "user_profile_email_idx" ON "preseason_user_profile" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_profile_role_idx" ON "preseason_user_profile" USING btree ("role");