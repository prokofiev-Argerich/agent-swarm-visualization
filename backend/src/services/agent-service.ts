import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, groups, groupMembers } from "@/db/schema";
import { initialAgentHistory, now, uuid, type UUID } from "@/lib/storage/shared";
import { workspaceEventPublisher } from "./events/workspace-event-publisher";
import { ensureWorkspaceDefaults } from "./workspace-service";

export async function listAgentsMeta(input: Parameters<typeof import("@/lib/storage").store.listAgentsMeta>[0]) {
  const { store } = await import("@/lib/storage");
  return store.listAgentsMeta(input);
}

export async function getAgent(input: Parameters<typeof import("@/lib/storage").store.getAgent>[0]) {
  const { store } = await import("@/lib/storage");
  return store.getAgent(input);
}

export async function getAgentRole(input: Parameters<typeof import("@/lib/storage").store.getAgentRole>[0]) {
  const { store } = await import("@/lib/storage");
  return store.getAgentRole(input);
}

export async function listAgents(input?: Parameters<typeof import("@/lib/storage").store.listAgents>[0]) {
  const { store } = await import("@/lib/storage");
  return store.listAgents(input);
}

export async function createAgent(input: Parameters<typeof import("@/lib/storage").store.createAgent>[0]) {
  const { store } = await import("@/lib/storage");
  return store.createAgent(input);
}

export async function deleteAgent(input: Parameters<typeof import("@/lib/storage").store.deleteAgent>[0]) {
  const { store } = await import("@/lib/storage");
  return store.deleteAgent(input);
}

export async function setAgentHistory(input: Parameters<typeof import("@/lib/storage").store.setAgentHistory>[0]) {
  const { store } = await import("@/lib/storage");
  return store.setAgentHistory(input);
}

export async function listUnreadByGroup(input: Parameters<typeof import("@/lib/storage").store.listUnreadByGroup>[0]) {
  const { store } = await import("@/lib/storage");
  return store.listUnreadByGroup(input);
}

export type CreateSubAgentWithP2PInput = {
  workspaceId: string;
  creatorId: string;
  role: string;
  guidance?: string;
  collaborationGroupId?: string;
};

export type CreateSubAgentWithP2PResult = {
  agentId: string;
  groupId: string;
  collaborationGroupId: string | null;
  createdAt: string;
};

export async function createSubAgentWithP2P(
  input: CreateSubAgentWithP2PInput
): Promise<CreateSubAgentWithP2PResult> {
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

  workspaceEventPublisher.emit(input.workspaceId, {
    event: "ui.db.write",
    data: { workspaceId: input.workspaceId, table: "agents", action: "insert", recordId: agentId },
  });
  workspaceEventPublisher.emit(input.workspaceId, {
    event: "ui.db.write",
    data: { workspaceId: input.workspaceId, table: "groups", action: "insert", recordId: p2pGroupId },
  });
  workspaceEventPublisher.emit(input.workspaceId, {
    event: "ui.db.write",
    data: { workspaceId: input.workspaceId, table: "group_members", action: "insert", recordId: p2pGroupId },
  });

  workspaceEventPublisher.emit(input.workspaceId, {
    event: "ui.agent.created",
    data: { workspaceId: input.workspaceId, agent: { id: agentId, role: input.role, parentId: input.creatorId } },
  });
  workspaceEventPublisher.emit(input.workspaceId, {
    event: "ui.group.created",
    data: { workspaceId: input.workspaceId, group: { id: p2pGroupId, name: input.role, memberIds: [humanAgentId, agentId] } },
  });
  if (input.collaborationGroupId) {
    workspaceEventPublisher.emit(input.workspaceId, {
      event: "ui.group.updated",
      data: { workspaceId: input.workspaceId, groupId: input.collaborationGroupId, addedMembers: [agentId] },
    });
  }

  return {
    agentId,
    groupId: p2pGroupId,
    collaborationGroupId: input.collaborationGroupId ?? null,
    createdAt: createdAt.toISOString(),
  };
}
