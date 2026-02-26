-- Drop the default first (it references the old enum)
ALTER TABLE "wine_fair_user_profile" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
-- Convert column to text temporarily
ALTER TABLE "public"."wine_fair_user_profile" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
-- Drop the old enum
DROP TYPE "public"."user_role";--> statement-breakpoint
-- Create the new enum with updated values
CREATE TYPE "public"."user_role" AS ENUM('admin', 'producer', 'attendee');--> statement-breakpoint
-- Convert column back to new enum type (mapping old values to new)
ALTER TABLE "public"."wine_fair_user_profile" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING (
  CASE "role"
    WHEN 'external_viewer' THEN 'attendee'
    WHEN 'internal' THEN 'producer'
    ELSE "role"
  END
)::"public"."user_role";--> statement-breakpoint
-- Set the new default
ALTER TABLE "wine_fair_user_profile" ALTER COLUMN "role" SET DEFAULT 'attendee';
