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
