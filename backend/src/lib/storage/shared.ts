import { ensureSchemaOnce, isMissingTableError } from "@/db/ensure";

export type UUID = string;

export async function withSchemaRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
    await ensureSchemaOnce();
    return await fn();
  }
}

export function now() {
  return new Date();
}

export function uuid(): UUID {
  return crypto.randomUUID();
}

const PHASE_MANAGEMENT_ROLES = new Set([
  "orchestrator",
  "productmanager",
  "devlead",
  "pm",
]);

const PHASE_MANAGEMENT_GUIDANCE = [
  "## Phase Management",
  "",
  "You are responsible for managing workflow phases. Use start_phase and end_phase to track structured stages of work.",
  "",
  "### Phase types",
  "- prd_parse          — Parsing PRD / requirements document",
  "- independent_review  — Agents independently review before cross-review",
  "- full_mesh_round_1   — First full-mesh cross-review round",
  "- full_mesh_round_2   — Second full-mesh cross-review round",
  "- full_mesh_round_3   — Third full-mesh cross-review round",
  "- conflict_resolution — Resolving conflicts found in reviews",
  "- draft_plan         — Drafting the implementation plan",
  "- human_gate         — Waiting for human approval before execution",
  "- execution          — Executing the implementation plan",
  "- testing            — Running tests and validation",
  "- summary            — Final summary / wrap-up",
  "",
  "### Rules",
  "1. Only one active phase per group at a time. start_phase will reject if one is already active.",
  "2. Always call end_phase before starting a new phase.",
  "3. Before kicking off a multi-agent review, start independent_review.",
  "4. Before each Full Mesh round, start full_mesh_round_N.",
  "5. After each round, call end_phase with a summary including decisions, conflicts, and open questions.",
  "6. Before drafting a plan, start draft_plan.",
  "7. Before waiting for human confirmation, start human_gate.",
  "8. Before executing tasks, start execution.",
  "9. Before running tests, start testing.",
  "10. Do not leave active phases hanging — always close them when the stage completes.",
  "11. end_phase parameters: summary (required), decisions (number), conflicts (number), openQuestions (number).",
].join("\n");

export function initialAgentHistory(input: {
  agentId: UUID;
  workspaceId: UUID;
  role: string;
  guidance?: string;
}) {
  const content =
    `You are an agent in an IM system.\n` +
    `Your agent_id is: ${input.agentId}.\n` +
    `Your workspace_id is: ${input.workspaceId}.\n` +
    `Your role is: ${input.role}.\n` +
    `Act strictly as this role when replying. Be concise and helpful.\n` +
    `Your replies are NOT automatically delivered to humans.\n` +
    `To send messages, you MUST call tools like send_group_message or send_direct_message.\n` +
    `If you need to coordinate with other agents, you may use tools like self, list_agents, create, send, list_groups, list_group_members, create_group, send_group_message, send_direct_message, and get_group_messages.\n` +
    `If you need to read a file that was uploaded to this workspace, use the read_file tool with the fileId (never a filesystem path).`;

  const history: Array<{ role: "system"; content: string }> = [{ role: "system", content }];

  if (PHASE_MANAGEMENT_ROLES.has(input.role.toLowerCase())) {
    history.push({ role: "system", content: PHASE_MANAGEMENT_GUIDANCE });
  }

  const guidance = (input.guidance ?? "").trim();
  if (guidance) {
    history.push({
      role: "system",
      content: `Additional instructions:\n${guidance}`,
    });
  }
  return JSON.stringify(history);
}

export async function emitDbWrite(input: {
  workspaceId: UUID;
  table: string;
  action: "insert" | "update" | "delete";
  recordId?: UUID | null;
}) {
  try {
    const { getWorkspaceUIBus } = await import("@/runtime/ui-bus");
    getWorkspaceUIBus().emit(input.workspaceId, {
      event: "ui.db.write",
      data: {
        workspaceId: input.workspaceId,
        table: input.table,
        action: input.action,
        recordId: input.recordId ?? null,
      },
    });
  } catch {
    // best-effort only
  }
}
