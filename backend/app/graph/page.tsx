"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";

import { SESSION_KEY } from "@/lib/constants";
import { apiPaths } from "@/lib/api-paths";
import type { AgentStatus } from "@/lib/agent-status";
import { HUD, STATUS_COLORS, roleColor, edgeColorByFreshness } from "@/app/im/components/uiTokens";

type UUID = string;

type WorkspaceDefaults = {
  workspaceId: UUID;
  humanAgentId: UUID;
  assistantAgentId: UUID;
  defaultGroupId: UUID;
};

type GraphNode = { id: UUID; role: string; parentId: UUID | null };
type GraphEdge = {
  fromAgentId: UUID;
  toAgentId: UUID;
  count: number;
  lastMessageId: UUID;
  lastMessageAt: string;
  sampleMessageIds: UUID[];
};

function loadSession(): WorkspaceDefaults | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkspaceDefaults;
  } catch {
    return null;
  }
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function edgeWidth(count: number): number {
  return Math.min(6, 1 + Math.log2(count + 1));
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 64;

function layoutNodes(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const n of nodes) {
    if (n.parentId && nodes.some((nn) => nn.id === n.parentId)) {
      g.setEdge(n.parentId, n.id);
    }
  }
  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const p = g.node(n.id);
    if (p) positions.set(n.id, { x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 });
  }
  return positions;
}

type AgentNodeData = {
  role: string;
  idShort: string;
  isMe: boolean;
  status: AgentStatus;
  hasChildren: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onJumpToIm: () => void;
};

function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const color = roleColor(data.role);
  const statusToken = STATUS_COLORS[data.status];
  const isBusy = data.status === "BUSY";
  return (
    <div
      onDoubleClick={data.onJumpToIm}
      title="Double-click: open in IM"
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        border: `2px solid ${color}`,
        borderRadius: 12,
        background: data.isMe ? `${color}33` : HUD.panelBgOpaque,
        color: "#fafafa",
        padding: "6px 10px",
        boxShadow: isBusy
          ? `0 0 16px ${statusToken.dot}cc, 0 0 0 2px ${statusToken.dot}55`
          : `0 0 12px ${color}40`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        position: "relative",
        cursor: "pointer",
        animation: isBusy ? "agent-pulse 1.5s ease-in-out infinite" : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color, overflow: "hidden", textOverflow: "ellipsis" }}>
          {data.role}
        </div>
        <span
          title={data.status}
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: statusToken.dot,
            flexShrink: 0,
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ fontSize: 10, color: "#a1a1aa", fontFamily: "ui-monospace, monospace" }}>
          {data.idShort}
        </div>
        {data.hasChildren && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleCollapse();
            }}
            style={{
              padding: "0 6px",
              background: "transparent",
              border: `1px solid ${color}55`,
              color,
              fontSize: 10,
              cursor: "pointer",
              borderRadius: 4,
              lineHeight: 1.3,
            }}
            title={data.collapsed ? "Expand subtree" : "Collapse subtree"}
          >
            {data.collapsed ? "▸" : "▾"}
          </button>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  );
}

const NODE_TYPES = { agent: AgentNode };

