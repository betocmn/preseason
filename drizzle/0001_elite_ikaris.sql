ALTER TABLE "preseason_tool_candidate" ADD COLUMN "ai_suggested_tool_id" uuid;--> statement-breakpoint
ALTER TABLE "preseason_tool_candidate" ADD COLUMN "ai_review_confidence" real;--> statement-breakpoint
ALTER TABLE "preseason_tool_candidate" ADD COLUMN "ai_review_reason" text;--> statement-breakpoint
ALTER TABLE "preseason_tool_candidate" ADD COLUMN "ai_review_error" text;--> statement-breakpoint
ALTER TABLE "preseason_tool_candidate" ADD COLUMN "ai_review_model" varchar(255);--> statement-breakpoint
ALTER TABLE "preseason_tool_candidate" ADD COLUMN "ai_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "preseason_tool_candidate" ADD CONSTRAINT "preseason_tool_candidate_ai_suggested_tool_id_preseason_tool_id_fk" FOREIGN KEY ("ai_suggested_tool_id") REFERENCES "public"."preseason_tool"("id") ON DELETE set null ON UPDATE no action;