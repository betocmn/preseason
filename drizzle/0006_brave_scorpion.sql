CREATE TABLE "wine_fair_favorite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wine_id" uuid NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "favorite_user_id_wine_id_unique" UNIQUE("user_id","wine_id")
);
--> statement-breakpoint
CREATE TABLE "wine_fair_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wine_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"notes" text,
	"voice_note_url" varchar(512),
	"color_rating" integer,
	"aroma_rating" integer,
	"acidity_rating" integer,
	"tannins_rating" integer,
	"body_rating" integer,
	"flavor_rating" integer,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone,
	CONSTRAINT "review_user_id_wine_id_unique" UNIQUE("user_id","wine_id")
);
--> statement-breakpoint
ALTER TABLE "wine_fair_favorite" ADD CONSTRAINT "wine_fair_favorite_user_id_wine_fair_user_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."wine_fair_user_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_fair_favorite" ADD CONSTRAINT "wine_fair_favorite_wine_id_wine_fair_wine_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."wine_fair_wine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_fair_review" ADD CONSTRAINT "wine_fair_review_user_id_wine_fair_user_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."wine_fair_user_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_fair_review" ADD CONSTRAINT "wine_fair_review_wine_id_wine_fair_wine_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."wine_fair_wine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorite_user_id_idx" ON "wine_fair_favorite" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "favorite_wine_id_idx" ON "wine_fair_favorite" USING btree ("wine_id");--> statement-breakpoint
CREATE INDEX "review_user_id_idx" ON "wine_fair_review" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "review_wine_id_idx" ON "wine_fair_review" USING btree ("wine_id");--> statement-breakpoint
CREATE INDEX "review_rating_idx" ON "wine_fair_review" USING btree ("rating");