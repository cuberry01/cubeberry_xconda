CREATE TABLE "contents" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"row_number" integer DEFAULT 0 NOT NULL,
	"subject" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"recipients" text DEFAULT '' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"raw_schedule" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"in_sheet" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contents_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "send_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_id" integer,
	"subject" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"status" text NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"sheet_url" text DEFAULT '' NOT NULL,
	"subscribers_sheet_url" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"default_send_time" text DEFAULT '09:00' NOT NULL,
	"send_days" text DEFAULT '1,2,3,4,5' NOT NULL,
	"from_name" text DEFAULT '뉴스레터' NOT NULL,
	"test_email" text DEFAULT '' NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"last_queue_sent_date" text,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"last_tick_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscribers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "send_logs" ENABLE ROW LEVEL SECURITY;
