import { appendAgentStreamEvent, appendAgentHistorySnapshot, appendAgentLlmRequestRaw } from "../agent-logger";
import type { RuntimeLogger } from "../ports";

export const agentFileLogger: RuntimeLogger = {
  stream(input) {
    void appendAgentStreamEvent({
      agentId: input.agentId,
      round: input.round,
      kind: input.kind as Parameters<typeof appendAgentStreamEvent>[0]["kind"],
      delta: input.delta,
      error: input.error,
      finishReason: input.finishReason,
      tool_call_id: input.tool_call_id,
      tool_call_name: input.tool_call_name,
    });
  },
  historySnapshot(input) {
    void appendAgentHistorySnapshot({
      agentId: input.agentId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      history: input.history as Parameters<typeof appendAgentHistorySnapshot>[0]["history"],
    });
  },
  llmRequestRaw(input) {
    void appendAgentLlmRequestRaw({
      agentId: input.agentId,
      body: input.body,
    });
  },
};
