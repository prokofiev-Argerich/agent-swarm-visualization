import { store } from "@/lib/storage";
import { parseArgs, requireParam } from "./validate";
import type { RuntimeTool } from "./types";

export const workflowTools: RuntimeTool[] = [
  {
    name: "start_phase",
    definition: {
      type: "function",
      function: {
        name: "start_phase",
        description:
          "Start a workflow phase in a group. Subsequent messages in this group are automatically tagged with the phase.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            groupId: { type: "string", description: "Target group id" },
            type: {
              type: "string",
              description: "Phase type: prd_parse, independent_review, full_mesh_round_1, conflict_resolution, draft_plan, human_gate, execution, testing, summary",
            },
            title: { type: "string", description: "Human-readable phase title" },
          },
          required: ["groupId", "type", "title"],
        },
      },
    },
    async execute(call, context) {
      const args = parseArgs<{ groupId?: string; type?: string; title?: string }>(call.argumentsText);
      const groupId = (args.groupId ?? "").trim();
      const phaseType = (args.type ?? "").trim();
      const title = (args.title ?? phaseType).trim();
      const missingGroup = requireParam(groupId, "groupId");
      if (missingGroup) return missingGroup;
      const missingType = requireParam(phaseType, "type");
      if (missingType) return missingType;

      const active = await store.getActiveWorkflowPhase({ groupId });
      if (active) {
        return {
          ok: false,
          error: "An active phase already exists. Call end_phase before starting a new phase.",
          activePhaseId: active.id,
          activePhaseType: active.type,
          activePhaseName: active.name,
        };
      }

      const phase = await store.createWorkflowPhase({
        groupId,
        name: title,
        type: phaseType,
      });

      await store.sendMessage({
        groupId,
        senderId: context.agentId,
        content: `Phase started: **${title}** (${phaseType})`,
        contentType: "phase_start",
        phaseId: phase.id,
        causedBy: context.triggerMessageId,
      });

      return { ok: true, phaseId: phase.id, type: phaseType, title };
    },
  },
  {
    name: "end_phase",
    definition: {
      type: "function",
      function: {
        name: "end_phase",
        description:
          "End the active phase in a group and generate a summary. Returns the phase summary id.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            groupId: { type: "string", description: "Target group id" },
            summary: { type: "string", description: "Brief summary of what happened in this phase" },
            decisions: { type: "number", description: "Number of decisions made in this phase" },
            conflicts: { type: "number", description: "Number of conflicts found" },
            openQuestions: { type: "number", description: "Number of unresolved open questions" },
          },
          required: ["groupId", "summary"],
        },
      },
    },
    async execute(call, context) {
      const args = parseArgs<{
        groupId?: string;
        summary?: string;
        decisions?: number;
        conflicts?: number;
        openQuestions?: number;
      }>(call.argumentsText);
      const groupId = (args.groupId ?? "").trim();
      const summary = (args.summary ?? "").trim();
      const missingGroup = requireParam(groupId, "groupId");
      if (missingGroup) return missingGroup;
      const missingSummary = requireParam(summary, "summary");
      if (missingSummary) return missingSummary;

      const active = await store.getActiveWorkflowPhase({ groupId });
      if (!active) {
        return { ok: false, error: "No active phase to end" };
      }

      await store.endWorkflowPhase({ phaseId: active.id });

      const page = await store.listGroupMessagesPaged({
        groupId,
        phaseId: active.id,
        limit: 200,
      });
      const messageCount = page.messages.length;
      const agentSet = new Set(page.messages.map((m) => m.senderId));

      const phaseSummary = await store.createPhaseSummary({
        groupId,
        phaseId: active.id,
        title: active.name,
        summary,
        messageCount,
        agents: Array.from(agentSet),
        conflicts: args.conflicts ?? 0,
        decisions: args.decisions ?? 0,
        openQuestions: args.openQuestions ?? 0,
        createdByAgentId: context.agentId,
      });

      await store.sendMessage({
        groupId,
        senderId: context.agentId,
        content: `Phase completed: **${active.name}**\n\n${summary}\n\n${messageCount} msgs · ${agentSet.size} agents · ${args.decisions ?? 0} decisions · ${args.conflicts ?? 0} conflicts`,
        contentType: "phase_summary",
        phaseId: active.id,
        causedBy: context.triggerMessageId,
      });

      return { ok: true, phaseId: active.id, summaryId: phaseSummary.id };
    },
  },
];
