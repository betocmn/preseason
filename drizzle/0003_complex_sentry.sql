CREATE TABLE "preseason_contact_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contact_message_created_at_idx" ON "preseason_contact_message" USING btree ("createdAt");