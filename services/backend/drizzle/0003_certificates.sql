CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"cert_id" text NOT NULL,
	"cert_url" text NOT NULL,
	"cert_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"storage_backend" text NOT NULL,
	"storage_key" text NOT NULL,
	CONSTRAINT "certificates_cert_id_unique" UNIQUE("cert_id"),
	CONSTRAINT "certificates_storage_backend_check" CHECK ("storage_backend" IN ('supabase', 'local'))
);
--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_certificates_session" ON "certificates" ("session_id");
