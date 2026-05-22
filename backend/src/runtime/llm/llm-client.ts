import { AgentEventBus } from "../event-bus";
import { getLlmProvider } from "./config";
import { OpenRouterClient } from "./openrouter-client";
import { GlmClient } from "./glm-client";
import type { LlmClient } from "./types";

export type CreateLlmClientOptions = {
  bus: AgentEventBus;
  getTools: () => Promise<Array<Record<string, unknown>>>;
};

export function createLlmClient(opts: CreateLlmClientOptions): LlmClient {
  const provider = getLlmProvider();
  if (provider === "openrouter") {
    return new OpenRouterClient(opts.bus, opts.getTools);
  }
  return new GlmClient(opts.bus, opts.getTools);
}
