"use client";

import type { CSSProperties, ReactNode } from "react";
import { CornerUpLeft, CircleDot } from "lucide-react";
import { HUD, STATUS_COLORS, roleColor, type AgentStatus } from "./uiTokens";

export type SenderType = "USER" | "AGENT" | "SYSTEM";

type MessageEventCardProps = {
  messageId: string;
  senderId: string;
  senderType: SenderType;
  senderRole?: string | null;
  agentStatus?: AgentStatus | null;
  contentType?: string;
  time: string;
  body: ReactNode;
  causedBy?: string | null;
  downstreamCount?: number;
  isSelected?: boolean;
  isHighlighted?: boolean;
  isUpstream?: boolean;
  onSelect?: () => void;
  onJumpToUpstream?: () => void;
  onJumpToCausedBy?: () => void;
};

const SENDER_TYPE_COLOR: Record<SenderType, string> = {
  USER: "#22c55e",
  AGENT: HUD.accentCyan,
  SYSTEM: HUD.accentViolet,
};

function CausalityRow({
  causedBy,
  onJump,
}: {
  causedBy?: string | null;
  onJump?: () => void;
}) {
  if (causedBy) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onJump?.();
        }}
        title={`Triggered by message ${causedBy}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 600,
          background: "rgba(251,191,36,0.10)",
          border: `1px solid ${HUD.accentAmber}55`,
          borderRadius: 4,
          color: HUD.accentAmber,
          cursor: "pointer",
          fontFamily: "ui-sans-serif, system-ui",
          letterSpacing: "0.02em",
          transition: HUD.hoverTransition,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(251,191,36,0.18)";
          e.currentTarget.style.boxShadow = "0 0 10px rgba(251,191,36,0.30)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(251,191,36,0.10)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <CornerUpLeft size={12} strokeWidth={2.4} />
        <span>
          Triggered by{" "}
          <span style={{ fontFamily: "ui-monospace, monospace", opacity: 0.85 }}>
            msg/{causedBy.slice(0, 8)}
          </span>
        </span>
      </button>
    );
  }
  return (
    <span
      title="This message has no upstream cause"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 600,
        background: "rgba(34,211,238,0.05)",
        border: `1px solid ${HUD.accentCyan}33`,
        borderRadius: 4,
        color: HUD.accentCyan,
        opacity: 0.75,
        letterSpacing: "0.02em",
      }}
    >
      <CircleDot size={12} strokeWidth={2.2} />
      <span>Initial message</span>
    </span>
  );
}

export function MessageEventCard({
  messageId,
  senderId,
  senderType,
  senderRole,
  agentStatus,
  contentType,
  time,
  body,
  causedBy,
  downstreamCount,
  isSelected,
  isHighlighted,
  isUpstream,
  onSelect,
  onJumpToUpstream,
  onJumpToCausedBy,
}: MessageEventCardProps) {
  const statusToken = agentStatus ? STATUS_COLORS[agentStatus] : null;
  const accentColor =
    senderType === "AGENT"
      ? roleColor(senderRole ?? undefined)
      : SENDER_TYPE_COLOR[senderType];

  const baseBorder = isSelected
    ? HUD.selectedBorder
    : isUpstream
      ? "rgba(251,191,36,0.55)"
      : statusToken?.border ?? `${accentColor}40`;

  const shadow = isHighlighted
    ? HUD.causalFlashGlow
    : isSelected
      ? HUD.selectedGlow
      : statusToken?.glow ?? "none";

  const containerStyle: CSSProperties = {
    background: isSelected ? HUD.selectedBg : HUD.panelBg,
    border: `1px solid ${baseBorder}`,
    backdropFilter: HUD.panelBlur,
    WebkitBackdropFilter: HUD.panelBlur,
    boxShadow: shadow,
    borderRadius: HUD.panelRadius,
    padding: 0,
    cursor: onSelect ? "pointer" : "default",
    transition: HUD.selectionTransition,
    position: "relative",
    overflow: "hidden",
    animation: isHighlighted ? "causal-flash-keyframes 1.5s ease-out" : undefined,
  };

  return (
    <div
      data-message-id={messageId}
      style={containerStyle}
      onClick={() => onSelect?.()}
    >
      {/* left accent stripe */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 2,
          background: accentColor,
          opacity: 0.6,
        }}
      />

      {/* Header: sender meta */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          fontSize: 10,
          fontFamily: "ui-monospace, monospace",
          color: HUD.textDim,
          flexWrap: "wrap",
        }}
      >
        {statusToken && (
          <span
            title={agentStatus ?? undefined}
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: statusToken.dot,
              boxShadow: statusToken.glow,
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: HUD.labelLetterSpacing,
            color: SENDER_TYPE_COLOR[senderType],
            textTransform: "uppercase",
          }}
        >
          {senderType}
        </span>
        <span style={{ color: HUD.textPrimary, fontWeight: 600 }}>
          {senderRole ?? senderId.slice(0, 8)}
        </span>
        <span style={{ color: HUD.textDim }}>·</span>
        <span title={messageId}>msg/{messageId.slice(0, 6)}</span>
        <span style={{ color: HUD.textDim }}>·</span>
        <span>{time}</span>
        {contentType && contentType !== "text" && (
          <>
            <span style={{ color: HUD.textDim }}>·</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: HUD.labelLetterSpacing,
                textTransform: "uppercase",
                color: HUD.accentViolet,
                padding: "1px 4px",
                border: `1px solid ${HUD.accentViolet}40`,
                borderRadius: 3,
              }}
            >
              {contentType}
            </span>
          </>
        )}
      </div>

      {/* Causality row: triggered-by / initial */}
      <div
        style={{
          padding: "0 12px 8px",
          borderBottom: `1px solid ${HUD.panelBorder}`,
        }}
      >
        <CausalityRow
          causedBy={causedBy}
          onJump={() => {
            onJumpToCausedBy?.();
            onJumpToUpstream?.();
          }}
        />
      </div>

      {/* Body */}
      <div
        style={{
          padding: "10px 12px",
          color: HUD.textPrimary,
          fontSize: 13,
          lineHeight: 1.55,
          wordBreak: "break-word",
        }}
      >
        {body}
      </div>

      {/* Footer: downstream count only */}
      {(downstreamCount ?? 0) > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px",
            borderTop: `1px solid ${HUD.panelBorder}`,
            fontSize: 10,
            color: HUD.textDim,
            background: "rgba(255,255,255,0.012)",
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: HUD.accentCyan,
              fontFamily: "ui-monospace, monospace",
            }}
          >
            ↓ {downstreamCount} downstream
          </span>
        </div>
      )}
    </div>
  );
}
