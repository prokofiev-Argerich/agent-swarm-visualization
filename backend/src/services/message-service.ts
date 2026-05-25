import { store } from "@/lib/storage";
import * as groupService from "./group-service";
import { workspaceEventPublisher } from "./events/workspace-event-publisher";
import type { UUID } from "@/lib/storage/shared";

export async function listMessages(input: Parameters<typeof store.listMessages>[0]) {
  return store.listMessages(input);
}

export async function listGroupMessagesPaged(input: Parameters<typeof store.listGroupMessagesPaged>[0]) {
  return store.listGroupMessagesPaged(input);
}

export async function sendMessage(input: Parameters<typeof store.sendMessage>[0]) {
  return store.sendMessage(input);
}

export async function markGroupRead(input: Parameters<typeof store.markGroupRead>[0]) {
  return store.markGroupRead(input);
}

export async function markGroupReadToMessage(input: Parameters<typeof store.markGroupReadToMessage>[0]) {
  return store.markGroupReadToMessage(input);
}

export async function listRecentWorkspaceMessages(input: Parameters<typeof store.listRecentWorkspaceMessages>[0]) {
  return store.listRecentWorkspaceMessages(input);
}

export async function searchMessages(input: Parameters<typeof store.searchMessages>[0]) {
  return store.searchMessages(input);
}

export async function getMessagesByIds(input: Parameters<typeof store.getMessagesByIds>[0]) {
  return store.getMessagesByIds(input);
}

export async function sendGroupMessage(input: {
  groupId: UUID;
  senderId: UUID;
  content: string;
  contentType?: string;
  phaseId?: UUID;
  causedBy?: UUID;
}) {
  const result = await store.sendMessage({
    groupId: input.groupId,
    senderId: input.senderId,
    content: input.content,
    contentType: input.contentType ?? "text",
    phaseId: input.phaseId,
    causedBy: input.causedBy,
  });

  const [workspaceId, memberIds] = await Promise.all([
    groupService.getGroupWorkspaceId({ groupId: input.groupId }),
    groupService.listGroupMemberIds({ groupId: input.groupId }),
  ]);

  workspaceEventPublisher.emit(workspaceId, {
    event: "ui.message.created",
    data: {
      workspaceId,
      groupId: input.groupId,
      memberIds,
      message: { id: result.id, senderId: input.senderId, sendTime: result.sendTime },
    },
  });

  return result;
}

export async function sendDirectMessage(input: {
  workspaceId: UUID;
  fromId: UUID;
  toId: UUID;
  observerHumanId?: UUID | null;
  content: string;
  contentType?: string;
  groupName?: string | null;
  causedBy?: UUID;
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
    const created = await groupService.createGroup({
      workspaceId: input.workspaceId,
      memberIds,
      name: input.groupName ?? undefined,
    });
    groupId = created.id;
    channel = "new_thread";
  } else if (memberIds.length === 2) {
    const existing = await groupService.findLatestExactP2PGroupId({
      workspaceId: input.workspaceId,
      memberA: memberIds[0]!,
      memberB: memberIds[1]!,
      preferredName: input.groupName ?? null,
    });

    groupId =
      (await groupService.mergeDuplicateExactP2PGroups({
        workspaceId: input.workspaceId,
        memberA: memberIds[0]!,
        memberB: memberIds[1]!,
        preferredName: input.groupName ?? null,
      })) ??
      (
        await groupService.createGroup({
          workspaceId: input.workspaceId,
          memberIds,
          name: input.groupName ?? undefined,
        })
      ).id;
    channel = existing ? "reuse_existing_group" : "new_group";
  } else {
    const existing = await groupService.findLatestExactGroupId({
      workspaceId: input.workspaceId,
      memberIds,
    });
    groupId =
      existing ??
      (
        await groupService.createGroup({
          workspaceId: input.workspaceId,
          memberIds,
          name: input.groupName ?? undefined,
        })
      ).id;
    channel = existing ? "reuse_existing_group" : "new_group";
  }

  const message = await store.sendMessage({
    groupId,
    senderId: input.fromId,
    content: input.content,
    contentType: input.contentType ?? "text",
    causedBy: input.causedBy,
  });

  return { groupId, messageId: message.id, sendTime: message.sendTime, channel };
}
