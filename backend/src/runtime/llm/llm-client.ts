import { AgentEventBus } from "../event-bus";
import { getLlmProvider } from "./config";
import { OpenRouterClient } from "./openrouter-client";
import { GlmClient } from "./glm-client";
import type { LlmClient } from "./types";
import type { RuntimeEventSink, RuntimeLogger } from "../ports";

export type CreateLlmClientOptions = {
  bus: AgentEventBus;
  getTools: () => Promise<Array<Record<string, unknown>>>;
  eventSink: RuntimeEventSink;
  logger: RuntimeLogger;
};

export function createLlmClient(opts: CreateLlmClientOptions): LlmClient {
  const provider = getLlmProvider();
  if (provider === "openrouter") {
    return new OpenRouterClient(opts.bus, opts.getTools, opts.eventSink, opts.logger);
  }
  return new GlmClient(opts.bus, opts.getTools, opts.eventSink, opts.logger);
}
