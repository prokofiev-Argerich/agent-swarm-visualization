"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPaths } from "@/lib/api-paths";
import { api } from "../utils";
import type { Group, Message, PhaseSummary, WorkspaceDefaults } from "../types";

export function useMessages(args: {
  session: WorkspaceDefaults | null;
  activeGroupId: string | null;
  refreshGroups: (s: WorkspaceDefaults, opts?: { silent?: boolean }) => Promise<void>;
  setStatus: (s: "boot" | "groups" | "messages" | "send" | "idle") => void;
}) {
  const { session, activeGroupId, refreshGroups, setStatus } = args;

  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [phaseSummaries, setPhaseSummaries] = useState<PhaseSummary[]>([]);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [phaseMessages, setPhaseMessages] = useState<Record<string, Message[]>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [activePhaseId] = useState<string | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadPhaseSummaries = useCallback(async (groupId: string) => {
    try {
      const { phases } = await api<{ phases: PhaseSummary[] }>(
        apiPaths.phaseSummaries(groupId)
      );
      setPhaseSummaries(phases);
    } catch {
      setPhaseSummaries([]);
    }
  }, []);

  const loadInitialMessages = useCallback(
    async (
      s: WorkspaceDefaults,
      groupId: string,
      opts?: { markRead?: boolean; silent?: boolean; skipGroupRefresh?: boolean }
    ) => {
      if (!opts?.silent) setStatus("messages");
      const result = await api<{
        messages: Message[];
        hasMore: boolean;
        nextCursor: string | null;
      }>(
        apiPaths.groupMessages(groupId, {
          markRead: opts?.markRead ?? true,
          readerId: s.humanAgentId,
          limit: 50,
        })
      );
      // eslint-disable-next-line no-console
      console.log("[loadInitialMessages]", {
        groupId,
        count: result.messages.length,
        senders: result.messages.map((m) =>
          ({ id: m.id.slice(0, 8), senderId: m.senderId.slice(0, 8), contentType: m.contentType })),
      });
      setMessages(result.messages);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      setExpandedPhases(new Set());
      setPhaseMessages({});
      if (!opts?.silent) setStatus("idle");
      if (!opts?.skipGroupRefresh) {
        void refreshGroups(s, { silent: opts?.silent });
      }
      void loadPhaseSummaries(groupId);
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    },
    [refreshGroups, loadPhaseSummaries, setStatus]
  );

  const refreshMessages = useCallback(
    async (
      s: WorkspaceDefaults,
      groupId: string,
      opts?: { markRead?: boolean; silent?: boolean; skipGroupRefresh?: boolean }
    ) => {
      if (!opts?.silent) setStatus("messages");
      const result = await api<{
        messages: Message[];
        hasMore: boolean;
        nextCursor: string | null;
      }>(
        apiPaths.groupMessages(groupId, {
          markRead: opts?.markRead ?? true,
          readerId: s.humanAgentId,
          limit: 50,
        })
      );
      // Merge: keep existing messages, add new ones by id
      // eslint-disable-next-line no-console
      console.log("[refreshMessages]", {
        groupId,
        returnedCount: result.messages.length,
        senders: result.messages.map((m) => ({ id: m.id.slice(0, 8), senderId: m.senderId.slice(0, 8), contentType: m.contentType })),
      });
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMsgs = result.messages.filter((m) => !existingIds.has(m.id));
        // eslint-disable-next-line no-console
        console.log("[refreshMessages:merge]", { existing: prev.length, new: newMsgs.length });
        return [...prev, ...newMsgs];
      });
      if (!opts?.silent) setStatus("idle");
      if (!opts?.skipGroupRefresh) {
        void refreshGroups(s, { silent: opts?.silent });
      }
      void loadPhaseSummaries(groupId);
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    },
    [refreshGroups, loadPhaseSummaries, setStatus]
  );

  const loadOlderMessages = useCallback(async () => {
    if (!session || !activeGroupId || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await api<{
        messages: Message[];
        hasMore: boolean;
        nextCursor: string | null;
      }>(
        apiPaths.groupMessages(activeGroupId, {
          limit: 50,
          before: nextCursor,
        })
      );
      // Prepend older messages, maintain scroll position
      const container = messagesContainerRef.current;
      const prevHeight = container?.scrollHeight ?? 0;
      setMessages((prev) => [...result.messages, ...prev]);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      // restore scroll position after prepend
      requestAnimationFrame(() => {
        if (container) {
          const newHeight = container.scrollHeight;
          container.scrollTop = newHeight - prevHeight;
        }
      });
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false);
    }
  }, [activeGroupId, loadingOlder, nextCursor, session]);

  const loadPhaseMessages = useCallback(
    async (phaseId: string) => {
      if (!activeGroupId) return;
      const result = await api<{
        messages: Message[];
        hasMore: boolean;
        nextCursor: string | null;
      }>(
        apiPaths.groupMessages(activeGroupId, {
          limit: 100,
          phaseId,
        })
      );
      setPhaseMessages((prev) => ({ ...prev, [phaseId]: result.messages }));
    },
    [activeGroupId]
  );

  const togglePhaseExpand = useCallback(
    (phaseId: string) => {
      setExpandedPhases((prev) => {
        const next = new Set(prev);
        if (next.has(phaseId)) {
          next.delete(phaseId);
        } else {
          next.add(phaseId);
          void loadPhaseMessages(phaseId);
        }
        return next;
      });
    },
    [loadPhaseMessages]
  );

  // Load messages when activeGroupId changes
  useEffect(() => {
    if (!activeGroupId || !session) return;
    void loadInitialMessages(session, activeGroupId, { markRead: true }).catch((e) =>
      console.error(e)
    );
  }, [activeGroupId, loadInitialMessages, session]);

  // Scroll handler for loading older messages
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      if (container.scrollTop < 80 && hasMore && !loadingOlder) {
        void loadOlderMessages();
      }
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [hasMore, loadingOlder, loadOlderMessages]);

  return {
    messages,
    setMessages,
    hasMore,
    nextCursor,
    loadingOlder,
    phaseSummaries,
    expandedPhases,
    phaseMessages,
    activePhaseId,
    loadInitialMessages,
    refreshMessages,
    loadOlderMessages,
    togglePhaseExpand,
    messagesContainerRef,
    bottomRef,
  };
}
