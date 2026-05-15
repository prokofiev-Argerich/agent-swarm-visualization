import { and, desc, eq, gt, inArray, ne, sql as dsql } from "drizzle-orm";
import { getDb } from "@/db";
import { groups, groupMembers, messages } from "@/db/schema";
import { emitDbWrite, now, uuid, type UUID } from "./shared";

export async function findLatestExactP2PGroupId(input: {
  workspaceId: UUID;
  memberA: UUID;
  memberB: UUID;
  preferredName?: string | null;
}): Promise<UUID | null> {
  const db = getDb();
  const a = input.memberA;
  const b = input.memberB;
  if (!a || !b || a === b) return null;

  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      createdAt: groups.createdAt,
      lastMessageTime: dsql<Date | null>`max(${messages.sendTime})`,
    })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .leftJoin(messages, eq(messages.groupId, groups.id))
    .where(eq(groups.workspaceId, input.workspaceId))
    .groupBy(groups.id)
    .having(
      dsql`count(*) = 2 and sum(case when ${groupMembers.userId} = ${a} or ${groupMembers.userId} = ${b} then 1 else 0 end) = 2`
    );

  if (rows.length === 0) return null;

  const preferred = (input.preferredName ?? null) || null;
  rows.sort((x, y) => {
    const xName = x.name ?? null;
    const yName = y.name ?? null;
    const xMatch = preferred && xName === preferred ? 1 : 0;
    const yMatch = preferred && yName === preferred ? 1 : 0;
    if (xMatch !== yMatch) return yMatch - xMatch;

    const xNamed = xName ? 1 : 0;
    const yNamed = yName ? 1 : 0;
    if (xNamed !== yNamed) return yNamed - xNamed;

    const xUpdated = (x.lastMessageTime ?? x.createdAt).getTime();
    const yUpdated = (y.lastMessageTime ?? y.createdAt).getTime();
    if (xUpdated !== yUpdated) return yUpdated - xUpdated;

    return y.createdAt.getTime() - x.createdAt.getTime();
  });

  return rows[0]!.id;
}

export async function mergeDuplicateExactP2PGroups(input: {
  workspaceId: UUID;
  memberA: UUID;
  memberB: UUID;
  preferredName?: string | null;
}): Promise<UUID | null> {
  const db = getDb();
  const a = input.memberA;
  const b = input.memberB;
  if (!a || !b || a === b) return null;

  const createdAt = now();

  return await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: groups.id,
        name: groups.name,
        createdAt: groups.createdAt,
        lastMessageTime: dsql<Date | null>`max(${messages.sendTime})`,
      })
      .from(groups)
      .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .leftJoin(messages, eq(messages.groupId, groups.id))
      .where(eq(groups.workspaceId, input.workspaceId))
      .groupBy(groups.id)
      .having(
        dsql`count(*) = 2 and sum(case when ${groupMembers.userId} = ${a} or ${groupMembers.userId} = ${b} then 1 else 0 end) = 2`
      );

    const preferred = (input.preferredName ?? null) || null;

    const pickBest = (candidates: typeof rows) => {
      const sorted = [...candidates];
      sorted.sort((x, y) => {
        const xName = x.name ?? null;
        const yName = y.name ?? null;
        const xMatch = preferred && xName === preferred ? 1 : 0;
        const yMatch = preferred && yName === preferred ? 1 : 0;
        if (xMatch !== yMatch) return yMatch - xMatch;

        const xNamed = xName ? 1 : 0;
        const yNamed = yName ? 1 : 0;
        if (xNamed !== yNamed) return yNamed - xNamed;

        const xUpdated = (x.lastMessageTime ?? x.createdAt).getTime();
        const yUpdated = (y.lastMessageTime ?? y.createdAt).getTime();
        if (xUpdated !== yUpdated) return yUpdated - xUpdated;

        return y.createdAt.getTime() - x.createdAt.getTime();
      });
      return sorted[0]!;
    };

    let keepId: UUID | null = null;

    if (rows.length === 0) {
      keepId = uuid();
      await tx.insert(groups).values({
        id: keepId,
        workspaceId: input.workspaceId,
        name: preferred || null,
        createdAt,
      });
      await tx.insert(groupMembers).values([
        { groupId: keepId, userId: a, lastReadMessageId: null, joinedAt: createdAt },
        { groupId: keepId, userId: b, lastReadMessageId: null, joinedAt: createdAt },
      ]);
      return keepId;
    }

    const best = pickBest(rows);
    keepId = best.id;

    const others = rows.filter((r) => r.id !== keepId).map((r) => r.id);
    for (const otherId of others) {
      await tx
        .update(messages)
        .set({ groupId: keepId })
        .where(and(eq(messages.workspaceId, input.workspaceId), eq(messages.groupId, otherId)));

      await tx.delete(groupMembers).where(eq(groupMembers.groupId, otherId));
      await tx.delete(groups).where(eq(groups.id, otherId));
    }

    if (preferred && (best.name ?? null) !== preferred) {
      await tx.update(groups).set({ name: preferred }).where(eq(groups.id, keepId));
    }

    return keepId;
  });
}

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

  await emitDbWrite({
    workspaceId: group[0]!.workspaceId,
    table: "group_members",
    action: "insert",
    recordId: input.groupId,
  });
}

export async function createGroup(input: { workspaceId: UUID; memberIds: UUID[]; name?: string }) {
  const db = getDb();
  const groupId = uuid();
  const createdAt = now();

  await db.transaction(async (tx) => {
    await tx.insert(groups).values({
      id: groupId,
      workspaceId: input.workspaceId,
      name: input.name ?? null,
      createdAt,
    });

    await tx.insert(groupMembers).values(
      input.memberIds.map((userId) => ({
        groupId,
        userId,
        lastReadMessageId: null,
        joinedAt: createdAt,
      }))
    );
  });

  await emitDbWrite({
    workspaceId: input.workspaceId,
    table: "groups",
    action: "insert",
    recordId: groupId,
  });
  await emitDbWrite({
    workspaceId: input.workspaceId,
    table: "group_members",
    action: "insert",
    recordId: groupId,
  });

  return { id: groupId, name: input.name ?? null, createdAt: createdAt.toISOString() };
}

export async function findLatestExactGroupId(input: {
  workspaceId: UUID;
  memberIds: UUID[];
}): Promise<UUID | null> {
  const db = getDb();
  const ids = [...new Set(input.memberIds)].filter(Boolean);
  if (ids.length === 0) return null;

  const rows = await db
    .select({
      id: groups.id,
      createdAt: groups.createdAt,
      lastMessageTime: dsql<Date | null>`max(${messages.sendTime})`,
    })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .leftJoin(messages, eq(messages.groupId, groups.id))
    .where(and(eq(groups.workspaceId, input.workspaceId), inArray(groupMembers.userId, ids)))
    .groupBy(groups.id)
    .having(
      dsql`count(distinct ${groupMembers.userId}) = ${ids.length} and count(*) = ${ids.length}`
    )
    .orderBy(desc(dsql`coalesce(max(${messages.sendTime}), ${groups.createdAt})`))
    .limit(1);

  return rows[0]?.id ?? null;
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

  await emitDbWrite({
    workspaceId: group[0]!.workspaceId,
    table: "groups",
    action: "update",
    recordId: input.groupId,
  });

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

  await emitDbWrite({
    workspaceId: input.workspaceId,
    table: "groups",
    action: "delete",
    recordId: input.groupId,
  });
}
