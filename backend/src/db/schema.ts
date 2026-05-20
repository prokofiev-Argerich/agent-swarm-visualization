import { integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  role: text("role").notNull(),
  parentId: uuid("parent_id"),
  llmHistory: text("llm_history").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  name: text("name"),
  contextTokens: integer("context_tokens").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    userId: uuid("user_id").notNull(),
    lastReadMessageId: uuid("last_read_message_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.userId] }),
  })
);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id),
  senderId: uuid("sender_id").notNull(),
  contentType: text("content_type").notNull(),
  content: text("content").notNull(),
  sendTime: timestamp("send_time", { withTimezone: true }).notNull(),
  phaseId: uuid("phase_id"),
});

export const workflowPhases = pgTable("workflow_phases", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  summaryMessageId: uuid("summary_message_id"),
  metadata: text("metadata"),
});

export const phaseSummaries = pgTable("phase_summaries", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id),
  phaseId: uuid("phase_id")
    .notNull()
    .references(() => workflowPhases.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  messageCount: integer("message_count").notNull().default(0),
  agents: text("agents"),
  conflicts: integer("conflicts").notNull().default(0),
  decisions: integer("decisions").notNull().default(0),
  openQuestions: integer("open_questions").notNull().default(0),
  createdByAgentId: uuid("created_by_agent_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  metadata: text("metadata"),
});

export const files = pgTable("files", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

