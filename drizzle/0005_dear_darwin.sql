CREATE TABLE "wine_fair_grape_variety" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "wine_fair_grape_variety_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "wine_fair_region" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"country" varchar(255),
	"description" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "wine_fair_region_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "wine_fair_wine_grape_variety" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wine_id" uuid NOT NULL,
	"grape_variety_id" uuid NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "wine_grape_variety_wine_id_grape_variety_id_unique" UNIQUE("wine_id","grape_variety_id")
);
--> statement-breakpoint
DROP INDEX "wine_region_idx";--> statement-breakpoint
ALTER TABLE "wine_fair_producer" ADD COLUMN "region_id" uuid;--> statement-breakpoint
ALTER TABLE "wine_fair_wine" ADD COLUMN "region_id" uuid;--> statement-breakpoint
ALTER TABLE "wine_fair_wine" ADD COLUMN "one_liner" varchar(280);--> statement-breakpoint
ALTER TABLE "wine_fair_wine_grape_variety" ADD CONSTRAINT "wine_fair_wine_grape_variety_wine_id_wine_fair_wine_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."wine_fair_wine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_fair_wine_grape_variety" ADD CONSTRAINT "wine_fair_wine_grape_variety_grape_variety_id_wine_fair_grape_variety_id_fk" FOREIGN KEY ("grape_variety_id") REFERENCES "public"."wine_fair_grape_variety"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grape_variety_name_idx" ON "wine_fair_grape_variety" USING btree ("name");--> statement-breakpoint
CREATE INDEX "region_name_idx" ON "wine_fair_region" USING btree ("name");--> statement-breakpoint
CREATE INDEX "wine_grape_variety_wine_id_idx" ON "wine_fair_wine_grape_variety" USING btree ("wine_id");--> statement-breakpoint
CREATE INDEX "wine_grape_variety_grape_variety_id_idx" ON "wine_fair_wine_grape_variety" USING btree ("grape_variety_id");--> statement-breakpoint
ALTER TABLE "wine_fair_producer" ADD CONSTRAINT "wine_fair_producer_region_id_wine_fair_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."wine_fair_region"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_fair_wine" ADD CONSTRAINT "wine_fair_wine_region_id_wine_fair_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."wine_fair_region"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "producer_region_id_idx" ON "wine_fair_producer" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "wine_region_id_idx" ON "wine_fair_wine" USING btree ("region_id");--> statement-breakpoint
ALTER TABLE "wine_fair_producer" DROP COLUMN "region";--> statement-breakpoint
ALTER TABLE "wine_fair_wine" DROP COLUMN "grape_variety";--> statement-breakpoint
ALTER TABLE "wine_fair_wine" DROP COLUMN "region";