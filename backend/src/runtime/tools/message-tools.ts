import { store } from "@/lib/storage";
import { getWorkspaceUIBus } from "../ui-bus";
import { parseArgs, requireParam, requireUuid, requireGroupMembership } from "./validate";
import type { RuntimeTool } from "./types";

export const messageTools: RuntimeTool[] = [
  {
    name: "send",
    definition: {
      type: "function",
      function: {
        name: "send",
        description:
          "Send a direct message to another agent_id. The IM storage (group) is created/selected automatically.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            to: { type: "string", description: "Target agent_id" },
            content: { type: "string", description: "Message content" },
          },
          required: ["to", "content"],
        },
      },
    },
    async execute(call, context) {
      const args = parseArgs<{ to?: string; content?: string }>(call.argumentsText);
      const to = (args.to ?? "").trim();
      const content = (args.content ?? "").trim();
      const missingTo = requireParam(to, "to");
      if (missingTo) return missingTo;
      const notUuid = requireUuid(to, "to", "Use list_agents to discover valid agent_ids.");
      if (notUuid) return notUuid;
      const missingContent = requireParam(content, "content");
      if (missingContent) return missingContent;

      const delivered = await store.sendDirectMessage({
        workspaceId: context.workspaceId,
        fromId: context.agentId,
        toId: to,
        content,
        contentType: "text",
        groupName: null,
        causedBy: context.triggerMessageId,
      });

      const directMembers = await store.listGroupMemberIds({ groupId: delivered.groupId });
      getWorkspaceUIBus().emit(context.workspaceId, {
        event: "ui.message.created",
        data: {
          workspaceId: context.workspaceId,
          groupId: delivered.groupId,
          memberIds: directMembers,
          message: { id: delivered.messageId, senderId: context.agentId, sendTime: delivered.sendTime },
        },
      });

      const toRole = await store.getAgentRole({ agentId: to }).catch(() => null);
      if (toRole && toRole !== "human") {
        context.ensureRunner(to);
        context.wakeAgent(to);
      }

      return { ok: true, ...delivered };
    },
  },
  {
    name: "send_group_message",
    definition: {
      type: "function",
      function: {
        name: "send_group_message",
        description: "Send a message to a group.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            groupId: { type: "string" },
            content: { type: "string" },
            contentType: { type: "string" },
          },
          required: ["groupId", "content"],
        },
      },
    },
    async execute(call, context) {
      const args = parseArgs<{ groupId?: string; content?: string; contentType?: string }>(call.argumentsText);
      const groupId = (args.groupId ?? "").trim();
      const content = (args.content ?? "").trim();
      const missingGroup = requireParam(groupId, "groupId");
      if (missingGroup) return missingGroup;
      const notUuid = requireUuid(groupId, "groupId", "Use list_groups to find valid groupIds.");
      if (notUuid) return notUuid;
      const missingContent = requireParam(content, "content");
      if (missingContent) return missingContent;

      const members = await store.listGroupMemberIds({ groupId });
      const denied = requireGroupMembership(members, context.agentId);
      if (denied) return denied;

      const activePhase = await store.getActiveWorkflowPhase({ groupId });

      const result = await store.sendMessage({
        groupId,
        senderId: context.agentId,
        content,
        contentType: args.contentType ?? "text",
        phaseId: activePhase?.id,
        causedBy: context.triggerMessageId,
      });

      getWorkspaceUIBus().emit(context.workspaceId, {
        event: "ui.message.created",
        data: {
          workspaceId: context.workspaceId,
          groupId,
          memberIds: members,
          message: { id: result.id, senderId: context.agentId, sendTime: result.sendTime },
        },
      });

      for (const memberId of members) {
        if (memberId === context.agentId) continue;
        const role = await store.getAgentRole({ agentId: memberId }).catch(() => null);
        if (role === "human" || role === null) continue;
        context.ensureRunner(memberId);
        context.wakeAgent(memberId);
      }

      return { ok: true, ...result };
    },
  },
  {
    name: "send_direct_message",
    definition: {
      type: "function",
      function: {
        name: "send_direct_message",
        description:
          "Send a direct message to another agent. Creates or reuses a P2P group and returns the channel type.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            toAgentId: { type: "string" },
            content: { type: "string" },
            contentType: { type: "string" },
          },
          required: ["toAgentId", "content"],
        },
      },
    },
    async execute(call, context) {
      const args = parseArgs<{ toAgentId?: string; content?: string; contentType?: string }>(call.argumentsText);
      const toAgentId = (args.toAgentId ?? "").trim();
      const content = (args.content ?? "").trim();
      const missingTo = requireParam(toAgentId, "toAgentId");
      if (missingTo) return missingTo;
      const notUuid = requireUuid(toAgentId, "toAgentId", "Use list_agents to discover valid agent_ids.");
      if (notUuid) return notUuid;
      const missingContent = requireParam(content, "content");
      if (missingContent) return missingContent;

      const delivered = await store.sendDirectMessage({
        workspaceId: context.workspaceId,
        fromId: context.agentId,
        toId: toAgentId,
        content,
        contentType: args.contentType ?? "text",
        groupName: null,
        causedBy: context.triggerMessageId,
      });
      const groupId = delivered.groupId;
      const channel = delivered.channel;
      const directMembers = await store.listGroupMemberIds({ groupId });
      getWorkspaceUIBus().emit(context.workspaceId, {
        event: "ui.message.created",
        data: {
          workspaceId: context.workspaceId,
          groupId,
          memberIds: directMembers,
          message: { id: delivered.messageId, senderId: context.agentId, sendTime: delivered.sendTime },
        },
      });

      context.ensureRunner(toAgentId);
      context.wakeAgent(toAgentId);

      return {
        ok: true,
        channel,
        groupId,
        messageId: delivered.messageId,
        sendTime: delivered.sendTime,
      };
    },
  },
  {
    name: "get_group_messages",
    definition: {
      type: "function",
      function: {
        name: "get_group_messages",
        description: "Fetch full message history for a group.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            groupId: { type: "string" },
          },
          required: ["groupId"],
        },
      },
    },
    async execute(call, context) {
      const args = parseArgs<{ groupId?: string }>(call.argumentsText);
      const groupId = (args.groupId ?? "").trim();
      const missing = requireParam(groupId, "groupId");
      if (missing) return missing;
      const notUuid = requireUuid(groupId, "groupId", "Use list_groups to find valid groupIds.");
      if (notUuid) return notUuid;
      const members = await store.listGroupMemberIds({ groupId });
      const denied = requireGroupMembership(members, context.agentId);
      if (denied) return denied;
      const messages = await store.listMessages({ groupId });
      return { ok: true, messages };
    },
  },
];
