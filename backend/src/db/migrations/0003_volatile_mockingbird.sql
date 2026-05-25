CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" text NOT NULL,
	"parent_id" uuid,
	"llm_history" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_message_id" uuid,
	"joined_at" timestamp with time zone NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text,
	"context_tokens" integer DEFAULT 0,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"content" text NOT NULL,
	"send_time" timestamp with time zone NOT NULL,
	"phase_id" uuid,
	"caused_by" uuid
);
--> statement-breakpoint
CREATE TABLE "phase_summaries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"phase_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"agents" text,
	"conflicts" integer DEFAULT 0 NOT NULL,
	"decisions" integer DEFAULT 0 NOT NULL,
	"open_questions" integer DEFAULT 0 NOT NULL,
	"created_by_agent_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "workflow_phases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"summary_message_id" uuid,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_summaries" ADD CONSTRAINT "phase_summaries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_summaries" ADD CONSTRAINT "phase_summaries_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_summaries" ADD CONSTRAINT "phase_summaries_phase_id_workflow_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."workflow_phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_phases" ADD CONSTRAINT "workflow_phases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_phases" ADD CONSTRAINT "workflow_phases_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_workspace_idx" ON "agents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agents_parent_idx" ON "agents" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "files_workspace_created_idx" ON "files" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "group_members_last_read_idx" ON "group_members" USING btree ("last_read_message_id");--> statement-breakpoint
CREATE INDEX "groups_workspace_idx" ON "groups" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "messages_group_send_time_idx" ON "messages" USING btree ("group_id","send_time");--> statement-breakpoint
CREATE INDEX "messages_workspace_send_time_idx" ON "messages" USING btree ("workspace_id","send_time");--> statement-breakpoint
CREATE INDEX "messages_sender_idx" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "messages_phase_idx" ON "messages" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "messages_caused_by_idx" ON "messages" USING btree ("caused_by");--> statement-breakpoint
CREATE INDEX "phase_summaries_group_idx" ON "phase_summaries" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "phase_summaries_phase_idx" ON "phase_summaries" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "workflow_phases_group_status_idx" ON "workflow_phases" USING btree ("group_id","status");--> statement-breakpoint
CREATE INDEX "workflow_phases_workspace_idx" ON "workflow_phases" USING btree ("workspace_id");