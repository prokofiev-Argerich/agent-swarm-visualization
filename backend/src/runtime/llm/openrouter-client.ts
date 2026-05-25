import { AgentEventBus } from "../event-bus";
import { getOpenRouterConfig } from "./config";
import { emitLlmStart, processStreamResponse, type StreamHandlerContext } from "./stream-events";
import type { HistoryMessage } from "../types";
import type { LlmClient, LlmStreamResult, LlmStreamContext } from "./types";
import type { RuntimeEventSink, RuntimeLogger } from "../ports";

function mapOpenRouterMessages(history: HistoryMessage[]): Array<Record<string, unknown>> {
  return history.map((msg) => {
    if (msg.role === "tool") return msg;

    const mapped: Record<string, unknown> = { ...msg };

    if (msg.role === "assistant" && msg.reasoning_content) {
      mapped.reasoning_content = msg.reasoning_content;
      mapped.reasoning = msg.reasoning_content;
    }

    return mapped;
  });
}

export class OpenRouterClient implements LlmClient {
  constructor(
    private readonly bus: AgentEventBus,
    private readonly getTools: () => Promise<Array<Record<string, unknown>>>,
    private readonly eventSink: RuntimeEventSink,
    private readonly logger: RuntimeLogger,
  ) {}

  async streamChat(history: HistoryMessage[], ctx: LlmStreamContext): Promise<LlmStreamResult> {
    const config = getOpenRouterConfig();

    const streamCtx: StreamHandlerContext = {
      agentId: ctx.agentId,
      workspaceId: ctx.workspaceId,
      groupId: ctx.groupId,
      round: ctx.round,
      bus: this.bus,
      eventSink: this.eventSink,
      logger: this.logger,
    };

    emitLlmStart(streamCtx);

    const tools = await this.getTools();
    const payload: Record<string, unknown> = {
      messages: mapOpenRouterMessages(history),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (config.model) payload.model = config.model;
    if (tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    };
    if (config.httpReferer) headers["HTTP-Referer"] = config.httpReferer;
    if (config.appTitle) headers["X-Title"] = config.appTitle;

    const requestBody = JSON.stringify(payload);
    this.logger.llmRequestRaw?.({ agentId: ctx.agentId, body: requestBody });

    const upstream = await fetch(config.baseUrl, {
      method: "POST",
      headers,
      body: requestBody,
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      throw new Error(`OpenRouter upstream error: ${upstream.status} ${text}`);
    }

    return processStreamResponse(upstream.body, streamCtx);
  }
}
