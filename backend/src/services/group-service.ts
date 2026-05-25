import { and, desc, eq, sql as dsql } from "drizzle-orm";
import { getDb } from "@/db";
import { groups, groupMembers, messages } from "@/db/schema";
import { now, uuid, type UUID } from "@/lib/storage/shared";
import { workspaceEventPublisher } from "./events/workspace-event-publisher";

export async function listGroups(input: Parameters<typeof import("@/lib/storage").store.listGroups>[0]) {
  const { store } = await import("@/lib/storage");
  return store.listGroups(input);
}

export async function addGroupMembers(input: Parameters<typeof import("@/lib/storage").store.addGroupMembers>[0]) {
  const { store } = await import("@/lib/storage");
  return store.addGroupMembers(input);
}

export async function deleteGroup(input: Parameters<typeof import("@/lib/storage").store.deleteGroup>[0]) {
  const { store } = await import("@/lib/storage");
  return store.deleteGroup(input);
}

export async function listGroupMemberIds(input: Parameters<typeof import("@/lib/storage").store.listGroupMemberIds>[0]) {
  const { store } = await import("@/lib/storage");
  return store.listGroupMemberIds(input);
}

export async function getGroupWorkspaceId(input: Parameters<typeof import("@/lib/storage").store.getGroupWorkspaceId>[0]) {
  const { store } = await import("@/lib/storage");
  return store.getGroupWorkspaceId(input);
}

export async function setGroupContextTokens(input: Parameters<typeof import("@/lib/storage").store.setGroupContextTokens>[0]) {
  const { store } = await import("@/lib/storage");
  return store.setGroupContextTokens(input);
}

export async function createGroup(input: {
  workspaceId: UUID;
  memberIds: UUID[];
  name?: string;
}) {
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

  workspaceEventPublisher.emit(input.workspaceId, {
    event: "ui.db.write",
    data: { workspaceId: input.workspaceId, table: "groups", action: "insert", recordId: groupId },
  });
  workspaceEventPublisher.emit(input.workspaceId, {
    event: "ui.db.write",
    data: { workspaceId: input.workspaceId, table: "group_members", action: "insert", recordId: groupId },
  });

  return { id: groupId, name: input.name ?? null, createdAt: createdAt.toISOString() };
}

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
      dsql`count(distinct ${groupMembers.userId}) = 2 and sum(case when ${groupMembers.userId} = ${a} then 1 else 0 end) > 0 and sum(case when ${groupMembers.userId} = ${b} then 1 else 0 end) > 0`
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
        dsql`count(distinct ${groupMembers.userId}) = 2 and sum(case when ${groupMembers.userId} = ${a} then 1 else 0 end) > 0 and sum(case when ${groupMembers.userId} = ${b} then 1 else 0 end) > 0`
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

export async function findLatestExactGroupId(input: {
  workspaceId: UUID;
  memberIds: UUID[];
}): Promise<UUID | null> {
  const db = getDb();
  const ids = [...new Set(input.memberIds)].filter(Boolean);
  if (ids.length === 0) return null;

  const checks = ids.map((id) =>
    dsql`sum(case when ${groupMembers.userId} = ${id} then 1 else 0 end) > 0`
  );
  const joinedChecks = checks.reduce((acc, cond) => dsql`${acc} and ${cond}`);

  const rows = await db
    .select({
      id: groups.id,
      createdAt: groups.createdAt,
      lastMessageTime: dsql<Date | null>`max(${messages.sendTime})`,
    })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .leftJoin(messages, eq(messages.groupId, groups.id))
    .where(eq(groups.workspaceId, input.workspaceId))
    .groupBy(groups.id)
    .having(
      dsql`count(distinct ${groupMembers.userId}) = ${ids.length} and ${joinedChecks}`
    )
    .orderBy(desc(dsql`coalesce(max(${messages.sendTime}), ${groups.createdAt})`))
    .limit(1);

  return rows[0]?.id ?? null;
}

export async function findOrCreateP2PGroup(input: {
  workspaceId: UUID;
  memberA: UUID;
  memberB: UUID;
  preferredName?: string | null;
}) {
  const existing = await findLatestExactP2PGroupId({
    workspaceId: input.workspaceId,
    memberA: input.memberA,
    memberB: input.memberB,
    preferredName: input.preferredName,
  });

  if (existing) {
    return { id: existing, isNew: false };
  }

  const created = await createGroup({
    workspaceId: input.workspaceId,
    memberIds: [input.memberA, input.memberB],
    name: input.preferredName ?? undefined,
  });

  return { id: created.id, isNew: true };
}
