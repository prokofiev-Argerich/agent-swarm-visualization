import type { UUID, ToolCall } from "../types";
import type { AgentEventBus } from "../event-bus";

export type ToolResult = { ok: boolean; error?: string; [key: string]: unknown };

export type ToolContext = {
  agentId: UUID;
  workspaceId: UUID;
  groupId: UUID;
  currentGroupId: UUID | null;
  triggerMessageId?: UUID;
  bus: AgentEventBus;
  ensureRunner(agentId: UUID): void;
  wakeAgent(agentId: UUID): void;
};

export interface RuntimeTool {
  name: string;
  definition: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
  execute(call: ToolCall, context: ToolContext): Promise<ToolResult>;
}
