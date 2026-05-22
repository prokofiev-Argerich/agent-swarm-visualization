import { and, desc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, groups, groupMembers, messages } from "@/db/schema";
import { emitDbWrite, initialAgentHistory, now, uuid, type UUID } from "./shared";
import { ensureWorkspaceDefaults } from "./workspaces";

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

  await emitDbWrite({
    workspaceId: input.workspaceId,
    table: "agents",
    action: "insert",
    recordId: agentId,
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

export async function createSubAgentWithP2P(input: {
  workspaceId: UUID;
  creatorId: UUID;
  role: string;
  guidance?: string;
  collaborationGroupId?: UUID;
}) {
  const db = getDb();
  const createdAt = now();
  const agentId = uuid();
  const p2pGroupId = uuid();

  const defaults = await ensureWorkspaceDefaults({ workspaceId: input.workspaceId });
  const humanAgentId = defaults.humanAgentId;

  const workspace = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.workspaceId, input.workspaceId))
    .limit(1);
  if (workspace.length === 0) throw new Error("workspace not found");

  await db.transaction(async (tx) => {
    await tx.insert(agents).values({
      id: agentId,
      workspaceId: input.workspaceId,
      role: input.role,
      parentId: input.creatorId,
      llmHistory: initialAgentHistory({
        agentId,
        workspaceId: input.workspaceId,
        role: input.role,
        guidance: input.guidance,
      }),
      createdAt,
    });

    await tx.insert(groups).values({
      id: p2pGroupId,
      workspaceId: input.workspaceId,
      name: input.role,
      createdAt,
    });

    await tx.insert(groupMembers).values([
      {
        groupId: p2pGroupId,
        userId: humanAgentId,
        lastReadMessageId: null,
        joinedAt: createdAt,
      },
      {
        groupId: p2pGroupId,
        userId: agentId,
        lastReadMessageId: null,
        joinedAt: createdAt,
      },
    ]);

    // If collaborationGroupId is provided, add new agent to that group
    if (input.collaborationGroupId) {
      const collabGroup = await tx
        .select({ id: groups.id, workspaceId: groups.workspaceId })
        .from(groups)
        .where(eq(groups.id, input.collaborationGroupId))
        .limit(1);

      if (collabGroup.length > 0 && collabGroup[0]!.workspaceId === input.workspaceId) {
        await tx.insert(groupMembers).values({
          groupId: input.collaborationGroupId,
          userId: agentId,
          lastReadMessageId: null,
          joinedAt: createdAt,
        }).onConflictDoNothing();
      }
    }
  });

  await emitDbWrite({
    workspaceId: input.workspaceId,
    table: "agents",
    action: "insert",
    recordId: agentId,
  });
  await emitDbWrite({
    workspaceId: input.workspaceId,
    table: "groups",
    action: "insert",
    recordId: p2pGroupId,
  });
  await emitDbWrite({
    workspaceId: input.workspaceId,
    table: "group_members",
    action: "insert",
    recordId: p2pGroupId,
  });

  return {
    agentId,
    groupId: p2pGroupId,
    collaborationGroupId: input.collaborationGroupId ?? null,
    createdAt: createdAt.toISOString(),
  };
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
    await emitDbWrite({
      workspaceId,
      table: "agents",
      action: "update",
      recordId: input.agentId,
    });
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

  await emitDbWrite({
    workspaceId: input.workspaceId,
    table: "agents",
    action: "delete",
    recordId: input.agentId,
  });
}

export async function repairWorkspaceAgentMemberships(input: {
  workspaceId: UUID;
  targetGroupId: UUID;
}) {
  const db = getDb();
  const joinedAt = now();

  const allAgents = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.workspaceId, input.workspaceId), ne(agents.role, "human")));

  const agentIds = allAgents.map((a) => a.id);
  if (agentIds.length === 0) return { added: 0, agents: [] as UUID[] };

  const existingMembers = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, input.targetGroupId));
  const existingSet = new Set(existingMembers.map((m) => m.userId));

  const toAdd = agentIds.filter((id) => !existingSet.has(id));
  if (toAdd.length === 0) return { added: 0, agents: [] as UUID[] };

  await db
    .insert(groupMembers)
    .values(
      toAdd.map((userId) => ({
        groupId: input.targetGroupId,
        userId,
        lastReadMessageId: null,
        joinedAt,
      }))
    )
    .onConflictDoNothing();

  return { added: toAdd.length, agents: toAdd };
}
