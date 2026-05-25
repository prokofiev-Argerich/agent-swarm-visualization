import { and, desc, eq, gt, ilike, inArray, lt, ne, sql as dsql } from "drizzle-orm";
import { getDb } from "@/db";
import { groups, groupMembers, messages } from "@/db/schema";
import { now, uuid, withSchemaRetry, type UUID } from "./shared";

const MSG_SELECT = {
  id: messages.id,
  senderId: messages.senderId,
  content: messages.content,
  contentType: messages.contentType,
  sendTime: messages.sendTime,
  phaseId: messages.phaseId,
  causedBy: messages.causedBy,
};

 
function toMsg(row: any) {
  return {
    id: row.id as string,
    senderId: row.senderId as string,
    content: row.content as string,
    contentType: row.contentType as string,
    sendTime: (row.sendTime as Date).toISOString(),
    phaseId: (row.phaseId as string | null) ?? undefined,
    causedBy: (row.causedBy as string | null) ?? undefined,
  };
}

export async function listMessages(input: { groupId: UUID }) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const rows = await db
      .select(MSG_SELECT)
      .from(messages)
      .where(eq(messages.groupId, input.groupId))
      .orderBy(messages.sendTime);

    return rows.map(toMsg);
  });
}

export async function listGroupMessagesPaged(input: {
  groupId: UUID;
  limit?: number;
  before?: UUID;
  phaseId?: UUID;
}) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const limit = Math.max(1, Math.min(100, input.limit ?? 50));

    const conditions: ReturnType<typeof eq>[] = [eq(messages.groupId, input.groupId)];
    if (input.phaseId) {
      conditions.push(eq(messages.phaseId, input.phaseId));
    }
    if (input.before) {
      const beforeRow = await db
        .select({ sendTime: messages.sendTime })
        .from(messages)
        .where(eq(messages.id, input.before))
        .limit(1);
      if (beforeRow.length > 0) {
        conditions.push(lt(messages.sendTime, beforeRow[0]!.sendTime));
      }
    }

    const rows = await db
      .select(MSG_SELECT)
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.sendTime))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const sorted = page.reverse(); // return in asc order
    const nextCursor = hasMore && sorted.length > 0 ? sorted[0]!.id : null;

    return {
      messages: sorted.map(toMsg),
      hasMore,
      nextCursor,
    };
  });
}

export async function sendMessage(input: {
  groupId: UUID;
  senderId: UUID;
  content: string;
  contentType: string;
  phaseId?: UUID;
  causedBy?: UUID;
}) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const group = await db
      .select({ workspaceId: groups.workspaceId })
      .from(groups)
      .where(eq(groups.id, input.groupId))
      .limit(1);

    if (group.length === 0) throw new Error("group not found");

    const messageId = uuid();
    const sendTime = now();

    await db.insert(messages).values({
      id: messageId,
      workspaceId: group[0]!.workspaceId,
      groupId: input.groupId,
      senderId: input.senderId,
      contentType: input.contentType,
      content: input.content,
      sendTime,
      phaseId: input.phaseId ?? null,
      causedBy: input.causedBy ?? null,
    });

    return { id: messageId, sendTime: sendTime.toISOString() };
  });
}

export async function markGroupRead(input: { groupId: UUID; readerId: UUID }) {
  const db = getDb();
  const last = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.groupId, input.groupId))
    .orderBy(desc(messages.sendTime))
    .limit(1);

  await db
    .update(groupMembers)
    .set({ lastReadMessageId: last[0]?.id ?? null })
    .where(
       
      dsql`${groupMembers.groupId} = ${input.groupId} and ${groupMembers.userId} = ${input.readerId}`
    );

}

export async function markGroupReadToMessage(input: {
  groupId: UUID;
  readerId: UUID;
  messageId: UUID;
}) {
  const db = getDb();
  await db
    .update(groupMembers)
    .set({ lastReadMessageId: input.messageId })
    .where(
       
      dsql`${groupMembers.groupId} = ${input.groupId} and ${groupMembers.userId} = ${input.readerId}`
    );

}

export async function listRecentWorkspaceMessages(input: {
  workspaceId: UUID;
  limit?: number;
}) {
  const db = getDb();
  const limit = Math.max(1, Math.min(5000, input.limit ?? 2000));
  const rows = await db
    .select({
      id: messages.id,
      groupId: messages.groupId,
      senderId: messages.senderId,
      sendTime: messages.sendTime,
      causedBy: messages.causedBy,
    })
    .from(messages)
    .where(eq(messages.workspaceId, input.workspaceId))
    .orderBy(desc(messages.sendTime))
    .limit(limit);

  return rows.map((m) => ({
    id: m.id,
    groupId: m.groupId,
    senderId: m.senderId,
    sendTime: m.sendTime.toISOString(),
    causedBy: (m.causedBy as string | null) ?? undefined,
  }));
}

export async function searchMessages(input: {
  workspaceId: UUID;
  query: string;
  limit?: number;
}) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const limit = Math.max(1, Math.min(50, input.limit ?? 20));
    const trimmed = input.query.trim();
    if (!trimmed) return [];
    const pattern = `%${trimmed.replace(/[%_]/g, "\\$&")}%`;
    const rows = await db
      .select({
        id: messages.id,
        groupId: messages.groupId,
        senderId: messages.senderId,
        content: messages.content,
        contentType: messages.contentType,
        sendTime: messages.sendTime,
      })
      .from(messages)
      .where(and(eq(messages.workspaceId, input.workspaceId), ilike(messages.content, pattern)))
      .orderBy(desc(messages.sendTime))
      .limit(limit);

    return rows.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      senderId: m.senderId,
      contentType: m.contentType,
      content: m.content.length > 200 ? m.content.slice(0, 200) + "…" : m.content,
      sendTime: m.sendTime.toISOString(),
    }));
  });
}

export async function getMessagesByIds(input: {
  workspaceId: UUID;
  ids: UUID[];
}) {
  return withSchemaRetry(async () => {
    if (input.ids.length === 0) return [];
    const db = getDb();
    const rows = await db
      .select({
        id: messages.id,
        groupId: messages.groupId,
        senderId: messages.senderId,
        content: messages.content,
        contentType: messages.contentType,
        sendTime: messages.sendTime,
        phaseId: messages.phaseId,
        causedBy: messages.causedBy,
      })
      .from(messages)
      .where(
        and(
          eq(messages.workspaceId, input.workspaceId),
          inArray(messages.id, input.ids)
        )
      )
      .orderBy(desc(messages.sendTime));
    return rows.map((r) => ({
      id: r.id,
      groupId: r.groupId,
      senderId: r.senderId,
      content: r.content,
      contentType: r.contentType,
      sendTime: r.sendTime.toISOString(),
      phaseId: (r.phaseId as string | null) ?? undefined,
      causedBy: (r.causedBy as string | null) ?? undefined,
    }));
  });
}