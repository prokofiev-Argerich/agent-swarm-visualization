export type LlmChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string;
      reasoning?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export type AssembledToolCall = {
  index: number;
  id?: string;
  name?: string;
  argumentsText: string;
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AssembledState = {
  reasoningContent: string;
  content: string;
  toolCalls: AssembledToolCall[];
  finishReason?: string | null;
  usage?: TokenUsage;
};
