import { and, desc, eq, gt, ne, sql as dsql } from "drizzle-orm";
import { getDb } from "@/db";
import { groups, groupMembers, messages } from "@/db/schema";
import { now, type UUID } from "./shared";

export async function addGroupMembers(input: { groupId: UUID; userIds: UUID[] }) {
  const db = getDb();
  const joinedAt = now();

  if (input.userIds.length === 0) return;

  const group = await db
    .select({ workspaceId: groups.workspaceId })
    .from(groups)
    .where(eq(groups.id, input.groupId))
    .limit(1);
  if (group.length === 0) throw new Error("group not found");

  await db
    .insert(groupMembers)
    .values(
      input.userIds.map((userId) => ({
        groupId: input.groupId,
        userId,
        lastReadMessageId: null,
        joinedAt,
      }))
    )
    .onConflictDoNothing();
}

export async function listGroupMemberIds(input: { groupId: UUID }): Promise<UUID[]> {
  const db = getDb();
  const rows = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, input.groupId));
  return rows.map((r) => r.userId);
}

export async function getGroupWorkspaceId(input: { groupId: UUID }): Promise<UUID> {
  const db = getDb();
  const group = await db
    .select({ workspaceId: groups.workspaceId })
    .from(groups)
    .where(eq(groups.id, input.groupId))
    .limit(1);
  if (group.length === 0) throw new Error("group not found");
  return group[0]!.workspaceId;
}

export async function listGroups(input: { workspaceId?: UUID; agentId?: UUID }) {
  const db = getDb();
  const viewerRole = input.agentId
    ? (
        await db
          .select({ role: groups.name })
          .from(groups)
          .limit(1)
      )[0]?.role ?? null
    : null;

  const rows = input.agentId
    ? await db
        .select({
          id: groups.id,
          name: groups.name,
          workspaceId: groups.workspaceId,
          contextTokens: groups.contextTokens,
          createdAt: groups.createdAt,
        })
        .from(groups)
        .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
        .where(
          input.workspaceId
            ? and(eq(groups.workspaceId, input.workspaceId), eq(groupMembers.userId, input.agentId))
            : eq(groupMembers.userId, input.agentId)
        )
        .orderBy(desc(groups.createdAt))
    : await db
        .select({
          id: groups.id,
          name: groups.name,
          workspaceId: groups.workspaceId,
          contextTokens: groups.contextTokens,
          createdAt: groups.createdAt,
        })
        .from(groups)
        .where(input.workspaceId ? eq(groups.workspaceId, input.workspaceId) : undefined)
        .orderBy(desc(groups.createdAt));

  const result = [];
  for (const g of rows) {
    const members = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, g.id));

    const lastMessage = await db
      .select({
        id: messages.id,
        senderId: messages.senderId,
        content: messages.content,
        contentType: messages.contentType,
        sendTime: messages.sendTime,
      })
      .from(messages)
      .where(eq(messages.groupId, g.id))
      .orderBy(desc(messages.sendTime))
      .limit(1);

    let unreadCount = 0;
    if (input.agentId) {
      const state = await db
        .select({ lastReadMessageId: groupMembers.lastReadMessageId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, input.agentId)))
        .limit(1);

      const lastReadId = state[0]?.lastReadMessageId ?? null;
      if (!lastReadId) {
        const countRow = await db
          .select({ c: dsql<number>`count(*)` })
          .from(messages)
          .where(and(eq(messages.groupId, g.id), ne(messages.senderId, input.agentId)));
        unreadCount = Number(countRow[0]?.c ?? 0);
      } else {
        const lastRead = await db
          .select({ sendTime: messages.sendTime })
          .from(messages)
          .where(eq(messages.id, lastReadId))
          .limit(1);

        const cutoff = lastRead[0]?.sendTime ?? new Date(0);
        const countRow = await db
          .select({ c: dsql<number>`count(*)` })
          .from(messages)
          .where(
            and(eq(messages.groupId, g.id), gt(messages.sendTime, cutoff), ne(messages.senderId, input.agentId))
          );
        unreadCount = Number(countRow[0]?.c ?? 0);
      }
    }

    const updatedAt = lastMessage[0]?.sendTime ?? g.createdAt;

    result.push({
      id: g.id,
      name: g.name,
      memberIds: members.map((m) => m.userId),
      unreadCount,
      contextTokens: g.contextTokens ?? 0,
      lastMessage: lastMessage[0]
        ? {
            content: lastMessage[0].content,
            contentType: lastMessage[0].contentType,
            sendTime: lastMessage[0].sendTime.toISOString(),
            senderId: lastMessage[0].senderId,
          }
        : undefined,
      updatedAt: updatedAt.toISOString(),
      createdAt: g.createdAt.toISOString(),
    });
  }

  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function setGroupContextTokens(input: { groupId: UUID; tokens: number }) {
  const db = getDb();
  const group = await db
    .select({ workspaceId: groups.workspaceId, contextTokens: groups.contextTokens })
    .from(groups)
    .where(eq(groups.id, input.groupId))
    .limit(1);
  if (group.length === 0) throw new Error("group not found");

  await db.update(groups).set({ contextTokens: input.tokens }).where(eq(groups.id, input.groupId));

  return { contextTokens: input.tokens };
}

export async function deleteGroup(input: { groupId: UUID; workspaceId: UUID }) {
  const db = getDb();

  const group = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.id, input.groupId))
    .limit(1);
  if (group.length === 0) throw new Error("group not found");

  await db.transaction(async (tx) => {
    await tx.delete(messages).where(eq(messages.groupId, input.groupId));
    await tx.delete(groupMembers).where(eq(groupMembers.groupId, input.groupId));
    await tx.delete(groups).where(eq(groups.id, input.groupId));
  });
}