export default function GraphPage() {
  const router = useRouter();
  const [session] = useState<WorkspaceDefaults | null>(() => loadSession());
  const [rawNodes, setRawNodes] = useState<GraphNode[]>([]);
  const [rawEdges, setRawEdges] = useState<GraphEdge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [collapsed, setCollapsed] = useState<Set<UUID>>(new Set());
  const [agentStatus, setAgentStatus] = useState<Map<UUID, AgentStatus>>(new Map());
  const sseRef = useRef<EventSource | null>(null);

  type EdgeHoverInfo = { edge: GraphEdge; x: number; y: number };
  const [hoveredEdge, setHoveredEdge] = useState<EdgeHoverInfo | null>(null);
  type DrawerMessage = {
    id: UUID;
    groupId: UUID;
    senderId: UUID;
    content: string;
    contentType: string;
    sendTime: string;
    causedBy?: UUID;
  };
  type DrawerState = {
    edge: GraphEdge;
    loading: boolean;
    error: string | null;
    messages: DrawerMessage[];
  };
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const toggleCollapse = useCallback((agentId: UUID) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }, []);

  const setStatus = useCallback((agentId: UUID, status: AgentStatus) => {
    setAgentStatus((prev) => {
      const next = new Map(prev);
      next.set(agentId, status);
      return next;
    });
  }, []);

  const fetchGraph = useCallback(async () => {
    if (!session) return;
    try {
      const q = new URLSearchParams({
        workspaceId: session.workspaceId,
        limitMessages: "2000",
      });
      const res = await api<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
        `/api/agent-graph?${q.toString()}`
      );
      setRawNodes(res.nodes);
      setRawEdges(res.edges);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [session]);

  useEffect(() => {
    void fetchGraph();
    const t = setInterval(() => {
      void fetchGraph();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(t);
  }, [fetchGraph]);

  // SSE: infer agent status from ui events
  useEffect(() => {
    if (!session) return;
    const es = new EventSource(`/api/ui-stream?workspaceId=${session.workspaceId}`);
    sseRef.current = es;

    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data) as {
          event?: string;
          data?: { agentId?: UUID; senderId?: UUID };
        };
        const event = payload.event ?? "";
        const aid = payload.data?.agentId ?? payload.data?.senderId;
        if (!aid) return;

        if (event === "ui.agent.llm.start" || event === "ui.agent.tool_call.start") {
          setStatus(aid, "BUSY");
        } else if (event === "ui.agent.llm.done" || event === "ui.agent.tool_call.done") {
          setStatus(aid, "IDLE");
        } else if (event === "ui.agent.error") {
          setStatus(aid, "ERROR");
        } else if (event === "ui.agent.wakeup" || event === "ui.message.created") {
          // Mark sender's potential receivers as waking is too noisy; only mark sender if they're sending
          if (event === "ui.message.created" && aid) setStatus(aid, "IDLE");
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      // swallow; SSE will auto-reconnect
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [session, setStatus]);

  // Compute hidden descendants from collapsed set.
  const hiddenIds = useMemo(() => {
    const childrenByParent = new Map<UUID, UUID[]>();
    for (const n of rawNodes) {
      if (n.parentId) {
        const arr = childrenByParent.get(n.parentId) ?? [];
        arr.push(n.id);
        childrenByParent.set(n.parentId, arr);
      }
    }
    const hidden = new Set<UUID>();
    const queue: UUID[] = [];
    for (const c of collapsed) {
      const directKids = childrenByParent.get(c) ?? [];
      for (const k of directKids) queue.push(k);
    }
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (hidden.has(id)) continue;
      hidden.add(id);
      const kids = childrenByParent.get(id) ?? [];
      for (const k of kids) queue.push(k);
    }
    return hidden;
  }, [rawNodes, collapsed]);

  const visibleNodes = useMemo(
    () => rawNodes.filter((n) => !hiddenIds.has(n.id)),
    [rawNodes, hiddenIds]
  );

  const agentRoleById = useMemo(() => {
    const map = new Map<UUID, string>();
    for (const n of rawNodes) map.set(n.id, n.role);
    return map;
  }, [rawNodes]);

  const fetchEdgeMessages = useCallback(
    async (edge: GraphEdge) => {
      if (!session) return;
      setDrawer({ edge, loading: true, error: null, messages: [] });
      try {
        const res = await fetch(
          apiPaths.messagesByIds(session.workspaceId, edge.sampleMessageIds)
        );
        if (!res.ok) {
          const txt = await res.text();
          setDrawer({ edge, loading: false, error: txt || `${res.status}`, messages: [] });
          return;
        }
        const json = (await res.json()) as { messages: DrawerMessage[] };
        setDrawer({ edge, loading: false, error: null, messages: json.messages });
      } catch (e) {
        setDrawer({
          edge,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
          messages: [],
        });
      }
    },
    [session]
  );

  const { flowNodes, flowEdges } = useMemo(() => {
    const childrenByParent = new Map<UUID, UUID[]>();
    for (const n of rawNodes) {
      if (n.parentId) {
        const arr = childrenByParent.get(n.parentId) ?? [];
        arr.push(n.id);
        childrenByParent.set(n.parentId, arr);
      }
    }

    const positions = layoutNodes(visibleNodes);
    const flowNodes: Node[] = visibleNodes.map((n) => ({
      id: n.id,
      type: "agent",
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: {
        role: n.role,
        idShort: n.id.slice(0, 8),
        isMe: n.id === session?.humanAgentId,
        status: agentStatus.get(n.id) ?? "IDLE",
        hasChildren: (childrenByParent.get(n.id)?.length ?? 0) > 0,
        collapsed: collapsed.has(n.id),
        onToggleCollapse: () => toggleCollapse(n.id),
        onJumpToIm: () => router.push(`/im?focusAgentId=${encodeURIComponent(n.id)}`),
      } satisfies AgentNodeData,
    }));

    const visibleSet = new Set(visibleNodes.map((n) => n.id));
    const flowEdges: Edge[] = rawEdges
      .filter((e) => visibleSet.has(e.fromAgentId) && visibleSet.has(e.toAgentId))
      .map((e, i) => {
        const color = edgeColorByFreshness(e.lastMessageAt, now);
        const width = edgeWidth(e.count);
        return {
          id: `${e.fromAgentId}=>${e.toAgentId}-${i}`,
          source: e.fromAgentId,
          target: e.toAgentId,
          animated: now - new Date(e.lastMessageAt).getTime() < 60_000,
          style: { stroke: color, strokeWidth: width, cursor: "pointer" },
          interactionWidth: 20,
          markerEnd: { type: MarkerType.ArrowClosed, color },
          label: e.count > 1 ? `×${e.count}` : "",
          labelStyle: { fill: HUD.textMuted, fontSize: 10 },
          labelBgStyle: { fill: HUD.panelBgOpaque },
          data: { graphEdge: e },
        };
      });

    return { flowNodes, flowEdges };
  }, [
    visibleNodes,
    rawNodes,
    rawEdges,
    session?.humanAgentId,
    now,
    agentStatus,
    collapsed,
    toggleCollapse,
    router,
  ]);

  const stats = useMemo(() => {
    const totalEdges = rawEdges.length;
    const totalMessages = rawEdges.reduce((sum, e) => sum + e.count, 0);
    const activeCount = rawEdges.filter(
      (e) => now - new Date(e.lastMessageAt).getTime() < 60_000
    ).length;
    const busyCount = Array.from(agentStatus.values()).filter((s) => s === "BUSY").length;
    return {
      totalEdges,
      totalMessages,
      activeCount,
      busyCount,
      agents: rawNodes.length,
      visible: visibleNodes.length,
    };
  }, [rawEdges, rawNodes.length, visibleNodes.length, now, agentStatus]);

  if (!session) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Agent Graph</h1>
        <p className="muted">No session yet. Open IM first.</p>
        <Link className="btn btn-primary" href="/im">
          Open IM
        </Link>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: HUD.pageBgGrid }}>
      <style jsx>{`
        @keyframes agent-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.03);
          }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
          padding: "0 20px",
          borderBottom: `1px solid ${HUD.panelBorder}`,
          background: HUD.panelBg,
          backdropFilter: HUD.panelBlur,
          WebkitBackdropFilter: HUD.panelBlur,
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.12em",
              color: HUD.accentCyan,
              textShadow: `0 0 8px ${HUD.accentCyan}40`,
            }}
          >
            AGENT · GRAPH
          </span>
          <p
            style={{
              margin: 0,
              fontSize: 10,
              color: HUD.textDim,
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.04em",
            }}
          >
            causal flow · dbl-click node = IM · ▾/▸ collapse subtree
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span
            style={{
              fontSize: 10,
              color: HUD.textSecondary,
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.04em",
            }}
          >
            <span style={{ color: HUD.accentCyan }}>{stats.visible}</span>/{stats.agents} agents · {stats.totalEdges} edges ·{" "}
            {stats.totalMessages} msgs · <span style={{ color: HUD.accentAmber }}>{stats.busyCount}</span> busy ·{" "}
            <span style={{ color: HUD.accentCyan }}>{stats.activeCount}</span> fresh
          </span>
          <Link
            href="/im"
            style={{
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 600,
              background: "transparent",
              border: `1px solid ${HUD.panelBorder}`,
              borderRadius: 4,
              color: HUD.accentCyan,
              textDecoration: "none",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            IM
          </Link>
        </div>
      </div>

      {error ? (
        <div className="toast" style={{ margin: "12px 24px" }}>
          {error}
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, background: HUD.pageBg, position: "relative" }}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          fitView
          colorMode="dark"
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          onEdgeMouseEnter={(ev, edge) => {
            const graphEdge = (edge.data as { graphEdge?: GraphEdge } | undefined)?.graphEdge;
            if (!graphEdge) return;
            setHoveredEdge({ edge: graphEdge, x: ev.clientX, y: ev.clientY });
          }}
          onEdgeMouseMove={(ev, edge) => {
            const graphEdge = (edge.data as { graphEdge?: GraphEdge } | undefined)?.graphEdge;
            if (!graphEdge) return;
            setHoveredEdge({ edge: graphEdge, x: ev.clientX, y: ev.clientY });
          }}
          onEdgeMouseLeave={() => setHoveredEdge(null)}
          onEdgeClick={(_, edge) => {
            const graphEdge = (edge.data as { graphEdge?: GraphEdge } | undefined)?.graphEdge;
            if (!graphEdge) return;
            void fetchEdgeMessages(graphEdge);
          }}
        >
          <Background color="rgba(100,180,255,0.10)" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const data = n.data as { role?: string } | undefined;
              return roleColor(data?.role ?? "");
            }}
            maskColor="rgba(0,0,0,0.7)"
            style={{
              background: HUD.panelBgOpaque,
              border: `1px solid ${HUD.panelBorder}`,
              borderRadius: HUD.panelRadius,
            }}
          />
        </ReactFlow>
        {hoveredEdge && (() => {
          const e = hoveredEdge.edge;
          const fromRole = agentRoleById.get(e.fromAgentId) ?? e.fromAgentId.slice(0, 8);
          const toRole = agentRoleById.get(e.toAgentId) ?? e.toAgentId.slice(0, 8);
          const lastAtMs = new Date(e.lastMessageAt).getTime();
          const ageS = Math.max(0, Math.floor((now - lastAtMs) / 1000));
          const ageStr =
            ageS < 60
              ? `${ageS}s ago`
              : ageS < 3600
                ? `${Math.floor(ageS / 60)}m ago`
                : ageS < 86400
                  ? `${Math.floor(ageS / 3600)}h ago`
                  : `${Math.floor(ageS / 86400)}d ago`;
          return (
            <div
              style={{
                position: "fixed",
                left: hoveredEdge.x + 12,
                top: hoveredEdge.y + 12,
                zIndex: 50,
                pointerEvents: "none",
                background: HUD.panelBgOpaque,
                border: `1px solid ${HUD.panelBorderStrong}`,
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 11,
                color: HUD.textPrimary,
                fontFamily: "ui-monospace, monospace",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                lineHeight: 1.5,
                maxWidth: 280,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ color: roleColor(fromRole), fontWeight: 700 }}>{fromRole}</span>
                <span style={{ color: HUD.textDim }}>→</span>
                <span style={{ color: roleColor(toRole), fontWeight: 700 }}>{toRole}</span>
              </div>
              <div style={{ fontSize: 10, color: HUD.textSecondary }}>
                <span style={{ color: HUD.accentCyan }}>×{e.count}</span> msg ·{" "}
                <span style={{ color: HUD.textMuted }}>{ageStr}</span>
              </div>
              <div style={{ fontSize: 10, color: HUD.textDim, marginTop: 2 }}>
                click to inspect
              </div>
            </div>
          );
        })()}
        {drawer && (
          <EdgeMessagesDrawer
            drawer={drawer}
            agentRoleById={agentRoleById}
            onClose={() => setDrawer(null)}
            onJumpToIm={(messageId, groupId) =>
              router.push(
                `/im?focusMessageId=${encodeURIComponent(messageId)}&focusGroupId=${encodeURIComponent(groupId)}`
              )
            }
          />
        )}
      </div>
    </div>
  );
}

function EdgeMessagesDrawer({
  drawer,
  agentRoleById,
  onClose,
  onJumpToIm,
}: {
  drawer: {
    edge: GraphEdge;
    loading: boolean;
    error: string | null;
    messages: Array<{
      id: string;
      groupId: string;
      senderId: string;
      content: string;
      contentType: string;
      sendTime: string;
    }>;
  };
  agentRoleById: Map<string, string>;
  onClose: () => void;
  onJumpToIm: (messageId: string, groupId: string) => void;
}) {
  const fromRole = agentRoleById.get(drawer.edge.fromAgentId) ?? drawer.edge.fromAgentId.slice(0, 8);
  const toRole = agentRoleById.get(drawer.edge.toAgentId) ?? drawer.edge.toAgentId.slice(0, 8);
  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: 380,
        background: HUD.panelBgOpaque,
        borderLeft: `1px solid ${HUD.panelBorderStrong}`,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-12px 0 32px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: `1px solid ${HUD.panelBorder}`,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.10em",
              color: HUD.accentCyan,
              textTransform: "uppercase",
            }}
          >
            Edge Inspector
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ color: roleColor(fromRole), fontWeight: 700 }}>{fromRole}</span>
            <span style={{ color: HUD.textDim }}>→</span>
            <span style={{ color: roleColor(toRole), fontWeight: 700 }}>{toRole}</span>
            <span style={{ color: HUD.textDim, fontFamily: "ui-monospace, monospace", fontSize: 10 }}>
              ×{drawer.edge.count}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close edge inspector"
          style={{
            background: "transparent",
            border: `1px solid ${HUD.panelBorder}`,
            borderRadius: 4,
            color: HUD.textMuted,
            width: 24,
            height: 24,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {drawer.loading && (
          <div style={{ color: HUD.textDim, fontSize: 11, padding: "8px 4px" }}>
            Loading messages…
          </div>
        )}
        {drawer.error && (
          <div
            style={{
              fontSize: 11,
              color: HUD.accentRed,
              background: "rgba(239,68,68,0.06)",
              border: `1px solid ${HUD.accentRed}40`,
              borderRadius: 4,
              padding: "8px 10px",
              fontFamily: "ui-monospace, monospace",
              wordBreak: "break-word",
            }}
          >
            {drawer.error}
          </div>
        )}
        {!drawer.loading && !drawer.error && drawer.messages.length === 0 && (
          <div style={{ color: HUD.textDim, fontSize: 11, padding: "8px 4px" }}>
            No sample messages available.
          </div>
        )}
        {drawer.messages.map((m) => {
          const role = agentRoleById.get(m.senderId) ?? m.senderId.slice(0, 8);
          const color = roleColor(role);
          const preview = m.content.length > 240 ? m.content.slice(0, 240) + "…" : m.content;
          const t = new Date(m.sendTime);
          const timeStr = t.toLocaleTimeString();
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onJumpToIm(m.id, m.groupId)}
              title={`Open msg/${m.id.slice(0, 8)} in IM`}
              style={{
                textAlign: "left",
                background: "rgba(255,255,255,0.015)",
                border: `1px solid ${color}30`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 4,
                padding: "8px 10px",
                color: HUD.textPrimary,
                cursor: "pointer",
                fontSize: 11,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                transition: HUD.hoverTransition,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(34,211,238,0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.015)";
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 10,
                  color: HUD.textDim,
                  fontFamily: "ui-monospace, monospace",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ color, fontWeight: 700 }}>{role}</span>
                <span>·</span>
                <span>msg/{m.id.slice(0, 8)}</span>
                <span>·</span>
                <span>{timeStr}</span>
                {m.contentType !== "text" && (
                  <>
                    <span>·</span>
                    <span style={{ color: HUD.accentViolet }}>{m.contentType}</span>
                  </>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: HUD.textSecondary,
                  lineHeight: 1.45,
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                }}
              >
                {preview || <span style={{ color: HUD.textDim }}>(empty)</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
