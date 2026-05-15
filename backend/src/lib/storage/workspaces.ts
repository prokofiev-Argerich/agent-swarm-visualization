import { eq, desc, inArray, sql as dsql } from "drizzle-orm";
import { getDb } from "@/db";
import { workspaces, agents, groups, groupMembers, messages, files } from "@/db/schema";
import { emitDbWrite, initialAgentHistory, now, uuid, type UUID } from "./shared";

export async function listWorkspaces(): Promise<Array<{ id: UUID; name: string; createdAt: string }>> {
  const db = getDb();
  const rows = await db
    .select({ id: workspaces.id, name: workspaces.name, createdAt: workspaces.createdAt })
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt));

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function createWorkspaceWithDefaults(input: { name: string }) {
  const db = getDb();
  const workspaceId = uuid();
  const humanAgentId = uuid();
  const assistantAgentId = uuid();
  const defaultGroupId = uuid();
  const createdAt = now();

  await db.transaction(async (tx) => {
    await tx.insert(workspaces).values({
      id: workspaceId,
      name: input.name,
      createdAt,
    });

    await tx.insert(agents).values([
      {
        id: humanAgentId,
        workspaceId,
        role: "human",
        parentId: null,
        llmHistory: initialAgentHistory({
          agentId: humanAgentId,
          workspaceId,
          role: "human",
        }),
        createdAt,
      },
      {
        id: assistantAgentId,
        workspaceId,
        role: "assistant",
        parentId: null,
        llmHistory: initialAgentHistory({
          agentId: assistantAgentId,
          workspaceId,
          role: "assistant",
        }),
        createdAt,
      },
    ]);

    await tx.insert(groups).values({
      id: defaultGroupId,
      workspaceId,
      name: null,
      createdAt,
    });

    await tx.insert(groupMembers).values([
      {
        groupId: defaultGroupId,
        userId: humanAgentId,
        lastReadMessageId: null,
        joinedAt: createdAt,
      },
      {
        groupId: defaultGroupId,
        userId: assistantAgentId,
        lastReadMessageId: null,
        joinedAt: createdAt,
      },
    ]);
  });

  await emitDbWrite({ workspaceId, table: "workspaces", action: "insert", recordId: workspaceId });
  await emitDbWrite({ workspaceId, table: "agents", action: "insert" });
  await emitDbWrite({ workspaceId, table: "groups", action: "insert", recordId: defaultGroupId });
  await emitDbWrite({ workspaceId, table: "group_members", action: "insert" });

  return { workspaceId, humanAgentId, assistantAgentId, defaultGroupId };
}

export async function ensureWorkspaceDefaults(input: { workspaceId: UUID }) {
  const db = getDb();
  const createdAt = now();

  const workspace = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  if (workspace.length === 0) throw new Error("workspace not found");

  let createdHuman = false;
  let createdAssistant = false;
  let createdGroup = false;

  const result = await db.transaction(async (tx) => {
    const existingAgents = await tx
      .select({ id: agents.id, role: agents.role })
      .from(agents)
      .where(eq(agents.workspaceId, input.workspaceId));

    let humanAgentId = existingAgents.find((a) => a.role === "human")?.id ?? null;
    let assistantAgentId = existingAgents.find((a) => a.role === "assistant")?.id ?? null;

    if (!humanAgentId) {
      humanAgentId = uuid();
      await tx.insert(agents).values({
        id: humanAgentId,
        workspaceId: input.workspaceId,
        role: "human",
        parentId: null,
        llmHistory: initialAgentHistory({
          agentId: humanAgentId,
          workspaceId: input.workspaceId,
          role: "human",
        }),
        createdAt,
      });
      createdHuman = true;
    }

    if (!assistantAgentId) {
      assistantAgentId = uuid();
      await tx.insert(agents).values({
        id: assistantAgentId,
        workspaceId: input.workspaceId,
        role: "assistant",
        parentId: null,
        llmHistory: initialAgentHistory({
          agentId: assistantAgentId,
          workspaceId: input.workspaceId,
          role: "assistant",
        }),
        createdAt,
      });
      createdAssistant = true;
    }

    const candidate = await tx
      .select({ id: groups.id })
      .from(groups)
      .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .where(eq(groups.workspaceId, input.workspaceId))
      .groupBy(groups.id)
      .having(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dsql`count(*) = 2 and sum(case when ${groupMembers.userId} = ${humanAgentId} or ${groupMembers.userId} = ${assistantAgentId} then 1 else 0 end) = 2`
      )
      .orderBy(desc(groups.createdAt))
      .limit(1);

    let defaultGroupId = candidate[0]?.id ?? null;

    if (!defaultGroupId) {
      defaultGroupId = uuid();
      await tx.insert(groups).values({
        id: defaultGroupId,
        workspaceId: input.workspaceId,
        name: null,
        createdAt,
      });

      await tx.insert(groupMembers).values([
        {
          groupId: defaultGroupId,
          userId: humanAgentId,
          lastReadMessageId: null,
          joinedAt: createdAt,
        },
        {
          groupId: defaultGroupId,
          userId: assistantAgentId,
          lastReadMessageId: null,
          joinedAt: createdAt,
        },
      ]);
      createdGroup = true;
    }

    return { workspaceId: input.workspaceId, humanAgentId, assistantAgentId, defaultGroupId };
  });

  if (createdHuman) {
    await emitDbWrite({ workspaceId: input.workspaceId, table: "agents", action: "insert" });
  }
  if (createdAssistant) {
    await emitDbWrite({ workspaceId: input.workspaceId, table: "agents", action: "insert" });
  }
  if (createdGroup) {
    await emitDbWrite({
      workspaceId: input.workspaceId,
      table: "groups",
      action: "insert",
      recordId: result.defaultGroupId,
    });
    await emitDbWrite({
      workspaceId: input.workspaceId,
      table: "group_members",
      action: "insert",
      recordId: result.defaultGroupId,
    });
  }

  return result;
}

export async function deleteWorkspace(input: { workspaceId: UUID }) {
  const db = getDb();

  const ws = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  if (ws.length === 0) throw new Error("workspace not found");

  await db.transaction(async (tx) => {
    await tx.delete(messages).where(eq(messages.workspaceId, input.workspaceId));
    await tx.delete(groupMembers).where(
      inArray(
        groupMembers.groupId,
        tx.select({ id: groups.id }).from(groups).where(eq(groups.workspaceId, input.workspaceId))
      )
    );
    await tx.delete(groups).where(eq(groups.workspaceId, input.workspaceId));
    await tx.delete(agents).where(eq(agents.workspaceId, input.workspaceId));
    await tx.delete(files).where(eq(files.workspaceId, input.workspaceId));
    await tx.delete(workspaces).where(eq(workspaces.id, input.workspaceId));
  });
}
