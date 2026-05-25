"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { IMShell } from "./IMShell";
import { FilePanel } from "./components/FilePanel";
import { Composer } from "./components/Composer";

import type { AgentMeta, Group } from "./_internal/types";
import { LEFT_WIDTH_KEY, MID_GRAPH_MIN_HEIGHT, MID_SPLITTER_SIZE, RIGHT_WIDTH_KEY } from "./_internal/constants";
import { api, loadSession, toTimestamp } from "./_internal/utils";
import { usePersistedNumber } from "./_internal/hooks/usePersistedNumber";
import { useSession } from "./_internal/hooks/useSession";
import { useWorkspaceData } from "./_internal/hooks/useWorkspaceData";
import { useMessages } from "./_internal/hooks/useMessages";
import { useAgentStream } from "./_internal/hooks/useAgentStream";
import { useUiStream } from "./_internal/hooks/useUiStream";
import { useCausality } from "./_internal/hooks/useCausality";
import { useDisplayItems } from "./_internal/hooks/useDisplayItems";
import { useScrollToMessage } from "./_internal/hooks/useScrollToMessage";
import { useVizLayout } from "./_internal/hooks/useVizLayout";
import { useVizInteractions } from "./_internal/hooks/useVizInteractions";
import { useMidSplitter } from "./_internal/hooks/useMidSplitter";
import { useRightPanels } from "./_internal/hooks/useRightPanels";
import { useCallbacks } from "./_internal/hooks/useCallbacks";
import { VizEventsPanel } from "./_internal/parts/VizEventsPanel";
import { LiveStreamPanel } from "./_internal/parts/LiveStreamPanel";
import { MessageTimeline } from "./_internal/parts/MessageTimeline";
import { LegacyVizCanvas } from "./_internal/parts/LegacyVizCanvas";
import { GroupRow } from "./_internal/parts/GroupRow";
export default function IMPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <IMPageInner />
    </Suspense>
  );
}

