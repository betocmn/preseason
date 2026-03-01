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
ALTER TABLE "preseason_category" ADD COLUMN "category_group_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "category_group_slug_idx" ON "preseason_category_group" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "category_group_display_order_idx" ON "preseason_category_group" USING btree ("display_order");--> statement-breakpoint
ALTER TABLE "preseason_category" ADD CONSTRAINT "preseason_category_category_group_id_preseason_category_group_id_fk" FOREIGN KEY ("category_group_id") REFERENCES "public"."preseason_category_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_group_id_idx" ON "preseason_category" USING btree ("category_group_id");