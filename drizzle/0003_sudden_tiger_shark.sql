CREATE TYPE "public"."wine_type" AS ENUM('white', 'red', 'rose', 'orange', 'sparkling', 'dessert');--> statement-breakpoint
CREATE TABLE "wine_fair_producer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"region" varchar(255),
	"description" text,
	"website" varchar(255),
	"image_url" varchar(512),
	"user_id" uuid,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wine_fair_wine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"vintage" integer,
	"type" "wine_type" NOT NULL,
	"grape_variety" varchar(255),
	"alcohol_percent" real,
	"region" varchar(255),
	"description" text,
	"image_url" varchar(512),
	"producer_id" uuid NOT NULL,
	"parent_wine_id" uuid,
	"price" numeric(8, 2),
	"fermentation_container" varchar(100),
	"oak_aging" varchar(100),
	"lees_contact" varchar(100),
	"sediment_contact" varchar(100),
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "wine_fair_producer" ADD CONSTRAINT "wine_fair_producer_user_id_wine_fair_user_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."wine_fair_user_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_fair_wine" ADD CONSTRAINT "wine_fair_wine_producer_id_wine_fair_producer_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."wine_fair_producer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_fair_wine" ADD CONSTRAINT "wine_parent_wine_id_fk" FOREIGN KEY ("parent_wine_id") REFERENCES "public"."wine_fair_wine"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "producer_name_idx" ON "wine_fair_producer" USING btree ("name");--> statement-breakpoint
CREATE INDEX "producer_user_id_idx" ON "wine_fair_producer" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wine_producer_id_idx" ON "wine_fair_wine" USING btree ("producer_id");--> statement-breakpoint
CREATE INDEX "wine_type_idx" ON "wine_fair_wine" USING btree ("type");--> statement-breakpoint
CREATE INDEX "wine_region_idx" ON "wine_fair_wine" USING btree ("region");--> statement-breakpoint
CREATE INDEX "wine_name_vintage_idx" ON "wine_fair_wine" USING btree ("name","vintage");--> statement-breakpoint
CREATE INDEX "wine_parent_wine_id_idx" ON "wine_fair_wine" USING btree ("parent_wine_id");