function IMPageInner() {
  const searchParams = useSearchParams();
  const workspaceOverrideId = searchParams.get("workspaceId");

  // --- State ---
  const [tokenLimit, setTokenLimit] = useState(100000);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"boot" | "groups" | "messages" | "send" | "idle">("boot");
  const [error, setError] = useState<string | null>(null);
  const [stoppingAgents, setStoppingAgents] = useState(false);
  const [vizEventsCollapsed, setVizEventsCollapsed] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [showFilesPanel, setShowFilesPanel] = useState(true);
  const [leftWidth, setLeftWidth] = usePersistedNumber(LEFT_WIDTH_KEY, 320, { min: 0, max: 800 });
  const [rightWidth, setRightWidth] = usePersistedNumber(RIGHT_WIDTH_KEY, 420, { min: 0, max: 800 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Refs ---
  const activeGroupIdRef = useRef<string | null>(null);
  const streamAgentIdValueRef = useRef<string | null>(null);
  const agentRoleByIdRef = useRef<Map<string, string>>(new Map());
  const groupsRef = useRef<Group[]>([]);
  const refreshQueueRef = useRef<{
    timer: number | null;
    pending: { groups: boolean; agents: boolean; messages: boolean; llmHistory: boolean };
  }>({ timer: null, pending: { groups: false, agents: false, messages: false, llmHistory: false } });
  const refreshLlmHistoryRef = useRef<(id: string) => Promise<void>>(async () => {});

  // --- Data hooks ---
  const { session, createWorkspace } = useSession(workspaceOverrideId, setStatus, setError);
  const ws = useWorkspaceData(session, setStatus);
  const msgs = useMessages({ session, activeGroupId, refreshGroups: ws.refreshGroups, setStatus });
  const { groups, agents, files, refreshGroups, refreshAgents, refreshFiles, agentRoleById, setGroups, setAgents } = ws;
  const { messages, setMessages, loadingOlder, phaseSummaries, expandedPhases, phaseMessages, refreshMessages, loadOlderMessages, togglePhaseExpand, messagesContainerRef, bottomRef } = msgs;

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useLayoutEffect(() => { if (session) setActiveGroupId(session.defaultGroupId); }, [session]);

  // --- Derived ---
  const groupByAgentId = useMemo(() => {
    const map = new Map<string, Group>();
    if (!session) return map;
    for (const g of groups) {
      if (!g.memberIds.includes(session.humanAgentId)) continue;
      const others = g.memberIds.filter((id) => id !== session.humanAgentId);
      if (others.length === 1) map.set(others[0], g);
    }
    return map;
  }, [groups, session]);

  const streamAgentId = useMemo(() => {
    if (!session) return null;
    if (!activeGroupId) return session.assistantAgentId;
    const group = groups.find((g) => g.id === activeGroupId);
    if (!group) return session.assistantAgentId;
    return group.memberIds.find((id) => id !== session.humanAgentId) ?? session.assistantAgentId;
  }, [activeGroupId, groups, session]);
  // --- Stream hooks ---
  const onDoneRef = useRef<() => void>(() => {});
  useEffect(() => {
    onDoneRef.current = () => {
      const groupId = activeGroupIdRef.current;
      const nextSession = loadSession();
      if (nextSession && groupId) void refreshMessages(nextSession, groupId, { markRead: false });
      if (nextSession) void refreshGroups(nextSession);
    };
  }, [refreshMessages, refreshGroups]);
  const onDone = useCallback(() => onDoneRef.current(), []);

  const agentStream = useAgentStream({
    streamAgentId,
    activeGroupIdRef,
    onDone,
  });
  const { contentStream, reasoningStream, toolStream, llmHistory, agentError, setAgentError, refreshLlmHistory, connectAgentStream } = agentStream;
  useEffect(() => {
    refreshLlmHistoryRef.current = refreshLlmHistory;
  }, [refreshLlmHistory]);

  const scheduleWorkspaceRefresh = useCallback((opts?: { groups?: boolean; agents?: boolean; messages?: boolean; llmHistory?: boolean }) => {
    if (!session) return;
    const pending = refreshQueueRef.current.pending;
    pending.groups = opts?.groups ?? true;
    pending.agents = opts?.agents ?? true;
    pending.messages = opts?.messages ?? true;
    pending.llmHistory = opts?.llmHistory ?? true;
    if (refreshQueueRef.current.timer !== null) return;
    refreshQueueRef.current.timer = window.setTimeout(() => {
      const next = refreshQueueRef.current.pending;
      refreshQueueRef.current.pending = { groups: false, agents: false, messages: false, llmHistory: false };
      refreshQueueRef.current.timer = null;
      if (next.groups) void refreshGroups(session, { silent: true });
      if (next.agents) void refreshAgents(session);
      if (next.llmHistory && streamAgentIdValueRef.current) void refreshLlmHistoryRef.current(streamAgentIdValueRef.current);
      if (next.messages && activeGroupIdRef.current) void refreshMessages(session, activeGroupIdRef.current, { markRead: false, silent: true, skipGroupRefresh: true });
    }, 200);
  }, [session, refreshGroups, refreshAgents, refreshMessages]);

  const uiStream = useUiStream({ session, activeGroupIdRef, groupsRef, agentRoleByIdRef, refreshMessages, scheduleWorkspaceRefresh, refreshFiles });
  const { vizBeams, vizEvents, agentStatusById, setAgentStatusById } = uiStream;

  // --- Display hooks ---
  const causality = useCausality(messages, selectedMessageId, setSelectedMessageId);
  const displayItems = useDisplayItems(messages, phaseSummaries, expandedPhases, phaseMessages);
  const scrollToMessage = useScrollToMessage(messagesContainerRef);

  // --- Interaction hooks ---
  const {
    vizSize,
    vizScale,
    vizOffset,
    vizIsPanning,
    setVizScale,
    setVizOffset,
    setVizIsPanning,
    vizRef,
    vizPanStartRef,
    nodeOffsets,
    collapsedAgents,
    toggleAgentCollapsed,
    handleNodePointerDown,
    handleNodeMouseDown,
    handleNodeTouchStart,
  } = useVizInteractions();
  const {
    midStackRef,
    midStackHeight,
    midChatHeight,
    handleMidResizeStart,
    handleMidMouseDown,
    handleMidTouchStart,
  } = useMidSplitter();
  const rp = useRightPanels();
  const vizLayout = useVizLayout(agents, session, vizSize, nodeOffsets);

  // --- Agent tree ---
  const agentTreeRows = useMemo(() => {
    if (!session) return [] as Array<{ agent: AgentMeta; group: Group | null; depth: number; hasChildren: boolean; collapsed: boolean; guides: boolean[]; isLast: boolean }>;
    const byId = new Map(agents.map((a) => [a.id, a]));
    const childrenById = new Map<string, AgentMeta[]>();
    const roots: AgentMeta[] = [];
    const byCreatedAt = (a: AgentMeta, b: AgentMeta) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
    for (const agent of agents) {
      if (agent.role === "human") continue;
      const parentId = agent.parentId;
      const parent = parentId && parentId !== agent.id ? byId.get(parentId) : null;
      if (parent && parent.role !== "human" && parent.id !== agent.id) {
        const list = childrenById.get(parent.id) ?? [];
        list.push(agent);
        childrenById.set(parent.id, list);
      } else {
        roots.push(agent);
      }
    }
    for (const list of childrenById.values()) list.sort(byCreatedAt);
    roots.sort(byCreatedAt);
    const rows: Array<{ agent: AgentMeta; group: Group | null; depth: number; hasChildren: boolean; collapsed: boolean; guides: boolean[]; isLast: boolean }> = [];
    const walk = (agent: AgentMeta, depth: number, guides: boolean[], isLast: boolean) => {
      const children = childrenById.get(agent.id) ?? [];
      const collapsed = !!collapsedAgents[agent.id];
      rows.push({ agent, group: groupByAgentId.get(agent.id) ?? null, depth, hasChildren: children.length > 0, collapsed, guides, isLast });
      if (collapsed) return;
      const nextGuides = [...guides, !isLast];
      children.forEach((child, index) => walk(child, depth + 1, nextGuides, index === children.length - 1));
    };
    roots.forEach((root, index) => walk(root, 0, [], index === roots.length - 1));
    return rows;
  }, [agents, session, groupByAgentId, collapsedAgents]);

  const extraGroups = useMemo(() => {
    if (!session) return groups;
    const mappedIds = new Set(Array.from(groupByAgentId.values()).map((g) => g.id));
    return groups.filter((g) => !mappedIds.has(g.id));
  }, [groupByAgentId, groups, session]);

  // --- LLM history ---
  const llmHistoryParsed = useMemo(() => {
    if (!llmHistory) return null;
    try { return JSON.parse(llmHistory); } catch { return null; }
  }, [llmHistory]);
  const llmHistoryFormatted = useMemo(() => {
    if (!llmHistory) return "";
    try { return JSON.stringify(JSON.parse(llmHistory), null, 2); } catch { return llmHistory; }
  }, [llmHistory]);

  // --- Sync refs ---
  useEffect(() => { activeGroupIdRef.current = activeGroupId; }, [activeGroupId]);
  useEffect(() => { streamAgentIdValueRef.current = streamAgentId; }, [streamAgentId]);
  useEffect(() => { groupsRef.current = groups; }, [groups]);
  useEffect(() => { agentRoleByIdRef.current = agentRoleById; }, [agentRoleById]);

  // --- Callbacks ---
  const { getGroupLabel, deleteAgent, deleteGroup, deleteWorkspace, onFileInputChange, insertFileToDraft, onInterruptAllAgents, onSend } = useCallbacks({ session, activeGroupId, groups, agents, stoppingAgents, draft, setError, setAgentError, setStatus, setActiveGroupId, setAgents, setGroups, setMessages, setDraft, setAgentStatusById, setStoppingAgents, refreshGroups, refreshAgents, refreshFiles, connectAgentStream, agentRoleById, bottomRef });

  // Config
  useEffect(() => { api<{ tokenLimit: number }>("/api/config").then((c) => setTokenLimit(c.tokenLimit)).catch(() => setTokenLimit(100000)); }, []);

  const grProps = { activeGroupId, tokenLimit, session, getGroupLabel, onSelect: setActiveGroupId, onDeleteAgent: deleteAgent, onDeleteGroup: deleteGroup, onToggleCollapse: toggleAgentCollapsed };

  // --- JSX ---
  return (
    <IMShell
      leftWidth={leftWidth}
      rightWidth={rightWidth}
      onLeftWidthChange={setLeftWidth}
      onRightWidthChange={setRightWidth}
      left={
        <aside className="panel panel-left">
          <div className="header">
            <div><div style={{ fontWeight: 700 }}>Workspace</div><div className="muted mono" style={{ fontSize: 12 }}>{session?.workspaceId ?? "-"}</div></div>
            <div style={{ display: "flex", gap: 8 }}>
              {session && <button className="btn" style={{ padding: "4px 8px", fontSize: 12, borderColor: "#7f1d1d", background: "#1f0b0b", color: "#fecaca", display: "inline-flex", alignItems: "center", gap: 4 }} onClick={() => void deleteWorkspace(session.workspaceId)} title="删除 Workspace"><Trash2 size={14} />删除</button>}
            </div>
          </div>
          <div style={{ padding: 12 }}><div className="muted mono" style={{ fontSize: 12, lineHeight: 1.4 }}>human: {session?.humanAgentId ?? "-"}<br />assistant: {session?.assistantAgentId ?? "-"}</div></div>
          <div className="list">
            {agentTreeRows.length === 0 && extraGroups.length === 0 ? <div style={{ padding: 16 }} className="muted">No groups yet.</div> : <>
              {agentTreeRows.map(({ agent, group, depth, hasChildren, collapsed, guides, isLast }) => group ? <GroupRow key={group.id} g={group} tree={{ depth, hasChildren, collapsed, agentId: agent.id, guides, isLast }} {...grProps} /> : null)}
              {extraGroups.map((g) => <GroupRow key={g.id} g={g} {...grProps} />)}
            </>}
          </div>
          {session && <FilePanel files={files} workspaceId={session.workspaceId} showFilesPanel={showFilesPanel} onTogglePanel={() => setShowFilesPanel((p) => !p)} onUploadClick={() => fileInputRef.current?.click()} fileInputRef={fileInputRef} onFileInputChange={onFileInputChange} onInsertFile={insertFileToDraft} onDeleteFile={(fileId) => {
            void fetch(`/api/files/${fileId}?workspaceId=${session.workspaceId}`, { method: "DELETE" }).then((res) => {
              if (res.ok) void refreshFiles(session);
            });
          }} />}
        </aside>
      }
      mid={
        <main className="panel panel-mid">
          <div className="header">
            <div style={{ fontWeight: 700 }}>{getGroupLabel(groups.find((g) => g.id === activeGroupId) ?? null)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button className="btn" style={{ padding: "4px 10px", fontSize: 12, borderColor: "#7f1d1d", background: stoppingAgents ? "#450a0a" : "#1f0b0b", color: "#fecaca" }} onClick={() => void onInterruptAllAgents()} disabled={!session || stoppingAgents} title="停止所有 agent 当前循环">{stoppingAgents ? "Stopping..." : "Stop All Agents"}</button>
              <div className="muted" style={{ fontSize: 12 }}>{status !== "idle" ? `${status}...` : ""}</div>
            </div>
          </div>
          <div className="mid-stack" ref={midStackRef} style={{ gridTemplateRows: midStackHeight > 0 ? `${Math.max(0, Math.round(midChatHeight))}px ${MID_SPLITTER_SIZE}px minmax(${MID_GRAPH_MIN_HEIGHT}px, 1fr)` : `1fr ${MID_SPLITTER_SIZE}px minmax(${MID_GRAPH_MIN_HEIGHT}px, 1fr)` }}>
            <MessageTimeline displayItems={displayItems} loadingOlder={loadingOlder} session={session} agentRoleById={agentRoleById} togglePhaseExpand={togglePhaseExpand} containerRef={messagesContainerRef} bottomRef={bottomRef} />
            <div className="mid-resizer" onPointerDown={handleMidResizeStart} onMouseDown={handleMidMouseDown} onTouchStart={handleMidTouchStart} />
            <div className="viz-shell">
              <LegacyVizCanvas vizSize={vizSize} vizScale={vizScale} vizOffset={vizOffset} vizIsPanning={vizIsPanning} setVizScale={setVizScale} setVizOffset={setVizOffset} setVizIsPanning={setVizIsPanning} vizRef={vizRef} vizPanStartRef={vizPanStartRef} vizLayout={vizLayout} vizBeams={vizBeams} agentStatusById={agentStatusById} streamAgentId={streamAgentId} handleNodePointerDown={handleNodePointerDown} handleNodeMouseDown={handleNodeMouseDown} handleNodeTouchStart={handleNodeTouchStart} />
              <VizEventsPanel vizEvents={vizEvents} collapsed={vizEventsCollapsed} onCollapse={() => setVizEventsCollapsed(true)} onExpand={() => setVizEventsCollapsed(false)} />
            </div>
          </div>
          {error ? <div className="toast">{error}</div> : null}
          <Composer draft={draft} onDraftChange={setDraft} onSend={onSend} disabled={!draft.trim() || status === "send"} />
        </main>
      }
      right={
        <>
          <section className="panel panel-right">
            <div className="header"><div style={{ fontWeight: 700 }}>Agent Details</div></div>
            <div className="agent-sidebar-body">
              <div className="muted" style={{ fontSize: 12 }}>Streaming from: <span className="mono">{streamAgentId ?? "-"}</span></div>
              {agentError ? <div className="toast" style={{ borderColor: "#713f12", background: "rgba(113,63,18,0.25)", color: "#fde68a" }}>{agentError}</div> : null}
              <LiveStreamPanel rightPanels={rp.rightPanels} toggleRightPanel={rp.toggleRightPanel} handleRightPanelResizeStart={rp.handleRightPanelResizeStart} contentStream={contentStream} reasoningStream={reasoningStream} toolStream={toolStream} llmHistory={llmHistory} llmHistoryParsed={llmHistoryParsed} llmHistoryFormatted={llmHistoryFormatted} />
            </div>
          </section>
          <style jsx global>{`@keyframes viz-dash { from { stroke-dashoffset: 18; } to { stroke-dashoffset: 0; } }`}</style>
        </>
      }
    />
  );
}
