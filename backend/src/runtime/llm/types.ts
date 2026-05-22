import type { UUID, ToolCall } from "../types";

export type LlmStreamContext = {
  agentId: UUID;
  workspaceId: UUID;
  groupId: UUID;
  round: number;
};

export type LlmStreamResult = {
  assistantText: string;
  assistantThinking: string;
  toolCalls: ToolCall[];
  finishReason?: string | null;
};

export interface LlmClient {
  streamChat(history: import("../types").HistoryMessage[], ctx: LlmStreamContext): Promise<LlmStreamResult>;
}
