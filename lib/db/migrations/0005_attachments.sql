CREATE TABLE IF NOT EXISTS "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"file_data" text NOT NULL,
	"uploaded_by" text,
	"uploaded_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_company_entity_idx" ON "attachments" ("company_id","entity_type","entity_id");
