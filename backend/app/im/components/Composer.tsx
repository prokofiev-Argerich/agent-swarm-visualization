"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { HUD } from "./uiTokens";

export function Composer({
  draft,
  onDraftChange,
  onSend,
  disabled,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        borderTop: `1px solid ${HUD.panelBorder}`,
        background: "rgba(255,255,255,0.70)",
        backdropFilter: HUD.panelBlur,
        WebkitBackdropFilter: HUD.panelBlur,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={draft}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onDraftChange(e.target.value)}
          placeholder="Type a message…"
          onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void onSend();
            }
          }}
          style={{
            flex: 1,
            height: 56,
            resize: "none",
            padding: "10px 12px",
            borderRadius: HUD.panelRadius,
            background: HUD.panelBgOpaque,
            border: `1px solid ${HUD.panelBorder}`,
            color: HUD.textPrimary,
            fontSize: 13,
            lineHeight: 1.5,
            fontFamily: "inherit",
            outline: "none",
            transition: HUD.hoverTransition,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = HUD.panelBorderStrong;
            e.currentTarget.style.boxShadow = `0 0 0 1px ${HUD.accentCyan}55, 0 0 12px rgba(34,211,238,0.18)`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = HUD.panelBorder;
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <button
          type="button"
          onClick={() => void onSend()}
          disabled={disabled}
          title="Send (Ctrl/Cmd + Enter)"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "0 14px",
            height: 56,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: HUD.labelLetterSpacing,
            textTransform: "uppercase",
            background: disabled ? "rgba(34,211,238,0.06)" : "rgba(34,211,238,0.14)",
            border: `1px solid ${disabled ? HUD.panelBorder : HUD.accentCyan}`,
            borderRadius: HUD.panelRadius,
            color: disabled ? HUD.textDim : HUD.accentCyan,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.55 : 1,
            transition: HUD.hoverTransition,
            boxShadow: disabled ? "none" : `0 0 12px rgba(34,211,238,0.18)`,
          }}
          onMouseEnter={(e) => {
            if (disabled) return;
            e.currentTarget.style.background = "rgba(34,211,238,0.22)";
            e.currentTarget.style.boxShadow = `0 0 14px rgba(34,211,238,0.32)`;
          }}
          onMouseLeave={(e) => {
            if (disabled) return;
            e.currentTarget.style.background = "rgba(34,211,238,0.14)";
            e.currentTarget.style.boxShadow = `0 0 12px rgba(34,211,238,0.18)`;
          }}
        >
          <Send size={14} strokeWidth={2.2} />
          Send
        </button>
      </div>
      <div
        style={{
          fontSize: 10,
          color: HUD.textDim,
          fontFamily: "ui-monospace, monospace",
          letterSpacing: "0.04em",
          textAlign: "right",
        }}
      >
        Ctrl / ⌘ + Enter to send
      </div>
    </div>
  );
}
