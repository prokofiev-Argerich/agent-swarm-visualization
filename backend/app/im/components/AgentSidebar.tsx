"use client";

import { useMemo, useState, useCallback } from "react";
import { ChevronDown, ChevronRight, MessageSquare, Users, GitBranch, Folder } from "lucide-react";
import { HUD, STATUS_COLORS, roleColor } from "./uiTokens";
import type { AgentStatus } from "@/lib/agent-status";

/* ── Types ── */

type Group = {
  id: string;
  name: string | null;
  memberIds: string[];
  unreadCount: number;
  contextTokens: number;
  updatedAt: string;
  createdAt: string;
};

type AgentMeta = {
  id: string;
  role: string;
  parentId: string | null;
  createdAt: string;
};

type AgentSidebarProps = {
  groups: Group[];
  activeGroupId: string | null;
  agents: AgentMeta[];
  agentStatusById: Record<string, AgentStatus>;
  messages: Array<{ senderId: string; sendTime: string }>;
  humanAgentId: string | null;
  onSelectGroup: (groupId: string) => void;
  onSelectAgent?: (agentId: string) => void;
  selectedAgentId?: string | null;
};

/* ── Shared styles ── */

const FOCUS_VISIBLE: React.CSSProperties = {
  outline: `2px solid ${HUD.accentCyan}`,
  outlineOffset: "2px",
};

function applyFocusVisible(e: React.FocusEvent<HTMLElement>) {
  Object.assign(e.currentTarget.style, FOCUS_VISIBLE);
}
function clearFocusVisible(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.outline = "none";
  e.currentTarget.style.outlineOffset = "0";
}

/* ── Section header ── */

