import { store } from "@/lib/storage";
import { AgentEventBus } from "./event-bus";
import { AgentRunner } from "./agent-runner";
import type { UUID } from "./types";

export class AgentRuntime {
  private readonly runners = new Map<UUID, AgentRunner>();
  public readonly bus = new AgentEventBus();
  private bootstrapped = false;
  static readonly VERSION = 2;

  async bootstrap() {
    if (this.bootstrapped) return;
    this.bootstrapped = true;

    const agents = await store.listAgents();
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
      }
    );
    this.runners.set(agentId, runner);
    runner.start();
    return runner;
  }

  async wakeAgentsForGroup(groupId: UUID, senderId: UUID) {
    await this.bootstrap();
    const memberIds = await store.listGroupMemberIds({ groupId });

    for (const memberId of memberIds) {
      if (memberId === senderId) continue;
      const role = await store.getAgentRole({ agentId: memberId }).catch(() => null);
      if (role === "human" || role === null) continue;
      this.ensureRunner(memberId).wakeup("group_message");
    }
  }

  async wakeAgent(agentId: UUID, reason: "direct_message" | "context_stream" = "direct_message") {
    await this.bootstrap();
    const role = await store.getAgentRole({ agentId }).catch(() => null);
    if (role === "human" || role === null) return;
    this.ensureRunner(agentId).wakeup(reason);
  }

  async interruptAll(input?: { workspaceId?: UUID }) {
    await this.bootstrap();
    const workspaceId = input?.workspaceId?.trim();
    const agents = await store.listAgents(workspaceId ? { workspaceId } : undefined);
    const agentIds = agents.filter((agent) => agent.role !== "human").map((agent) => agent.id);

    for (const agentId of agentIds) {
      this.ensureRunner(agentId).requestInterrupt();
    }

    return { interrupted: agentIds.length, agentIds };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __swarmIdeRuntime: AgentRuntime | undefined;
  // eslint-disable-next-line no-var
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
