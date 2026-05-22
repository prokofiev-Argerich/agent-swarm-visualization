"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { Fragment } from "react";
import type { RightPanelId, RightPanelState } from "../types";
import { RIGHT_PANEL_HEADER_HEIGHT, RIGHT_PANEL_MIN_HEIGHT } from "../constants";
import { cx } from "../utils";
import { MarkdownContent } from "../MarkdownContent";
import { IMHistoryList } from "../../IMHistoryList";
import { historyRole, historyAccent, summarizeHistoryEntry } from "./HistoryItemHelpers";

type Props = {
  rightPanels: RightPanelState[];
  toggleRightPanel: (id: RightPanelId) => void;
  handleRightPanelResizeStart: (index: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  contentStream: string;
  reasoningStream: string;
  toolStream: string;
  llmHistory: string;
  llmHistoryParsed: any;
  llmHistoryFormatted: string;
};

export function LiveStreamPanel({
  rightPanels,
  toggleRightPanel,
  handleRightPanelResizeStart,
  contentStream,
  reasoningStream,
  toolStream,
  llmHistory,
  llmHistoryParsed,
  llmHistoryFormatted,
}: Props) {
  return (
    <div className="agent-panels">
      {rightPanels.map((panel, idx) => (
        <Fragment key={panel.id}>
          <div
            className={cx("agent-panel", panel.collapsed && "collapsed")}
            style={
              panel.collapsed
                ? { flex: `0 0 ${RIGHT_PANEL_HEADER_HEIGHT}px`, height: RIGHT_PANEL_HEADER_HEIGHT }
                : { flex: `1 1 ${panel.size}px`, minHeight: RIGHT_PANEL_MIN_HEIGHT }
            }
          >
            <button
              className="agent-panel-header"
              type="button"
              onClick={() => toggleRightPanel(panel.id)}
            >
              <span className="agent-panel-caret">{panel.collapsed ? "▸" : "▾"}</span>
              <span>{panel.title}</span>
            </button>
            {!panel.collapsed ? (
              <div className={cx("agent-panel-body", "mono")}>
                {panel.id === "history" ? (
                  Array.isArray(llmHistoryParsed) ? (
                    <IMHistoryList
                      entries={llmHistoryParsed}
                      historyRole={historyRole}
                      historyAccent={historyAccent}
                      summarizeHistoryEntry={summarizeHistoryEntry}
                    />
                  ) : (
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      {llmHistoryFormatted || "—"}
                    </pre>
                  )
                ) : panel.id === "content" ? (
                  <MarkdownContent content={contentStream} />
                ) : panel.id === "reasoning" ? (
                  <MarkdownContent content={reasoningStream} />
                ) : (
                  <MarkdownContent content={toolStream} />
                )}
              </div>
            ) : null}
          </div>
          {idx < rightPanels.length - 1 ? (
            <div
              className={cx(
                "agent-panel-resizer",
                (panel.collapsed || rightPanels[idx + 1]?.collapsed) && "disabled"
              )}
              onPointerDown={(e) => handleRightPanelResizeStart(idx, e)}
            />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
