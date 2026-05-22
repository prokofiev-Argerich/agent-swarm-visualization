import { store } from "@/lib/storage";
import { getWorkspaceUIBus } from "../ui-bus";
import { parseArgs, requireParam, requireUuid, requireAllUuids, requireGroupMembership } from "./validate";
import type { RuntimeTool } from "./types";

export const groupTools: RuntimeTool[] = [
  {
    name: "list_groups",
    definition: {
      type: "function",
      function: {
        name: "list_groups",
        description: "List visible groups for this agent.",
        parameters: { type: "object", additionalProperties: false, properties: {} },
      },
    },
    async execute(_call, context) {
      const groups = await store.listGroups({ workspaceId: context.workspaceId, agentId: context.agentId });
      return { ok: true, groups };
    },
  },
  {
    name: "list_group_members",
    definition: {
      type: "function",
      function: {
        name: "list_group_members",
        description: "List member ids for a group.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            groupId: { type: "string", description: "Target group id" },
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
      return { ok: true, members };
    },
  },
  {
    name: "add_group_members",
    definition: {
      type: "function",
      function: {
        name: "add_group_members",
        description:
          "Add one or more agent members to an existing group. The caller must already be a member of the group.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            groupId: { type: "string", description: "Target group id" },
            memberIds: {
              type: "array",
              items: { type: "string" },
              description: "Agent ids to add to the group",
            },
          },
          required: ["groupId", "memberIds"],
        },
      },
    },
    async execute(call, context) {
      const args = parseArgs<{ groupId?: string; memberIds?: string[] }>(call.argumentsText);
      const groupId = (args.groupId ?? "").trim();
      const memberIds = (args.memberIds ?? []).map((id) => id.trim()).filter(Boolean);
      const missing = requireParam(groupId, "groupId");
      if (missing) return missing;
      const notUuid = requireUuid(groupId, "groupId", "Use list_groups to find valid groupIds.");
      if (notUuid) return notUuid;
      const invalidIds = requireAllUuids(memberIds, "memberIds");
      if (invalidIds) return invalidIds;
      const members = await store.listGroupMemberIds({ groupId });
      const denied = requireGroupMembership(members, context.agentId);
      if (denied) return denied;
      const toAdd = memberIds.filter((id) => !members.includes(id));
      if (toAdd.length === 0) {
        return { ok: true, added: [] };
      }
      await store.addGroupMembers({ groupId, userIds: toAdd });
      getWorkspaceUIBus().emit(context.workspaceId, {
        event: "ui.group.updated",
        data: { workspaceId: context.workspaceId, groupId, addedMembers: toAdd },
      });
      return { ok: true, added: toAdd };
    },
  },
  {
    name: "create_group",
    definition: {
      type: "function",
      function: {
        name: "create_group",
        description: "Create a group with the given member ids.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            memberIds: { type: "array", items: { type: "string" } },
            name: { type: "string" },
          },
          required: ["memberIds"],
        },
      },
    },
    async execute(call, context) {
      const args = parseArgs<{ memberIds?: string[]; name?: string }>(call.argumentsText);
      const memberIds = (args.memberIds ?? []).map((id) => id.trim()).filter(Boolean);
      if (memberIds.length < 2) {
        return { ok: false, error: "memberIds must have >= 2 members" };
      }
      const invalidIds = requireAllUuids(memberIds, "memberIds", "Use list_agents to discover valid agent_ids.");
      if (invalidIds) return invalidIds;
      const finalMemberIds = memberIds.includes(context.agentId) ? memberIds : [...memberIds, context.agentId];
      let groupId = "";
      let groupName: string | null = args.name ?? null;
      if (finalMemberIds.length === 2) {
        const existing = await store.findLatestExactP2PGroupId({
          workspaceId: context.workspaceId,
          memberA: finalMemberIds[0]!,
          memberB: finalMemberIds[1]!,
          preferredName: args.name ?? null,
        });
        groupId =
          (await store.mergeDuplicateExactP2PGroups({
            workspaceId: context.workspaceId,
            memberA: finalMemberIds[0]!,
            memberB: finalMemberIds[1]!,
            preferredName: args.name ?? null,
          })) ??
          (
            await store.createGroup({
              workspaceId: context.workspaceId,
              memberIds: finalMemberIds,
              name: args.name ?? undefined,
            })
          ).id;
        if (!existing) {
          getWorkspaceUIBus().emit(context.workspaceId, {
            event: "ui.group.created",
            data: { workspaceId: context.workspaceId, group: { id: groupId, name: groupName, memberIds: finalMemberIds } },
          });
        }
      } else {
        const created = await store.createGroup({ workspaceId: context.workspaceId, memberIds: finalMemberIds, name: args.name ?? undefined });
        groupId = created.id;
        groupName = created.name;
        getWorkspaceUIBus().emit(context.workspaceId, {
          event: "ui.group.created",
          data: { workspaceId: context.workspaceId, group: { id: groupId, name: groupName, memberIds: finalMemberIds } },
        });
      }
      return { ok: true, groupId, name: groupName };
    },
  },
];
