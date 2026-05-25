import { store } from "@/lib/storage";
import type { UUID } from "../types";
import type { WakeAgentInput, WakeGroupInput, WakeReason } from "./wake-types";

export class AgentWakeScheduler {
  constructor(
    private readonly ensureRunner: (agentId: UUID) => void,
    private readonly wakeup: (agentId: UUID, reason: WakeReason) => void
  ) {}

  async wakeAgentsForGroup(input: WakeGroupInput) {
    const memberIds = await store.listGroupMemberIds({ groupId: input.groupId });

    for (const memberId of memberIds) {
      if (memberId === input.senderId) continue;
      const role = await store.getAgentRole({ agentId: memberId }).catch(() => null);
      if (role === "human" || role === null) continue;
      this.wakeup(memberId, "group_message");
    }
  }

  async wakeAgent(input: WakeAgentInput) {
    const role = await store.getAgentRole({ agentId: input.agentId }).catch(() => null);
    if (role === "human" || role === null) return;
    this.wakeup(input.agentId, input.reason);
  }
}
