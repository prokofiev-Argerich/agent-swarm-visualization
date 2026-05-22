import { AgentEventBus } from "../event-bus";
import { getGlmConfig } from "./config";
import { emitLlmStart, processStreamResponse, type StreamHandlerContext } from "./stream-events";
import { appendAgentLlmRequestRaw } from "../agent-logger";
import type { HistoryMessage } from "../types";
import type { LlmClient, LlmStreamResult, LlmStreamContext } from "./types";

export class GlmClient implements LlmClient {
  constructor(
    private readonly bus: AgentEventBus,
    private readonly getTools: () => Promise<Array<Record<string, unknown>>>
  ) {}

  async streamChat(history: HistoryMessage[], ctx: LlmStreamContext): Promise<LlmStreamResult> {
    const config = getGlmConfig();

    const streamCtx: StreamHandlerContext = {
      agentId: ctx.agentId,
      workspaceId: ctx.workspaceId,
      groupId: ctx.groupId,
      round: ctx.round,
      bus: this.bus,
    };

    emitLlmStart(streamCtx);

    const glmPayload: Record<string, unknown> = {
      model: config.model,
      messages: history,
      tools: await this.getTools(),
      tool_choice: "auto",
      stream: true,
      tool_stream: true,
    };
    const requestBody = JSON.stringify(glmPayload);
    void appendAgentLlmRequestRaw({ agentId: ctx.agentId, body: requestBody });

    const upstream = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      throw new Error(`GLM upstream error: ${upstream.status} ${text}`);
    }

    return processStreamResponse(upstream.body, streamCtx);
  }
}
