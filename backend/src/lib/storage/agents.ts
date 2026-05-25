import { and, desc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, groups, groupMembers, messages } from "@/db/schema";
import { initialAgentHistory, now, uuid, type UUID } from "./shared";
export async function createAgent(input: {
  workspaceId: UUID;
  role: string;
  parentId?: UUID | null;
  llmHistory?: string;
  guidance?: string;
}) {
  const db = getDb();
  const agentId = uuid();
  const createdAt = now();

  const workspace = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.workspaceId, input.workspaceId))
    .limit(1);
  if (workspace.length === 0) throw new Error("workspace not found");

  await db.insert(agents).values({
    id: agentId,
    workspaceId: input.workspaceId,
    role: input.role,
    parentId: input.parentId ?? null,
    llmHistory:
      input.llmHistory ??
      initialAgentHistory({
        agentId,
        workspaceId: input.workspaceId,
        role: input.role,
        guidance: input.guidance,
      }),
    createdAt,
  });

  return { id: agentId, role: input.role, createdAt: createdAt.toISOString() };
}

export async function listAgentsMeta(
  input: { workspaceId: UUID }
): Promise<Array<{ id: UUID; role: string; parentId: UUID | null; createdAt: string }>> {
  const db = getDb();
  const rows = await db
    .select({
      id: agents.id,
      role: agents.role,
      parentId: agents.parentId,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .where(eq(agents.workspaceId, input.workspaceId))
    .orderBy(desc(agents.createdAt));

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function getDefaultHumanAgentId(input: { workspaceId: UUID }): Promise<UUID | null> {
  const meta = await listAgentsMeta({ workspaceId: input.workspaceId });
  return meta.find((a) => a.role === "human")?.id ?? null;
}

export async function listAgents(
  input?: { workspaceId?: UUID }
): Promise<Array<{ id: UUID; workspaceId: UUID; role: string; llmHistory: string }>> {
  const db = getDb();
  const rows = await db
    .select({
      id: agents.id,
      workspaceId: agents.workspaceId,
      role: agents.role,
      llmHistory: agents.llmHistory,
    })
    .from(agents)
    .where(input?.workspaceId ? eq(agents.workspaceId, input.workspaceId) : undefined)
    .orderBy(desc(agents.createdAt));

  return rows;
}

export async function getAgent(input: { agentId: UUID }): Promise<{ id: UUID; workspaceId: UUID; role: string; llmHistory: string }> {
  const db = getDb();
  const rows = await db
    .select({ id: agents.id, workspaceId: agents.workspaceId, role: agents.role, llmHistory: agents.llmHistory })
    .from(agents)
    .where(eq(agents.id, input.agentId))
    .limit(1);
  if (rows.length === 0) throw new Error("agent not found");
  return rows[0]!;
}

export async function getAgentRole(input: { agentId: UUID }): Promise<string> {
  const agent = await getAgent(input);
  return agent.role;
}

export async function setAgentHistory(input: { agentId: UUID; llmHistory: string; workspaceId?: UUID }) {
  const db = getDb();
  await db.update(agents).set({ llmHistory: input.llmHistory }).where(eq(agents.id, input.agentId));

  const workspaceId =
    input.workspaceId ??
    (
      await db
        .select({ workspaceId: agents.workspaceId })
        .from(agents)
        .where(eq(agents.id, input.agentId))
        .limit(1)
    )[0]?.workspaceId;
  if (workspaceId) {
  }
}

export async function listUnreadByGroup(input: { agentId: UUID }): Promise<
  Array<{
    groupId: UUID;
    messages: Array<{
      id: UUID;
      senderId: UUID;
      contentType: string;
      content: string;
      sendTime: string;
    }>;
  }>
> {
  const db = getDb();
  const memberships = await db
    .select({ groupId: groupMembers.groupId, lastReadMessageId: groupMembers.lastReadMessageId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, input.agentId));

  const result = [];

  for (const m of memberships) {
    let cutoff = new Date(0);
    if (m.lastReadMessageId) {
      const last = await db
        .select({ sendTime: messages.sendTime })
        .from(messages)
        .where(eq(messages.id, m.lastReadMessageId))
        .limit(1);
      cutoff = last[0]?.sendTime ?? cutoff;
    }

    const rows = await db
      .select({
        id: messages.id,
        senderId: messages.senderId,
        content: messages.content,
        contentType: messages.contentType,
        sendTime: messages.sendTime,
      })
      .from(messages)
      .where(
        and(eq(messages.groupId, m.groupId), gt(messages.sendTime, cutoff), ne(messages.senderId, input.agentId))
      )
      .orderBy(messages.sendTime);

    if (rows.length === 0) continue;

    result.push({
      groupId: m.groupId,
      messages: rows.map((row) => ({ ...row, sendTime: row.sendTime.toISOString() })),
    });
  }

  return result;
}

export async function deleteAgent(input: { agentId: UUID; workspaceId: UUID }) {
  const db = getDb();

  const agent = await db
    .select({ role: agents.role })
    .from(agents)
    .where(eq(agents.id, input.agentId))
    .limit(1);
  if (agent.length === 0) throw new Error("agent not found");
  if (agent[0]!.role === "human") throw new Error("cannot delete human agent");

  await db.transaction(async (tx) => {
    await tx.delete(groupMembers).where(eq(groupMembers.userId, input.agentId));
    await tx.delete(agents).where(eq(agents.id, input.agentId));
  });
}
