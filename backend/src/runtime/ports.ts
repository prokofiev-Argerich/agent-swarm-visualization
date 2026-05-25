export type RuntimeUIEvent = {
  workspaceId: string;
  event: string;
  data: Record<string, unknown>;
};

export interface RuntimeEventSink {
  emit(event: RuntimeUIEvent): void | Promise<void>;
}

export interface RuntimeLogger {
  stream(input: {
    agentId: string;
    round?: number;
    kind: string;
    delta?: string;
    error?: string;
    finishReason?: string | null;
    tool_call_id?: string;
    tool_call_name?: string;
  }): void | Promise<void>;

  historySnapshot(input: {
    agentId: string;
    workspaceId: string;
    groupId: string;
    history: unknown[];
  }): void | Promise<void>;

  llmRequestRaw?(input: {
    agentId: string;
    body: string;
  }): void | Promise<void>;
}
