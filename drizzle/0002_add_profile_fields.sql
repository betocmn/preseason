-- Add new profile fields: first_name, last_name, birth_date
-- Remove display_name column

-- Add new columns (allowing NULL temporarily for existing rows)
ALTER TABLE "wine_fair_user_profile" ADD COLUMN "first_name" varchar(100);--> statement-breakpoint
ALTER TABLE "wine_fair_user_profile" ADD COLUMN "last_name" varchar(100);--> statement-breakpoint
ALTER TABLE "wine_fair_user_profile" ADD COLUMN "birth_date" date;--> statement-breakpoint

-- Update existing rows with default values (if any exist)
UPDATE "wine_fair_user_profile" SET
  "first_name" = COALESCE(split_part("display_name", ' ', 1), 'Unknown'),
  "last_name" = COALESCE(NULLIF(split_part("display_name", ' ', 2), ''), 'User'),
  "birth_date" = '1990-01-01'
WHERE "first_name" IS NULL;--> statement-breakpoint

-- Make columns NOT NULL
ALTER TABLE "wine_fair_user_profile" ALTER COLUMN "first_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wine_fair_user_profile" ALTER COLUMN "last_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wine_fair_user_profile" ALTER COLUMN "birth_date" SET NOT NULL;--> statement-breakpoint

-- Drop the old display_name column
ALTER TABLE "wine_fair_user_profile" DROP COLUMN "display_name";
