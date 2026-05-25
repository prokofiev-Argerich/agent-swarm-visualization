export type WakeReason =
  | "manual"
  | "group_message"
  | "direct_message"
  | "context_stream";

export type WakeAgentInput = {
  agentId: string;
  reason: WakeReason;
};

export type WakeGroupInput = {
  groupId: string;
  senderId: string;
};
