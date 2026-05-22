import { store } from "@/lib/storage";
import { getSkillLoader, formatSkillPrompt } from "../skill-loader";
import { parseArgs, requireParam } from "./validate";
import type { RuntimeTool } from "./types";

export const identityTools: RuntimeTool[] = [
  {
    name: "self",
    definition: {
      type: "function",
      function: {
        name: "self",
        description: "Return the current agent's identity (agent_id, workspace_id, role).",
        parameters: { type: "object", additionalProperties: false, properties: {} },
      },
    },
    async execute(_call, context) {
      const role = await store.getAgentRole({ agentId: context.agentId }).catch(() => null);
      return { ok: true, agentId: context.agentId, workspaceId: context.workspaceId, role };
    },
  },
  {
    name: "get_skill",
    definition: {
      type: "function",
      function: {
        name: "get_skill",
        description:
          "Load the full content of a specific skill by name (use when the skill metadata indicates relevance).",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            skill_name: { type: "string", description: "Skill name to retrieve" },
          },
          required: ["skill_name"],
        },
      },
    },
    async execute(call, _context) {
      const args = parseArgs<{ skill_name?: string; name?: string }>(call.argumentsText);
      const skillName = (args.skill_name ?? args.name ?? "").trim();
      const missing = requireParam(skillName, "skill_name");
      if (missing) return missing;

      const loader = await getSkillLoader();
      const skill = await loader.getSkill(skillName);
      if (!skill) {
        return { ok: false, error: `Unknown skill: ${skillName}`, available: await loader.listSkills() };
      }

      return { ok: true, content: formatSkillPrompt(skill) };
    },
  },
];
