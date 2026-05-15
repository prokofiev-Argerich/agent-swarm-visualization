import { and, desc, eq, gt, ne, sql as dsql } from "drizzle-orm";
import { getDb } from "@/db";
import { groups, groupMembers, messages } from "@/db/schema";
import { emitDbWrite, now, uuid, type UUID } from "./shared";
import {
  createGroup,
  findLatestExactGroupId,
  findLatestExactP2PGroupId,
  mergeDuplicateExactP2PGroups,
} from "./groups";

export async function listMessages(input: { groupId: UUID }) {
  const db = getDb();
  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      content: messages.content,
      contentType: messages.contentType,
      sendTime: messages.sendTime,
    })
    .from(messages)
    .where(eq(messages.groupId, input.groupId))
    .orderBy(messages.sendTime);

  return rows.map((m) => ({ ...m, sendTime: m.sendTime.toISOString() }));
}

export async function sendMessage(input: {
  groupId: UUID;
  senderId: UUID;
  content: string;
  contentType: string;
}) {
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
  });

  await emitDbWrite({
    workspaceId: group[0]!.workspaceId,
    table: "messages",
    action: "insert",
    recordId: messageId,
  });

  return { id: messageId, sendTime: sendTime.toISOString() };
}

export async function sendDirectMessage(input: {
  workspaceId: UUID;
  fromId: UUID;
  toId: UUID;
  observerHumanId?: UUID | null;
  content: string;
  contentType?: string;
  groupName?: string | null;
  newThread?: boolean;
}) {
  const memberIds = [
    input.fromId,
    input.toId,
    input.observerHumanId && input.observerHumanId !== input.fromId && input.observerHumanId !== input.toId
      ? input.observerHumanId
      : null,
  ].filter(Boolean) as UUID[];

  let groupId: UUID;
  let channel: "new_thread" | "new_group" | "reuse_existing_group";
  if (input.newThread === true) {
    groupId = (
      await createGroup({
        workspaceId: input.workspaceId,
        memberIds,
        name: input.groupName ?? undefined,
      })
    ).id;
    channel = "new_thread";
  } else if (memberIds.length === 2) {
    const existing = await findLatestExactP2PGroupId({
      workspaceId: input.workspaceId,
      memberA: memberIds[0]!,
      memberB: memberIds[1]!,
      preferredName: input.groupName ?? null,
    });
    groupId =
      (await mergeDuplicateExactP2PGroups({
        workspaceId: input.workspaceId,
        memberA: memberIds[0]!,
        memberB: memberIds[1]!,
        preferredName: input.groupName ?? null,
      })) ??
      (
        await createGroup({
          workspaceId: input.workspaceId,
          memberIds,
          name: input.groupName ?? undefined,
        })
      ).id;
    channel = existing ? "reuse_existing_group" : "new_group";
  } else {
    const existing = await findLatestExactGroupId({
      workspaceId: input.workspaceId,
      memberIds,
    });
    groupId =
      existing ??
      (
        await createGroup({
          workspaceId: input.workspaceId,
          memberIds,
          name: input.groupName ?? undefined,
        })
      ).id;
    channel = existing ? "reuse_existing_group" : "new_group";
  }

  const message = await sendMessage({
    groupId,
    senderId: input.fromId,
    content: input.content,
    contentType: input.contentType ?? "text",
  });

  return { groupId, messageId: message.id, sendTime: message.sendTime, channel };
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dsql`${groupMembers.groupId} = ${input.groupId} and ${groupMembers.userId} = ${input.readerId}`
    );

  const group = await db
    .select({ workspaceId: groups.workspaceId })
    .from(groups)
    .where(eq(groups.id, input.groupId))
    .limit(1);
  if (group.length > 0) {
    await emitDbWrite({
      workspaceId: group[0]!.workspaceId,
      table: "group_members",
      action: "update",
      recordId: input.groupId,
    });
  }
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dsql`${groupMembers.groupId} = ${input.groupId} and ${groupMembers.userId} = ${input.readerId}`
    );

  const group = await db
    .select({ workspaceId: groups.workspaceId })
    .from(groups)
    .where(eq(groups.id, input.groupId))
    .limit(1);
  if (group.length > 0) {
    await emitDbWrite({
      workspaceId: group[0]!.workspaceId,
      table: "group_members",
      action: "update",
      recordId: input.groupId,
    });
  }
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
  }));
}