function SectionHeader({
  label,
  count,
  icon: Icon,
  open,
  onToggle,
}: {
  label: string;
  count?: number;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      onFocus={applyFocusVisible}
      onBlur={clearFocusVisible}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        padding: "6px 12px",
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${HUD.panelBorder}`,
        cursor: "pointer",
        transition: HUD.hoverTransition,
        flexShrink: 0,
      }}
    >
      {open ? <ChevronDown size={12} strokeWidth={2.2} /> : <ChevronRight size={12} strokeWidth={2.2} />}
      <Icon size={12} strokeWidth={2.2} />
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: HUD.labelLetterSpacing,
          color: HUD.textDim,
          textTransform: "uppercase",
          flex: 1,
          textAlign: "left",
        }}
      >
        {label}
      </span>
      {count !== undefined && (
        <span style={{ fontSize: 9, fontFamily: "ui-monospace, monospace", color: HUD.textDim }}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ── Agent row (compact) ── */

function AgentRow({
  agent,
  status,
  depth,
  selected,
  hasChildren,
  expanded,
  onToggle,
  onClick,
  messageCount,
  matchesSearch,
}: {
  agent: AgentMeta;
  status: AgentStatus;
  depth: number;
  selected: boolean;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: () => void;
  onClick: () => void;
  messageCount: number;
  matchesSearch?: boolean;
}) {
  const token = STATUS_COLORS[status] ?? STATUS_COLORS.OFFLINE;
  const accent = roleColor(agent.role);

  return (
    <button
      type="button"
      onClick={onClick}
      onFocus={applyFocusVisible}
      onBlur={clearFocusVisible}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        padding: "4px 10px 4px 0",
        paddingLeft: 12 + depth * 16,
        background: selected ? "rgba(34,211,238,0.06)" : "transparent",
        border: "none",
        borderLeft: selected ? `2px solid ${HUD.selectedBorder}` : "2px solid transparent",
        boxShadow: selected ? `inset 0 0 12px rgba(8,145,178,0.08)` : "none",
        cursor: "pointer",
        transition: HUD.hoverTransition,
        textAlign: "left",
        minHeight: 28,
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "rgba(0,0,0,0.02)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      {hasChildren && (
        <span
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); onToggle(); } }}
          role="button"
          tabIndex={-1}
          style={{ display: "inline-flex", cursor: "pointer", flexShrink: 0, padding: 2 }}
        >
          {expanded
            ? <ChevronDown size={10} strokeWidth={2.2} color={HUD.textDim} />
            : <ChevronRight size={10} strokeWidth={2.2} color={HUD.textDim} />
          }
        </span>
      )}
      {!hasChildren && <span style={{ width: 14, flexShrink: 0 }} />}

      <span
        title={`status: ${status}`}
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: token.dot,
          boxShadow: token.glow,
          flexShrink: 0,
          animation: status === "BUSY" || status === "ERROR" ? "agent-status-pulse 1.5s ease-in-out infinite" : undefined,
        }}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: matchesSearch ? 800 : 600,
          color: accent,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
          flex: 1,
        }}
      >
        {agent.role}
      </span>
      <span
        style={{
          fontSize: 8,
          fontFamily: "ui-monospace, monospace",
          color: HUD.textDim,
          flexShrink: 0,
        }}
      >
        {agent.id.slice(0, 6)}
      </span>
      {messageCount > 0 && (
        <span style={{ fontSize: 9, color: HUD.accentCyan, fontFamily: "ui-monospace, monospace", flexShrink: 0 }}>
          {messageCount}
        </span>
      )}
    </button>
  );
}

/* ── Group row (compact) ── */

function GroupRow({
  group,
  active,
  agents,
  agentStatusById,
  humanAgentId,
  onClick,
  expanded,
  onToggle,
  matchesSearch,
}: {
  group: Group;
  active: boolean;
  agents: AgentMeta[];
  agentStatusById: Record<string, AgentStatus>;
  humanAgentId: string | null;
  onClick: () => void;
  expanded: boolean;
  onToggle: () => void;
  matchesSearch?: boolean;
}) {
  const memberAgents = agents.filter((a) => group.memberIds.includes(a.id) && a.role !== "human");
  const label = group.name ?? `Group ${group.id.slice(0, 6)}`;

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        onFocus={applyFocusVisible}
        onBlur={clearFocusVisible}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "5px 10px 5px 12px",
          background: active ? "rgba(34,211,238,0.05)" : "transparent",
          border: "none",
          borderLeft: active ? `2px solid ${HUD.accentCyan}` : "2px solid transparent",
          cursor: "pointer",
          transition: HUD.hoverTransition,
          textAlign: "left",
          minHeight: 28,
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.02)"; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
      >
        {memberAgents.length > 0 && (
          <span
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); onToggle(); } }}
            role="button"
            tabIndex={-1}
            style={{ display: "inline-flex", cursor: "pointer", flexShrink: 0, padding: 2 }}
          >
            {expanded
              ? <ChevronDown size={10} strokeWidth={2.2} color={HUD.textDim} />
              : <ChevronRight size={10} strokeWidth={2.2} color={HUD.textDim} />
            }
          </span>
        )}
        {memberAgents.length === 0 && <span style={{ width: 14, flexShrink: 0 }} />}

        <span
          style={{
            fontSize: 11,
            fontWeight: matchesSearch ? 800 : 600,
            color: active ? HUD.textPrimary : HUD.textSecondary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: 1,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 8, fontFamily: "ui-monospace, monospace", color: HUD.textDim, flexShrink: 0 }}>
          {memberAgents.length}
        </span>
        {group.unreadCount > 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, color: HUD.accentAmber, fontFamily: "ui-monospace, monospace", flexShrink: 0 }}>
            {group.unreadCount}
          </span>
        )}
      </button>

      {expanded && memberAgents.length > 0 && (
        <div style={{ paddingLeft: 16 }}>
          {memberAgents.map((a) => {
            const s = agentStatusById[a.id] ?? "IDLE";
            const token = STATUS_COLORS[s] ?? STATUS_COLORS.OFFLINE;
            return (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 10px 2px 12px",
                  fontSize: 10,
                  color: HUD.textMuted,
                  minHeight: 22,
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: 999, background: token.dot, boxShadow: token.glow, flexShrink: 0 }} />
                <span style={{ color: roleColor(a.role), fontWeight: 600 }}>{a.role}</span>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 8, color: HUD.textDim }}>{a.id.slice(0, 6)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Direct Chat row ── */

function DirectChatRow({
  group,
  agent,
  active,
  status,
  onClick,
  matchesSearch,
}: {
  group: Group;
  agent: AgentMeta;
  active: boolean;
  status: AgentStatus;
  onClick: () => void;
  matchesSearch?: boolean;
}) {
  const token = STATUS_COLORS[status] ?? STATUS_COLORS.OFFLINE;
  const accent = roleColor(agent.role);

  return (
    <button
      type="button"
      onClick={onClick}
      onFocus={applyFocusVisible}
      onBlur={clearFocusVisible}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        padding: "4px 10px 4px 28px",
        background: active ? "rgba(34,211,238,0.05)" : "transparent",
        border: "none",
        borderLeft: active ? `2px solid ${HUD.accentCyan}` : "2px solid transparent",
        cursor: "pointer",
        transition: HUD.hoverTransition,
        textAlign: "left",
        minHeight: 28,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.02)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: token.dot,
          boxShadow: token.glow,
          flexShrink: 0,
          animation: status === "BUSY" ? "agent-status-pulse 1.5s ease-in-out infinite" : undefined,
        }}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: matchesSearch ? 800 : 600,
          color: accent,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
          flex: 1,
        }}
      >
        {agent.role}
      </span>
      {group.unreadCount > 0 && (
        <span style={{ fontSize: 9, fontWeight: 700, color: HUD.accentAmber, fontFamily: "ui-monospace, monospace", flexShrink: 0 }}>
          {group.unreadCount}
        </span>
      )}
    </button>
  );
}

/* ── Main component ── */

export function AgentSidebar({
  groups,
  activeGroupId,
  agents,
  agentStatusById,
  messages,
  humanAgentId,
  onSelectGroup,
  onSelectAgent,
  selectedAgentId,
}: AgentSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({
    groups: true,
    agents: true,
    directChats: true,
  });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});

  const toggleSection = useCallback((key: string) => {
    setSectionOpen((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups((p) => ({ ...p, [id]: !p[id] }));
  }, []);

  const toggleAgentExpand = useCallback((id: string) => {
    setExpandedAgents((p) => ({ ...p, [id]: !p[id] }));
  }, []);

  const nonHumanAgents = useMemo(
    () => agents.filter((a) => a.role !== "human"),
    [agents],
  );

  const agentById = useMemo(() => {
    const m = new Map<string, AgentMeta>();
    for (const a of nonHumanAgents) m.set(a.id, a);
    return m;
  }, [nonHumanAgents]);

  // P2P groups: exactly humanAgentId + one other member
  const p2pGroups = useMemo(() => {
    if (!humanAgentId) return [];
    return groups.filter((g) => {
      if (!g.memberIds.includes(humanAgentId)) return false;
      const others = g.memberIds.filter((id) => id !== humanAgentId);
      return others.length === 1 && agentById.has(others[0]!);
    });
  }, [groups, humanAgentId, agentById]);

  const p2pGroupIds = useMemo(() => new Set(p2pGroups.map((g) => g.id)), [p2pGroups]);

  // Collaboration groups: everything except P2P groups
  const collabGroups = useMemo(
    () => groups.filter((g) => !p2pGroupIds.has(g.id)),
    [groups, p2pGroupIds],
  );

  // Agent tree: build parentId hierarchy among non-human agents
  const agentTree = useMemo(() => {
    const childrenOf = new Map<string, AgentMeta[]>();
    const roots: AgentMeta[] = [];

    for (const a of nonHumanAgents) {
      const pid = a.parentId;
      if (pid && pid !== a.id && agentById.has(pid)) {
        const list = childrenOf.get(pid) ?? [];
        list.push(a);
        childrenOf.set(pid, list);
      } else {
        roots.push(a);
      }
    }

    const byCreated = (a: AgentMeta, b: AgentMeta) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    roots.sort(byCreated);
    for (const list of childrenOf.values()) list.sort(byCreated);

    return { roots, childrenOf };
  }, [nonHumanAgents, agentById]);

  // Per-agent message counts from current messages
  const agentMsgCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of messages) {
      counts.set(m.senderId, (counts.get(m.senderId) ?? 0) + 1);
    }
    return counts;
  }, [messages]);

  // Search
  const query = searchQuery.trim().toLowerCase();
  const matchingAgentIds = useMemo(() => {
    if (!query) return null;
    const set = new Set<string>();
    for (const a of nonHumanAgents) {
      if (a.role.toLowerCase().includes(query) || a.id.toLowerCase().includes(query)) {
        set.add(a.id);
      }
    }
    return set;
  }, [query, nonHumanAgents]);

  const matchingGroupIds = useMemo(() => {
    if (!query) return null;
    const set = new Set<string>();
    for (const g of groups) {
      if (
        (g.name && g.name.toLowerCase().includes(query)) ||
        g.id.toLowerCase().includes(query)
      ) {
        set.add(g.id);
      }
    }
    return set;
  }, [query, groups]);

  // Expand parents of matching agents
  const autoExpandedAgents = useMemo(() => {
    if (!matchingAgentIds) return null;
    const set = new Set<string>();
    for (const id of matchingAgentIds) {
      let current = agentById.get(id);
      while (current?.parentId && current.parentId !== current.id && agentById.has(current.parentId)) {
        set.add(current.parentId);
        current = agentById.get(current.parentId);
      }
    }
    return set;
  }, [matchingAgentIds, agentById]);

  const isAgentExpanded = useCallback(
    (id: string) => {
      if (autoExpandedAgents?.has(id)) return true;
      return expandedAgents[id] ?? true; // default expanded
    },
    [expandedAgents, autoExpandedAgents],
  );

  // Flatten agent tree for rendering
  const flatAgents = useMemo(() => {
    type Row = { agent: AgentMeta; depth: number; hasChildren: boolean };
    const result: Row[] = [];

    const walk = (nodes: AgentMeta[], childrenOf: Map<string, AgentMeta[]>, depth: number) => {
      for (const agent of nodes) {
        const children = childrenOf.get(agent.id) ?? [];

        if (matchingAgentIds && !matchingAgentIds.has(agent.id)) {
          const before = result.length;
          walk(children, childrenOf, depth + 1);
          if (result.length === before) continue;
          result.splice(before, 0, { agent, depth, hasChildren: true });
          continue;
        }

        result.push({ agent, depth, hasChildren: children.length > 0 });
        if (children.length > 0 && isAgentExpanded(agent.id)) {
          walk(children, childrenOf, depth + 1);
        }
      }
    };

    walk(agentTree.roots, agentTree.childrenOf, 0);
    return result;
  }, [agentTree, matchingAgentIds, isAgentExpanded]);

  // Filtered groups for search
  const filteredCollabGroups = matchingGroupIds
    ? collabGroups.filter((g) => matchingGroupIds.has(g.id) || g.id === activeGroupId)
    : collabGroups;

  const filteredP2pGroups = useMemo(() => {
    if (!matchingAgentIds && !matchingGroupIds) return p2pGroups;
    return p2pGroups.filter((g) => {
      if (g.id === activeGroupId) return true;
      if (matchingGroupIds?.has(g.id)) return true;
      const otherId = g.memberIds.find((id) => id !== humanAgentId);
      if (otherId && matchingAgentIds?.has(otherId)) return true;
      return false;
    });
  }, [p2pGroups, matchingAgentIds, matchingGroupIds, activeGroupId, humanAgentId]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Search */}
      <div style={{ padding: "8px 10px", flexShrink: 0, borderBottom: `1px solid ${HUD.panelBorder}` }}>
        <input
          type="text"
          placeholder="Filter agents / groups…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "5px 8px",
            fontSize: 11,
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${HUD.panelBorder}`,
            borderRadius: 4,
            color: HUD.textPrimary,
            outline: "none",
            transition: HUD.hoverTransition,
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = HUD.accentCyan; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = HUD.panelBorder; }}
        />
      </div>

      {/* Scrollable sections */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>

        {/* ── Groups ── */}
        {filteredCollabGroups.length > 0 && (
          <div>
            <SectionHeader
              label="Groups"
              count={filteredCollabGroups.length}
              icon={Users}
              open={sectionOpen.groups !== false}
              onToggle={() => toggleSection("groups")}
            />
            {sectionOpen.groups !== false && (
              <div>
                {filteredCollabGroups.map((g) => (
                  <GroupRow
                    key={g.id}
                    group={g}
                    active={g.id === activeGroupId}
                    agents={nonHumanAgents}
                    agentStatusById={agentStatusById}
                    humanAgentId={humanAgentId}
                    onClick={() => onSelectGroup(g.id)}
                    expanded={expandedGroups[g.id] ?? false}
                    onToggle={() => toggleGroup(g.id)}
                    matchesSearch={matchingGroupIds?.has(g.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Agent Tree ── */}
        <div>
          <SectionHeader
            label="Agent Tree"
            count={nonHumanAgents.length}
            icon={GitBranch}
            open={sectionOpen.agents !== false}
            onToggle={() => toggleSection("agents")}
          />
          {sectionOpen.agents !== false && (
            <div style={{ padding: "2px 0" }}>
              {flatAgents.length === 0 && (
                <div style={{ padding: "8px 12px", fontSize: 11, color: HUD.textDim }}>
                  {query ? "No matching agents" : "No agents"}
                </div>
              )}
              {flatAgents.map(({ agent, depth, hasChildren }) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  status={agentStatusById[agent.id] ?? "IDLE"}
                  depth={depth}
                  selected={selectedAgentId === agent.id}
                  hasChildren={hasChildren}
                  expanded={isAgentExpanded(agent.id)}
                  onToggle={() => toggleAgentExpand(agent.id)}
                  onClick={() => onSelectAgent?.(agent.id)}
                  messageCount={agentMsgCounts.get(agent.id) ?? 0}
                  matchesSearch={matchingAgentIds?.has(agent.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Direct Chats ── */}
        {filteredP2pGroups.length > 0 && (
          <div>
            <SectionHeader
              label="Direct Chats"
              count={filteredP2pGroups.length}
              icon={MessageSquare}
              open={sectionOpen.directChats !== false}
              onToggle={() => toggleSection("directChats")}
            />
            {sectionOpen.directChats !== false && (
              <div>
                {filteredP2pGroups.map((g) => {
                  const otherId = g.memberIds.find((id) => id !== humanAgentId);
                  const agent = otherId ? agentById.get(otherId) : undefined;
                  if (!agent) return null;
                  return (
                    <DirectChatRow
                      key={g.id}
                      group={g}
                      agent={agent}
                      active={g.id === activeGroupId}
                      status={agentStatusById[agent.id] ?? "IDLE"}
                      onClick={() => onSelectGroup(g.id)}
                      matchesSearch={matchingAgentIds?.has(agent.id) || matchingGroupIds?.has(g.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
