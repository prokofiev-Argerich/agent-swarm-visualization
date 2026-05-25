"use client";

import { cx, fmtTime } from "../utils";
import { MarkdownContent } from "../MarkdownContent";
import { PhaseCard } from "./PhaseCard";
import type { DisplayItem, WorkspaceDefaults } from "../types";

type Props = {
  displayItems: DisplayItem[];
  loadingOlder: boolean;
  session: WorkspaceDefaults | null;
  agentRoleById: Map<string, string>;
  togglePhaseExpand: (phaseId: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
};

export function MessageTimeline({
  displayItems,
  loadingOlder,
  session,
  agentRoleById,
  togglePhaseExpand,
  containerRef,
  bottomRef,
}: Props) {
  return (
    <div className="chat" ref={containerRef}>
      {loadingOlder && (
        <div style={{ textAlign: "center", padding: 12, color: "#a1a1aa", fontSize: 12 }}>
          Loading older messages...
        </div>
      )}
      {displayItems.map((item) => {
        if (item.kind === "loading-older") {
          return (
            <div key="loading-older" style={{ textAlign: "center", padding: 12, color: "#a1a1aa", fontSize: 12 }}>
              Loading older messages...
            </div>
          );
        }
        if (item.kind === "phase-card") {
          return <PhaseCard key={item.summary.id} summary={item.summary} expanded={item.expanded} onToggle={togglePhaseExpand} />;
        }
        // kind === "message"
        const m = item.message;
        const isMe = m.senderId === (session?.humanAgentId ?? null);
        const senderRole =
          agentRoleById.get(m.senderId) ??
          (isMe ? "human" : m.senderId.slice(0, 8));
        return (
          <div
            key={m.id}
            style={{
              display: "flex",
              justifyContent: isMe ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div className={cx("bubble", isMe ? "me" : "other")}>
              <div className="bubble-meta">
                {fmtTime(m.sendTime)} • {senderRole}
              </div>
              <MarkdownContent content={m.content} />
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
