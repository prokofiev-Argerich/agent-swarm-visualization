ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "phase_id" uuid;

CREATE TABLE IF NOT EXISTS "workflow_phases" (
    "id" uuid PRIMARY KEY NOT NULL,
    "workspace_id" uuid NOT NULL,
    "group_id" uuid NOT NULL,
    "name" text NOT NULL,
    "type" text NOT NULL,
    "status" text NOT NULL DEFAULT 'active',
    "started_at" timestamp with time zone NOT NULL,
    "ended_at" timestamp with time zone,
    "summary_message_id" uuid,
    "metadata" text
);

CREATE TABLE IF NOT EXISTS "phase_summaries" (
    "id" uuid PRIMARY KEY NOT NULL,
    "workspace_id" uuid NOT NULL,
    "group_id" uuid NOT NULL,
    "phase_id" uuid NOT NULL,
    "title" text NOT NULL,
    "summary" text NOT NULL,
    "message_count" integer NOT NULL DEFAULT 0,
    "agents" text,
    "conflicts" integer NOT NULL DEFAULT 0,
    "decisions" integer NOT NULL DEFAULT 0,
    "open_questions" integer NOT NULL DEFAULT 0,
    "created_by_agent_id" uuid NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "metadata" text
);

DO $$ BEGIN
 ALTER TABLE "workflow_phases" ADD CONSTRAINT "workflow_phases_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "workflow_phases" ADD CONSTRAINT "workflow_phases_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "phase_summaries" ADD CONSTRAINT "phase_summaries_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "phase_summaries" ADD CONSTRAINT "phase_summaries_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "phase_summaries" ADD CONSTRAINT "phase_summaries_phase_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."workflow_phases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
