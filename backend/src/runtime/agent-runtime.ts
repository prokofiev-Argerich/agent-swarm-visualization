import { listAgents } from "@/services/agent-service";
import { AgentEventBus } from "./event-bus";
import { AgentRunner } from "./agent-runner";
import { AgentWakeScheduler } from "./scheduler/agent-wake-scheduler";
import { workspaceUIEventSink } from "./adapters/workspace-ui-event-sink";
import { agentFileLogger } from "./adapters/agent-file-logger";
import type { UUID } from "./types";

export class AgentRuntime {
  private readonly runners = new Map<UUID, AgentRunner>();
  public readonly bus = new AgentEventBus();
  private readonly scheduler: AgentWakeScheduler;
  private bootstrapped = false;
  static readonly VERSION = 2;

  constructor() {
    this.scheduler = new AgentWakeScheduler(
      (id) => this.ensureRunner(id),
      (id, reason) => this.ensureRunner(id).wakeup(reason)
    );
  }

  async bootstrap() {
    if (this.bootstrapped) return;
    this.bootstrapped = true;

    const agents = await listAgents();
    for (const a of agents) {
      if (a.role === "human") continue;
      this.ensureRunner(a.id);
    }
  }

  ensureRunner(agentId: UUID) {
    const existing = this.runners.get(agentId);
    if (existing) return existing;
    const runner = new AgentRunner(
      agentId,
      this.bus,
      (id) => {
        this.ensureRunner(id);
      },
      (id) => {
        this.ensureRunner(id).wakeup("manual");
      },
      workspaceUIEventSink,
      agentFileLogger,
    );
    this.runners.set(agentId, runner);
    runner.start();
    return runner;
  }

  async wakeAgentsForGroup(groupId: UUID, senderId: UUID) {
    await this.bootstrap();
    return this.scheduler.wakeAgentsForGroup({ groupId, senderId });
  }

  async wakeAgent(agentId: UUID, reason: "direct_message" | "context_stream" = "direct_message") {
    await this.bootstrap();
    return this.scheduler.wakeAgent({ agentId, reason });
  }

  async interruptAll(input?: { workspaceId?: UUID }) {
    await this.bootstrap();
    const workspaceId = input?.workspaceId?.trim();
    const agents = await listAgents(workspaceId ? { workspaceId } : undefined);
    const agentIds = agents.filter((agent) => agent.role !== "human").map((agent) => agent.id);

    for (const agentId of agentIds) {
      this.ensureRunner(agentId).requestInterrupt();
    }

    return { interrupted: agentIds.length, agentIds };
  }
}

declare global {
   
  var __swarmIdeRuntime: AgentRuntime | undefined;
   
  var __swarmIdeRuntimeVersion: number | undefined;
}

export function getAgentRuntime() {
  if (
    globalThis.__swarmIdeRuntime &&
    globalThis.__swarmIdeRuntimeVersion === AgentRuntime.VERSION
  ) {
    return globalThis.__swarmIdeRuntime;
  }

  globalThis.__swarmIdeRuntime = new AgentRuntime();
  globalThis.__swarmIdeRuntimeVersion = AgentRuntime.VERSION;
  return globalThis.__swarmIdeRuntime;
}
