CREATE TABLE "magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "magic_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX "idx_magic_links_token_unused" ON "magic_links" ("token") WHERE "used_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_magic_links_email_recent" ON "magic_links" ("email", "created_at" DESC);
