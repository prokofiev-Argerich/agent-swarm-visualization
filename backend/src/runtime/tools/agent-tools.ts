import { store } from "@/lib/storage";
import { getWorkspaceUIBus } from "../ui-bus";
import { parseArgs, requireParam } from "./validate";
import type { RuntimeTool } from "./types";

export const agentTools: RuntimeTool[] = [
  {
    name: "create",
    definition: {
      type: "function",
      function: {
        name: "create",
        description:
          "Create a sub-agent with the given role for delegation. Returns {agentId}.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            role: {
              type: "string",
              description: "Role name for the new agent, e.g. coder/researcher/reviewer",
            },
            guidance: {
              type: "string",
              description: "Extra system guidance to seed the new agent.",
            },
          },
          required: ["role"],
        },
      },
    },
    async execute(call, context) {
      const args = parseArgs<{ role?: string; guidance?: string }>(call.argumentsText);
      const role = (args.role ?? "").trim();
      const guidance = (args.guidance ?? "").trim();
      const missing = requireParam(role, "role");
      if (missing) return missing;

      const created = await store.createSubAgentWithP2P({
        workspaceId: context.workspaceId,
        creatorId: context.agentId,
        role,
        guidance,
        collaborationGroupId: context.currentGroupId ?? undefined,
      });
      context.ensureRunner(created.agentId);
      getWorkspaceUIBus().emit(context.workspaceId, {
        event: "ui.agent.created",
        data: { workspaceId: context.workspaceId, agent: { id: created.agentId, role, parentId: context.agentId } },
      });
      if (created.collaborationGroupId) {
        getWorkspaceUIBus().emit(context.workspaceId, {
          event: "ui.group.updated",
          data: { workspaceId: context.workspaceId, groupId: created.collaborationGroupId, addedMembers: [created.agentId] },
        });
      }
      return { ok: true, agentId: created.agentId, role, groupId: created.groupId };
    },
  },
  {
    name: "list_agents",
    definition: {
      type: "function",
      function: {
        name: "list_agents",
        description: "List all agents in the current workspace (ids + roles).",
        parameters: { type: "object", additionalProperties: false, properties: {} },
      },
    },
    async execute(_call, context) {
      const agents = await store.listAgentsMeta({ workspaceId: context.workspaceId });
      return { ok: true, agents };
    },
  },
];
