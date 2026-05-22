export type UUID = string;

export type HistoryMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string;
      tool_calls?: unknown;
      reasoning_content?: string;
    }
  | { role: "tool"; content: string; tool_call_id?: string; name?: string };

export type ToolCall = {
  index: number;
  id?: string;
  name?: string;
  argumentsText: string;
};

export const SEND_TOOL_NAMES = new Set(["send", "send_group_message", "send_direct_message"]);
