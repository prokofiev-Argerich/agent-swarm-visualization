import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { groups, phaseSummaries, workflowPhases } from "@/db/schema";
import { now, uuid, withSchemaRetry, type UUID } from "./shared";

export async function createWorkflowPhase(input: {
  groupId: UUID;
  name: string;
  type: string;
  metadata?: Record<string, unknown>;
}) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const g = await db
      .select({ workspaceId: groups.workspaceId })
      .from(groups)
      .where(eq(groups.id, input.groupId))
      .limit(1);
    if (g.length === 0) throw new Error("group not found");

    const id = uuid();
    const startedAt = now();
    await db.insert(workflowPhases).values({
      id,
      workspaceId: g[0]!.workspaceId,
      groupId: input.groupId,
      name: input.name,
      type: input.type,
      status: "active",
      startedAt,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });

    return { id, startedAt: startedAt.toISOString() };
  });
}

export async function getActiveWorkflowPhase(input: { groupId: UUID }) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(workflowPhases)
      .where(
        and(
          eq(workflowPhases.groupId, input.groupId),
          eq(workflowPhases.status, "active")
        )
      )
      .orderBy(desc(workflowPhases.startedAt))
      .limit(1);

    if (rows.length === 0) return null;
    const p = rows[0]!;
    return {
      id: p.id,
      groupId: p.groupId,
      name: p.name,
      type: p.type,
      status: p.status,
      startedAt: p.startedAt.toISOString(),
      endedAt: p.endedAt?.toISOString() ?? null,
      metadata: p.metadata ? (JSON.parse(p.metadata) as Record<string, unknown>) : null,
    };
  });
}

export async function endWorkflowPhase(input: {
  phaseId: UUID;
  status?: string;
  metadata?: Record<string, unknown>;
}) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const endedAt = now();
    await db
      .update(workflowPhases)
      .set({
        status: input.status ?? "completed",
        endedAt,
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      })
      .where(eq(workflowPhases.id, input.phaseId));

    const rows = await db
      .select({ workspaceId: workflowPhases.workspaceId, groupId: workflowPhases.groupId })
      .from(workflowPhases)
      .where(eq(workflowPhases.id, input.phaseId))
      .limit(1);

    return { endedAt: endedAt.toISOString() };
  });
}

export async function listPhaseSummaries(input: { groupId: UUID }) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(phaseSummaries)
      .where(eq(phaseSummaries.groupId, input.groupId))
      .orderBy(desc(phaseSummaries.createdAt));

    return rows.map((s) => ({
      id: s.id,
      workspaceId: s.workspaceId,
      groupId: s.groupId,
      phaseId: s.phaseId,
      title: s.title,
      summary: s.summary,
      messageCount: s.messageCount,
      agents: s.agents ? (JSON.parse(s.agents) as string[]) : [],
      conflicts: s.conflicts,
      decisions: s.decisions,
      openQuestions: s.openQuestions,
      createdByAgentId: s.createdByAgentId,
      createdAt: s.createdAt.toISOString(),
      metadata: s.metadata ? (JSON.parse(s.metadata) as Record<string, unknown>) : null,
    }));
  });
}

export async function createPhaseSummary(input: {
  groupId: UUID;
  phaseId: UUID;
  title: string;
  summary: string;
  messageCount: number;
  agents: string[];
  conflicts: number;
  decisions: number;
  openQuestions: number;
  createdByAgentId: UUID;
  metadata?: Record<string, unknown>;
}) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const gr = await db
      .select({ workspaceId: groups.workspaceId })
      .from(groups)
      .where(eq(groups.id, input.groupId))
      .limit(1);
    if (gr.length === 0) throw new Error("group not found");

    const id = uuid();
    const createdAt = now();
    await db.insert(phaseSummaries).values({
      id,
      workspaceId: gr[0]!.workspaceId,
      groupId: input.groupId,
      phaseId: input.phaseId,
      title: input.title,
      summary: input.summary,
      messageCount: input.messageCount,
      agents: JSON.stringify(input.agents),
      conflicts: input.conflicts,
      decisions: input.decisions,
      openQuestions: input.openQuestions,
      createdByAgentId: input.createdByAgentId,
      createdAt,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });

    return { id, createdAt: createdAt.toISOString() };
  });
}
