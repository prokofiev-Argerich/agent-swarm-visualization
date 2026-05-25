"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiPaths } from "@/lib/api-paths";
import { api } from "../utils";
import type { AgentStreamEvent } from "../types";

export function useAgentStream(args: {
  streamAgentId: string | null;
  activeGroupIdRef: React.MutableRefObject<string | null>;
  onDone: () => void;
}) {
  const { streamAgentId, activeGroupIdRef, onDone } = args;
  const [contentStream, setContentStream] = useState("");
  const [reasoningStream, setReasoningStream] = useState("");
  const [toolStream, setToolStream] = useState("");
  const [llmHistory, setLlmHistory] = useState("");
  const [agentError, setAgentError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const streamAgentIdRef = useRef<string | null>(null);
  const toolCallBuffersRef = useRef<Map<string, string>>(new Map());
  const toolResultBuffersRef = useRef<Map<string, string>>(new Map());
  const llmHistoryReqIdRef = useRef(0);

  const formatLlmHistory = useCallback((raw: string) => {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }, []);

  const refreshLlmHistory = useCallback(
    async (agentId: string) => {
      const reqId = (llmHistoryReqIdRef.current += 1);
      try {
        const res = await api<{ llmHistory: string }>(`/api/agents/${agentId}`);
        if (reqId !== llmHistoryReqIdRef.current) return;
        setLlmHistory(res.llmHistory ?? "");
      } catch (e) {
        if (reqId !== llmHistoryReqIdRef.current) return;
        setLlmHistory(
          e instanceof Error ? `(failed to load llm_history: ${e.message})` : "(failed to load llm_history)"
        );
      }
    },
    []
  );

  const connectAgentStream = useCallback(
    (agentId: string) => {
      if (streamAgentIdRef.current === agentId && esRef.current) return;
      streamAgentIdRef.current = agentId;

      esRef.current?.close();
      setLlmHistory("");
      setContentStream("");
      setReasoningStream("");
      setToolStream("");
      setAgentError(null);
      toolCallBuffersRef.current = new Map();
      toolResultBuffersRef.current = new Map();

      const groupId = activeGroupIdRef.current;
      const es = new EventSource(
        apiPaths.agentContextStream(agentId, { groupId: groupId ?? undefined })
      );
      esRef.current = es;

      es.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data) as AgentStreamEvent;
          if (payload.event === "agent.stream") {
            const chunk = payload.data.delta;
            if (chunk) {
              if (payload.data.kind === "content") {
                setContentStream((t) => t + chunk);
              } else if (payload.data.kind === "reasoning") {
                setReasoningStream((t) => t + chunk);
              } else {
                const name = payload.data.tool_call_name ?? payload.data.tool_call_id ?? "tool_call";
                const key = payload.data.tool_call_id ?? name;
                const buffers =
                  payload.data.kind === "tool_result"
                    ? toolResultBuffersRef.current
                    : toolCallBuffersRef.current;
                const next = `${buffers.get(key) ?? ""}${chunk}`;
                buffers.set(key, next);
                const callLines = Array.from(toolCallBuffersRef.current.entries()).map(
                  ([id, value]) => `tool_calls[${id}]: ${value}`
                );
                const resultLines = Array.from(toolResultBuffersRef.current.entries()).map(
                  ([id, value]) => `tool_result[${id}]: ${value}`
                );
                setToolStream([...callLines, ...resultLines].join("\n\n"));
              }
            }
            return;
          }
          if (payload.event === "agent.wakeup") {
            setContentStream("");
            setReasoningStream("");
            setToolStream("");
            toolCallBuffersRef.current = new Map();
            toolResultBuffersRef.current = new Map();
            return;
          }
          if (payload.event === "agent.unread") {
            setContentStream("");
            setReasoningStream("");
            setToolStream("");
            toolCallBuffersRef.current = new Map();
            toolResultBuffersRef.current = new Map();
            return;
          }
          if (payload.event === "agent.done") {
            toolCallBuffersRef.current = new Map();
            toolResultBuffersRef.current = new Map();
            onDone();
            const doneAgentId = streamAgentIdRef.current;
            if (doneAgentId) void refreshLlmHistory(doneAgentId);
            return;
          }
          if (payload.event === "agent.error") {
            setAgentError(payload.data.message);
          }
        } catch {
          // ignore
        }
      };

      es.onerror = () => setAgentError("SSE disconnected");
    },
    [activeGroupIdRef, onDone, refreshLlmHistory]
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    if (!streamAgentId) return;
    connectAgentStream(streamAgentId);
    void refreshLlmHistory(streamAgentId);
  }, [streamAgentId, connectAgentStream, refreshLlmHistory]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    return () => esRef.current?.close();
  }, []);

  return {
    contentStream,
    reasoningStream,
    toolStream,
    llmHistory,
    agentError,
    setAgentError,
    refreshLlmHistory,
    connectAgentStream,
  };
}
