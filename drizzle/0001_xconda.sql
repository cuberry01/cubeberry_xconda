CREATE TABLE "x_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"feed_url" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_guid" text DEFAULT '' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "source" text DEFAULT 'sheet' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "x_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "x_notion_database_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "x_rsshub_base" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "x_auto_publish" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "x_email_on_publish" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "x_max_age_days" integer DEFAULT 14 NOT NULL;