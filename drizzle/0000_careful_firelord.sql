CREATE TYPE "public"."user_role" AS ENUM('admin', 'internal', 'external_viewer');--> statement-breakpoint
CREATE TABLE "wine_fair_user_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'external_viewer' NOT NULL,
	"display_name" varchar(255),
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "wine_fair_user_profile_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "user_profile_email_idx" ON "wine_fair_user_profile" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_profile_role_idx" ON "wine_fair_user_profile" USING btree ("role");