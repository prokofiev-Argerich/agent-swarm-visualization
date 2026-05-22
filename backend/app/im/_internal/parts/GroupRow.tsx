"use client";

import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { cx } from "../utils";
import type { Group, WorkspaceDefaults } from "../types";

type Props = {
  g: Group;
  activeGroupId: string | null;
  tokenLimit: number;
  session: WorkspaceDefaults | null;
  getGroupLabel: (g: Group | null | undefined) => string;
  onSelect: (id: string) => void;
  onDeleteAgent: (agentId: string, workspaceId: string) => void;
  onDeleteGroup: (groupId: string, workspaceId: string) => void;
  onToggleCollapse: (agentId: string) => void;
  tree?: {
    depth: number;
    hasChildren: boolean;
    collapsed: boolean;
    agentId: string;
    guides: boolean[];
    isLast: boolean;
  };
};

export function GroupRow({
  g,
  activeGroupId,
  tokenLimit,
  session,
  getGroupLabel,
  onSelect,
  onDeleteAgent,
  onDeleteGroup,
  onToggleCollapse,
  tree,
}: Props) {
  const depth = tree?.depth ?? 0;
  const previewIndent = tree ? depth * 14 + 14 + 18 + 6 : 0;
  return (
    <button key={g.id} className={cx("row", g.id === activeGroupId && "active")} onClick={() => onSelect(g.id)} style={{ paddingLeft: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {tree && tree.depth > 0 ? <span className="tree-prefix">{tree.guides.map((hasLine, idx) => <span key={`${g.id}-guide-${idx}`} className={hasLine ? "tree-line" : "tree-blank"} />)}<span className={tree.isLast ? "tree-elbow last" : "tree-elbow"} /></span> : null}
          {tree?.hasChildren ? <span className="tree-caret" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleCollapse(tree.agentId); }} title={tree.collapsed ? "展开" : "收起"} role="button" tabIndex={0}>{tree.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</span> : tree ? <span className="tree-caret-placeholder" /> : null}
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getGroupLabel(g)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {g.unreadCount > 0 && <span className="badge">{g.unreadCount}</span>}
          <span className="row-delete-btn" role="button" tabIndex={0} title={tree ? "删除 Agent" : "删除群组"} onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!session) return; if (tree) onDeleteAgent(tree.agentId, session.workspaceId); else onDeleteGroup(g.id, session.workspaceId); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 4, cursor: "pointer", color: "#71717a", opacity: 0, transition: "opacity 0.15s" }}><Trash2 size={14} /></span>
        </div>
      </div>
      {g.lastMessage ? <div className="muted" style={{ fontSize: 12, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginLeft: previewIndent }}>{g.lastMessage.content}</div> : null}
      {g.contextTokens > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, marginBottom: 2 }}>
            <span className="muted">Context</span>
            <span className="mono" style={{ color: (g.contextTokens / tokenLimit) > 0.8 ? "#ef4444" : (g.contextTokens / tokenLimit) > 0.5 ? "#facc15" : "#22c55e" }}>{g.contextTokens.toLocaleString()}<span className="muted" style={{ marginLeft: 4 }}>/ {tokenLimit.toLocaleString()}</span></span>
          </div>
          <div style={{ height: 3, background: "#27272a", borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, (g.contextTokens / tokenLimit) * 100)}%`, background: (g.contextTokens / tokenLimit) > 0.8 ? "#ef4444" : (g.contextTokens / tokenLimit) > 0.5 ? "#facc15" : "#22c55e", borderRadius: 2, transition: "width 0.3s ease" }} /></div>
        </div>
      )}
    </button>
  );
}
