"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentStatus } from "@/lib/agent-status";
import type { Group, UiStreamEvent, UUID, VizBeam, VizDebugEntry, VizEvent, WorkspaceDefaults } from "../types";

export function useUiStream(args: {
  session: WorkspaceDefaults | null;
  activeGroupIdRef: React.MutableRefObject<string | null>;
  groupsRef: React.MutableRefObject<Group[]>;
  agentRoleByIdRef: React.MutableRefObject<Map<string, string>>;
  refreshMessages: (s: WorkspaceDefaults, groupId: string, opts?: { markRead?: boolean; silent?: boolean; skipGroupRefresh?: boolean }) => Promise<void>;
  scheduleWorkspaceRefresh: () => void;
  refreshFiles: (s: WorkspaceDefaults) => Promise<void>;
}) {
  const { session, activeGroupIdRef, groupsRef, agentRoleByIdRef, refreshMessages, scheduleWorkspaceRefresh, refreshFiles } = args;
  const [vizEvents, setVizEvents] = useState<VizEvent[]>([]);
  const [vizBeams, setVizBeams] = useState<VizBeam[]>([]);
  const [vizDebug, setVizDebug] = useState<VizDebugEntry[]>([]);
  const [agentStatusById, setAgentStatusById] = useState<Record<string, AgentStatus>>({});
  const [upstreamToast, setUpstreamToast] = useState<string | null>(null);
  const uiEsRef = useRef<EventSource | null>(null);
  const beamTimeoutsRef = useRef<number[]>([]);

  const pushVizEvent = useCallback(
    (event: UiStreamEvent, label: string, kind: VizEvent["kind"]) => {
      const at = typeof event.at === "number" ? event.at : Date.now();
      const id = `${event.id ?? at}-${Math.random().toString(16).slice(2)}`;
      setVizEvents((prev) => [...prev, { id, kind, label, at }].slice(-20));
    },
    []
  );

  const pushBeam = useCallback((beam: Omit<VizBeam, "id" | "createdAt">) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const createdAt = Date.now();
    setVizBeams((prev) => [...prev, { ...beam, id, createdAt }].slice(-12));
    const timeoutId = window.setTimeout(() => {
      setVizBeams((prev) => prev.filter((b) => b.id !== id));
    }, 2400);
    beamTimeoutsRef.current.push(timeoutId);
  }, []);

  const logVizDebug = useCallback((entry: Omit<VizDebugEntry, "id" | "at">) => {
    const record: VizDebugEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: Date.now(),
    };
    setVizDebug((prev) => [...prev, record].slice(-200));
    if (typeof window !== "undefined") {
      (window as any).__imVizDebug = (window as any).__imVizDebug ?? [];
      (window as any).__imVizDebug.push(record);
       
      console.debug("[im-viz]", record);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    uiEsRef.current?.close();
    const es = new EventSource(`/api/ui-stream?workspaceId=${encodeURIComponent(session.workspaceId)}`);
    uiEsRef.current = es;

    es.onmessage = (evt) => {
      let payload: UiStreamEvent | null = null;
      try {
        payload = JSON.parse(evt.data) as UiStreamEvent;
      } catch {
        payload = null;
      }
      if (payload) {
        if (payload.event === "ui.agent.created") {
          const role = payload.data?.agent?.role ?? "agent";
          const agentId = payload.data?.agent?.id as UUID | undefined;
          const parentId = payload.data?.agent?.parentId as UUID | null | undefined;
          pushVizEvent(payload, `创建 ${role}`, "agent");
          if (agentId) {
            const fromId = parentId || session!.humanAgentId;
            pushBeam({ fromId, toId: agentId, kind: "create", label: role });
          }
          if (agentId) {
            setAgentStatusById((prev) => ({ ...prev, [agentId]: "IDLE" }));
          }
        } else if (payload.event === "ui.message.created") {
          const senderId = payload.data?.message?.senderId as UUID | undefined;
          const groupId = payload.data?.groupId as UUID | undefined;
          const senderRole = senderId
            ? agentRoleByIdRef.current.get(senderId) ?? senderId.slice(0, 6)
            : "unknown";
          pushVizEvent(payload, `消息: ${senderRole}`, "message");
          logVizDebug({
            type: "message_event",
            data: {
              messageId: payload.data?.message?.id,
              groupId,
              senderId,
              senderRole,
              hasGroup: !!groupsRef.current.find((g) => g.id === groupId),
            },
          });
          if (senderId && groupId) {
            const payloadMembers = Array.isArray(payload.data?.memberIds) ? payload.data.memberIds : null;
            const groupMembers =
              payloadMembers ??
              groupsRef.current.find((g) => g.id === groupId)?.memberIds ??
              [];
            const targetIds = groupMembers.filter((id: UUID) => id !== senderId);
            if (targetIds.length === 0) {
              logVizDebug({
                type: "beam_skipped",
                data: { reason: "no_targets", groupId, senderId },
              });
            } else {
              targetIds.forEach((targetId) => {
                pushBeam({ fromId: senderId, toId: targetId, kind: "message" });
                logVizDebug({
                  type: "beam_created",
                  data: { groupId, senderId, targetId },
                });
              });
            }
          }
           
          console.log("[ui.message.created]", {
            groupId,
            activeGroupId: activeGroupIdRef.current,
            match: groupId === activeGroupIdRef.current,
            hasSession: !!session,
            senderId,
            messageId: payload.data?.message?.id,
          });
          if (groupId === activeGroupIdRef.current && session) {
            void refreshMessages(session, groupId, {
              markRead: false,
              silent: true,
              skipGroupRefresh: true,
            });
          }
        } else if (payload.event === "ui.agent.llm.start" || payload.event === "ui.agent.llm.done") {
          const agentId = payload.data?.agentId as UUID | undefined;
          const role = agentId
            ? agentRoleByIdRef.current.get(agentId) ?? agentId.slice(0, 6)
            : "agent";
          const label = payload.event === "ui.agent.llm.start" ? `LLM 开始: ${role}` : `LLM 结束: ${role}`;
          pushVizEvent(payload, label, "llm");
          if (agentId) {
            setAgentStatusById((prev) => ({
              ...prev,
              [agentId]: payload.event === "ui.agent.llm.start" ? "BUSY" : "IDLE",
            }));
          }
        } else if (
          payload.event === "ui.agent.tool_call.start" ||
          payload.event === "ui.agent.tool_call.done"
        ) {
          const agentId = payload.data?.agentId as UUID | undefined;
          const toolName = payload.data?.toolName ?? "tool";
          const role = agentId
            ? agentRoleByIdRef.current.get(agentId) ?? agentId.slice(0, 6)
            : "agent";
          const label =
            payload.event === "ui.agent.tool_call.start"
              ? `工具开始: ${role} · ${toolName}`
              : `工具结束: ${role} · ${toolName}`;
          pushVizEvent(payload, label, "tool");
          if (agentId) {
            setAgentStatusById((prev) => ({
              ...prev,
              [agentId]: payload.event === "ui.agent.tool_call.start" ? "BUSY" : "IDLE",
            }));
          }
        } else if (payload.event === "ui.agent.interrupt_all") {
          pushVizEvent(payload, "停止全部 Agent", "agent");
          const ids = Array.isArray(payload.data?.agentIds)
            ? (payload.data.agentIds as UUID[])
            : [];
          setAgentStatusById((prev) => {
            const next = { ...prev };
            const targetIds = ids.length > 0 ? ids : Object.keys(next);
            for (const id of targetIds) {
              next[id] = "IDLE";
            }
            return next;
          });
        } else if (payload.event === "ui.agent.error") {
          const agentId = payload.data?.agentId as UUID | undefined;
          if (agentId) {
            const role = agentRoleByIdRef.current.get(agentId) ?? agentId.slice(0, 8);
            const msg = String(payload.data?.message ?? "").slice(0, 120);
            pushVizEvent(payload, `${role} 错误${msg ? ": " + msg : ""}`, "agent");
            setAgentStatusById((prev) => ({ ...prev, [agentId]: "ERROR" }));
          }
        } else if (payload.event === "ui.db.write") {
          const table = payload.data?.table ?? "db";
          const action = payload.data?.action ?? "write";
          pushVizEvent(payload, `DB ${action}: ${table}`, "db");
          if (table === "files" && session) {
            void refreshFiles(session);
          }
        }
      }

      // any change in workspace => refresh lists (cheap enough for MVP)
      scheduleWorkspaceRefresh();
    };
    es.onerror = () => {
      // tolerate disconnects; user can refresh manually
    };

    return () => es.close();
  }, [
    logVizDebug,
    pushBeam,
    pushVizEvent,
    refreshMessages,
    scheduleWorkspaceRefresh,
    session,
    refreshFiles,
    activeGroupIdRef,
    agentRoleByIdRef,
    groupsRef,
  ]);

  useEffect(() => {
    return () => {
      beamTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      beamTimeoutsRef.current = [];
    };
  }, []);

  return {
    vizEvents,
    vizBeams,
    vizDebug,
    agentStatusById,
    setAgentStatusById,
    upstreamToast,
    setUpstreamToast,
  };
}
