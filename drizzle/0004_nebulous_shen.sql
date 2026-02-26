CREATE TABLE "wine_fair_fair_producer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fair_id" uuid NOT NULL,
	"producer_id" uuid NOT NULL,
	"booth_number" varchar(20),
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "fair_producer_fair_id_producer_id_unique" UNIQUE("fair_id","producer_id")
);
--> statement-breakpoint
CREATE TABLE "wine_fair_fair_wine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fair_id" uuid NOT NULL,
	"wine_id" uuid NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "fair_wine_fair_id_wine_id_unique" UNIQUE("fair_id","wine_id")
);
--> statement-breakpoint
CREATE TABLE "wine_fair_fair" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"location" varchar(255),
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"image_url" varchar(512),
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "wine_fair_fair_producer" ADD CONSTRAINT "wine_fair_fair_producer_fair_id_wine_fair_fair_id_fk" FOREIGN KEY ("fair_id") REFERENCES "public"."wine_fair_fair"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_fair_fair_producer" ADD CONSTRAINT "wine_fair_fair_producer_producer_id_wine_fair_producer_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."wine_fair_producer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_fair_fair_wine" ADD CONSTRAINT "wine_fair_fair_wine_fair_id_wine_fair_fair_id_fk" FOREIGN KEY ("fair_id") REFERENCES "public"."wine_fair_fair"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_fair_fair_wine" ADD CONSTRAINT "wine_fair_fair_wine_wine_id_wine_fair_wine_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."wine_fair_wine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fair_producer_fair_id_idx" ON "wine_fair_fair_producer" USING btree ("fair_id");--> statement-breakpoint
CREATE INDEX "fair_producer_producer_id_idx" ON "wine_fair_fair_producer" USING btree ("producer_id");--> statement-breakpoint
CREATE INDEX "fair_wine_fair_id_idx" ON "wine_fair_fair_wine" USING btree ("fair_id");--> statement-breakpoint
CREATE INDEX "fair_wine_wine_id_idx" ON "wine_fair_fair_wine" USING btree ("wine_id");--> statement-breakpoint
CREATE INDEX "fair_name_idx" ON "wine_fair_fair" USING btree ("name");--> statement-breakpoint
CREATE INDEX "fair_is_active_idx" ON "wine_fair_fair" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "fair_start_date_idx" ON "wine_fair_fair" USING btree ("start_date");