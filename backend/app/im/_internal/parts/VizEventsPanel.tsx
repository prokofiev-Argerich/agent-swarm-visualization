"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "../utils";
import type { VizEvent } from "../types";

type Props = {
  vizEvents: VizEvent[];
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
};

export function VizEventsPanel({ vizEvents, collapsed, onCollapse, onExpand }: Props) {
  return (
    <>
      <div className={cx("viz-events", collapsed && "collapsed")}>
        {!collapsed ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>事件流</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="muted mono">{vizEvents.length}</span>
                <button
                  type="button"
                  className="viz-events-toggle"
                  onClick={onCollapse}
                  title="收起"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            {vizEvents.length === 0 ? (
              <div className="muted">暂无事件</div>
            ) : (
              vizEvents
                .slice(-6)
                .reverse()
                .map((evt) => (
                  <div
                    key={evt.id}
                    style={{
                      marginBottom: 8,
                      paddingBottom: 8,
                      borderBottom: "1px solid rgba(39,39,42,0.6)",
                    }}
                  >
                    <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background:
                            evt.kind === "agent"
                              ? "#60a5fa"
                              : evt.kind === "message"
                                ? "#fbbf24"
                                : evt.kind === "llm"
                                  ? "#38bdf8"
                                  : evt.kind === "tool"
                                    ? "#f97316"
                                    : "#a855f7",
                          boxShadow: "0 0 8px rgba(0,0,0,0.5)",
                        }}
                      />
                      <span>{evt.label}</span>
                    </div>
                    <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>
                      {new Date(evt.at).toLocaleTimeString()}
                    </div>
                  </div>
                ))
            )}
          </>
        ) : null}
      </div>
      {collapsed ? (
        <button
          type="button"
          className="viz-events-toggle floating"
          onClick={onExpand}
          title="展开"
        >
          <ChevronLeft size={16} />
        </button>
      ) : null}
    </>
  );
}
