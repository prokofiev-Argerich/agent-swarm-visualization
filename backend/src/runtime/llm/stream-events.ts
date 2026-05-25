import { StreamAssembler, parseSSEJsonLines } from "@/lib/llm";
import { store } from "@/lib/storage";
import { AgentEventBus } from "../event-bus";
import { extractToolCallDeltas } from "./tool-call-deltas";
import type { ToolCall, UUID } from "../types";
import type { LlmStreamResult } from "./types";
import type { RuntimeEventSink, RuntimeLogger } from "../ports";

export type StreamHandlerContext = {
  agentId: UUID;
  workspaceId: UUID;
  groupId: UUID;
  round: number;
  bus: AgentEventBus;
  eventSink: RuntimeEventSink;
  logger: RuntimeLogger;
};

export async function processStreamResponse(
  body: ReadableStream<Uint8Array>,
  ctx: StreamHandlerContext
): Promise<LlmStreamResult> {
  const assembler = new StreamAssembler();
  let prev = assembler.snapshot();
  let assistantText = "";
  let assistantThinking = "";

  for await (const evt of parseSSEJsonLines(body)) {
    const state = assembler.push(evt as any);

    const reasoningDelta = state.reasoningContent.slice(prev.reasoningContent.length);
    const contentDelta = state.content.slice(prev.content.length);
    const toolCallDeltas = extractToolCallDeltas(evt as any, prev, state);

    if (reasoningDelta) {
      assistantThinking += reasoningDelta;
      ctx.bus.emit(ctx.agentId, {
        event: "agent.stream",
        data: { kind: "reasoning", delta: reasoningDelta },
      });
      ctx.logger.stream({
        agentId: ctx.agentId,
        round: ctx.round,
        kind: "reasoning",
        delta: reasoningDelta,
      });
    }

    if (contentDelta) {
      assistantText += contentDelta;
      ctx.bus.emit(ctx.agentId, {
        event: "agent.stream",
        data: { kind: "content", delta: contentDelta },
      });
      ctx.logger.stream({
        agentId: ctx.agentId,
        round: ctx.round,
        kind: "content",
        delta: contentDelta,
      });
    }

    for (const delta of toolCallDeltas) {
      ctx.bus.emit(ctx.agentId, {
        event: "agent.stream",
        data: {
          kind: "tool_calls",
          delta: delta.delta,
          tool_call_id: delta.tool_call_id,
          tool_call_name: delta.tool_call_name,
        },
      });
      ctx.logger.stream({
        agentId: ctx.agentId,
        round: ctx.round,
        kind: "tool_calls",
        delta: delta.delta,
        tool_call_id: delta.tool_call_id,
        tool_call_name: delta.tool_call_name,
      });
    }

    prev = state;
  }

  // Emit done events
  ctx.bus.emit(ctx.agentId, {
    event: "agent.done",
    data: { finishReason: prev.finishReason ?? undefined },
  });
  ctx.logger.stream({
    agentId: ctx.agentId,
    round: ctx.round,
    kind: "done",
    finishReason: prev.finishReason ?? null,
  });
  ctx.eventSink.emit({
    workspaceId: ctx.workspaceId,
    event: "ui.agent.llm.done",
    data: {
      workspaceId: ctx.workspaceId,
      agentId: ctx.agentId,
      groupId: ctx.groupId,
      round: ctx.round,
      finishReason: prev.finishReason ?? undefined,
    },
  });

  const finalState = assembler.snapshot();

  if (finalState.usage && finalState.usage.totalTokens > 0) {
    try {
      await store.setGroupContextTokens({
        groupId: ctx.groupId,
        tokens: finalState.usage.totalTokens,
      });
    } catch {
      // Best effort
    }
  }

  return {
    assistantText,
    assistantThinking,
    toolCalls: (finalState.toolCalls ?? []) as ToolCall[],
    finishReason: finalState.finishReason,
  };
}

export function emitLlmStart(ctx: StreamHandlerContext) {
  ctx.eventSink.emit({
    workspaceId: ctx.workspaceId,
    event: "ui.agent.llm.start",
    data: {
      workspaceId: ctx.workspaceId,
      agentId: ctx.agentId,
      groupId: ctx.groupId,
      round: ctx.round,
    },
  });
  ctx.logger.stream({
    agentId: ctx.agentId,
    round: ctx.round,
    kind: "start",
  });
}
