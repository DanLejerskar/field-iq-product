CREATE TABLE "procedure_snapshot_exemplars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid NOT NULL,
	"angle" text NOT NULL,
	"s3_key" text NOT NULL,
	"sha256" char(64) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procedure_snapshot_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"verification_prompt" text NOT NULL,
	"expected_state_text" text NOT NULL,
	"safety_level" text NOT NULL,
	"interaction_type" text,
	"component_label" text,
	"prompt_hash" text NOT NULL,
	"duration_sec" integer
);
--> statement-breakpoint
CREATE TABLE "procedure_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"genesis_project_id" text NOT NULL,
	"genesis_procedure_id" text NOT NULL,
	"title" text NOT NULL,
	"source_version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_by" uuid
);
--> statement-breakpoint
CREATE TABLE "result_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "upload_claims" (
	"session_id" uuid NOT NULL,
	"upload_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_claims_session_id_upload_id_pk" PRIMARY KEY("session_id","upload_id")
);
--> statement-breakpoint
ALTER TABLE "procedure_snapshot_exemplars" ADD CONSTRAINT "procedure_snapshot_exemplars_step_id_procedure_snapshot_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."procedure_snapshot_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_snapshot_steps" ADD CONSTRAINT "procedure_snapshot_steps_snapshot_id_procedure_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."procedure_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_outbox" ADD CONSTRAINT "result_outbox_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "procedure_snapshot_exemplars_step_idx" ON "procedure_snapshot_exemplars" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "procedure_snapshot_steps_snapshot_idx" ON "procedure_snapshot_steps" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "procedure_snapshots_procedure_idx" ON "procedure_snapshots" USING btree ("genesis_procedure_id");--> statement-breakpoint
CREATE INDEX "result_outbox_pending_idx" ON "result_outbox" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "upload_claims_created_at_idx" ON "upload_claims" USING btree ("created_at");