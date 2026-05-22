"use client";

import { useState } from "react";
import { HUD, STATUS_COLORS, roleColor, type AgentStatus } from "./uiTokens";
import { CompactAgentGraph } from "./CompactAgentGraph";

type Message = {
  id: string;
  senderId: string;
  content: string;
  contentType: string;
  sendTime: string;
  causedBy?: string;
};

type CausalityInspectorProps = {
  selectedMessage: Message | null;
  upstreamMessage: Message | null;
  downstreamMessages: Message[];
  humanAgentId?: string | null;
  agentRoleById: Map<string, string>;
  agentStatusById: Record<string, AgentStatus | undefined>;
  onJumpToMessage: (messageId: string) => void;
  fmtTime: (iso: string) => string;
};

function MessageMini({
  message,
  label,
  labelColor,
  humanAgentId,
  agentRoleById,
  agentStatusById,
  onClick,
  fmtTime,
}: {
  message: Message;
  label: string;
  labelColor: string;
  humanAgentId?: string | null;
  agentRoleById: Map<string, string>;
  agentStatusById: Record<string, AgentStatus | undefined>;
  onClick: () => void;
  fmtTime: (iso: string) => string;
}) {
  const isMe = message.senderId === humanAgentId;
  const role = agentRoleById.get(message.senderId) ?? (isMe ? "human" : message.senderId.slice(0, 8));
  const status = agentStatusById[message.senderId];
  const statusToken = status ? STATUS_COLORS[status] : null;
  const accent = isMe ? "#22c55e" : roleColor(role);
  const preview = message.content.length > 120 ? message.content.slice(0, 120) + "…" : message.content;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        background: "rgba(255,255,255,0.015)",
        border: `1px solid ${accent}30`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 4,
        padding: "6px 10px",
        color: HUD.textPrimary,
        cursor: "pointer",
        fontSize: 11,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        width: "100%",
        transition: HUD.hoverTransition,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: HUD.textDim, fontFamily: "ui-monospace, monospace", flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: HUD.labelLetterSpacing,
            color: labelColor,
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {statusToken && (
          <span style={{ width: 5, height: 5, borderRadius: 999, background: statusToken.dot, boxShadow: statusToken.glow }} />
        )}
        <span style={{ color: accent, fontWeight: 600 }}>{role}</span>
        <span>·</span>
        <span>msg/{message.id.slice(0, 6)}</span>
        <span>·</span>
        <span>{fmtTime(message.sendTime)}</span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: HUD.textSecondary,
          lineHeight: 1.4,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
        }}
      >
        {preview || <span style={{ color: HUD.textDim }}>(empty)</span>}
      </div>
    </button>
  );
}

function SectionTitle({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: HUD.labelLetterSpacing,
        color: accent ?? HUD.textDim,
        textTransform: "uppercase",
        marginBottom: 6,
        paddingLeft: 1,
      }}
    >
      {children}
    </div>
  );
}

function KeyValueRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 11, lineHeight: 1.5, alignItems: "baseline" }}>
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: HUD.labelLetterSpacing,
          color: HUD.textDim,
          textTransform: "uppercase",
          minWidth: 70,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: HUD.textPrimary,
          fontFamily: mono ? "ui-monospace, monospace" : undefined,
          wordBreak: "break-word",
          minWidth: 0,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Diagnostics ── */

type ChainStatus = "healthy" | "root" | "warning" | "broken";

function StatusPill({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "ok" | "warn" | "info" | "error";
}) {
  const token =
    status === "ok"
      ? STATUS_COLORS.IDLE
      : status === "warn"
        ? STATUS_COLORS.BUSY
        : status === "error"
          ? STATUS_COLORS.ERROR
          : STATUS_COLORS.OFFLINE;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        borderRadius: 3,
        background: token.bg,
        border: `1px solid ${token.border}`,
        fontSize: 10,
        fontFamily: "ui-monospace, monospace",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          background: token.dot,
          boxShadow: token.glow,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: HUD.labelLetterSpacing, textTransform: "uppercase", color: HUD.textDim }}>
        {label}
      </span>
      <span style={{ color: token.text }}>{value}</span>
    </div>
  );
}

function computeChainStatus(
  selectedType: string,
  upstreamStatus: "ROOT" | "FOUND" | "MISSING",
  downstreamCount: number
): { chain: ChainStatus; warnings: string[] } {
  const warnings: string[] = [];

  // Priority 1: broken — causedBy present but upstream missing
  if (upstreamStatus === "MISSING") {
    warnings.push("Upstream reference exists but message not loaded");
    return { chain: "broken", warnings };
  }

  // Priority 2: warning — agent message without causedBy
  if (selectedType === "AGENT" && upstreamStatus === "ROOT") {
    warnings.push("Agent message without caused_by — possible missing link");
    return { chain: "warning", warnings };
  }

  // Priority 3: warning — high fan-out
  if (downstreamCount > 20) {
    warnings.push("High fan-out: this message triggered many downstream messages");
    return { chain: "warning", warnings };
  }

  // No issues
  if (upstreamStatus === "ROOT") {
    return { chain: "root", warnings };
  }

  return { chain: "healthy", warnings };
}

function DiagnosticsPanel({
  selectedMessage,
  upstreamMessage,
  downstreamMessages,
  upstreamId,
  upstreamStatus,
  selectedType,
  humanAgentId,
  agentRoleById,
}: {
  selectedMessage: Message;
  upstreamMessage: Message | null;
  downstreamMessages: Message[];
  upstreamId: string | null;
  upstreamStatus: "ROOT" | "FOUND" | "MISSING";
  selectedType: string;
  humanAgentId?: string | null;
  agentRoleById: Map<string, string>;
}) {
  const { chain, warnings } = computeChainStatus(
    selectedType,
    upstreamStatus,
    downstreamMessages.length
  );

  const chainToken =
    chain === "healthy"
      ? STATUS_COLORS.IDLE
      : chain === "warning"
        ? STATUS_COLORS.BUSY
        : chain === "broken"
          ? STATUS_COLORS.ERROR
          : STATUS_COLORS.OFFLINE;

  return (
    <div>
      <SectionTitle accent={HUD.textMuted}>Diagnostics</SectionTitle>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "8px 10px",
          background: "rgba(255,255,255,0.012)",
          border: `1px solid ${HUD.panelBorder}`,
          borderRadius: 4,
        }}
      >
        {/* Chain status banner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 8px",
            background: chainToken.bg,
            border: `1px solid ${chainToken.border}`,
            borderRadius: 3,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: chainToken.dot,
              boxShadow: chainToken.glow,
            }}
          />
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: HUD.labelLetterSpacing,
              textTransform: "uppercase",
              color: HUD.textDim,
            }}
          >
            Chain
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: chainToken.text, fontFamily: "ui-monospace, monospace" }}>
            {chain}
          </span>
        </div>

        {/* Status pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <StatusPill
            label="caused_by"
            value={upstreamId ? "present" : "null"}
            status={upstreamId ? "ok" : "info"}
          />
          <StatusPill
            label="upstream"
            value={
              upstreamStatus === "ROOT"
                ? "not required"
                : upstreamStatus === "FOUND"
                  ? "found"
                  : "missing"
            }
            status={
              upstreamStatus === "FOUND"
                ? "ok"
                : upstreamStatus === "MISSING"
                  ? "error"
                  : "info"
            }
          />
          <StatusPill
            label="downstream"
            value={downstreamMessages.length > 0 ? `${downstreamMessages.length}` : "leaf"}
            status={downstreamMessages.length > 0 ? "ok" : "info"}
          />
          <StatusPill
            label="sender"
            value={
              selectedMessage.senderId === humanAgentId || agentRoleById.has(selectedMessage.senderId)
                ? "resolved"
                : "unknown"
            }
            status={
              selectedMessage.senderId === humanAgentId || agentRoleById.has(selectedMessage.senderId)
                ? "ok"
                : "warn"
            }
          />
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {warnings.map((w, i) => (
              <div
                key={i}
                style={{
                  fontSize: 10,
                  color: STATUS_COLORS.BUSY.text,
                  fontFamily: "ui-monospace, monospace",
                  padding: "3px 6px",
                  background: STATUS_COLORS.BUSY.bg,
                  border: `1px solid ${STATUS_COLORS.BUSY.border}`,
                  borderRadius: 3,
                }}
              >
                {w}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CausalityInspector({
  selectedMessage,
  upstreamMessage,
  downstreamMessages,
  humanAgentId,
  agentRoleById,
  agentStatusById,
  onJumpToMessage,
  fmtTime,
}: CausalityInspectorProps) {
  const [showMap, setShowMap] = useState(false);

  if (!selectedMessage) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          color: HUD.textDim,
          fontSize: 12,
          textAlign: "center",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: HUD.labelLetterSpacing, color: HUD.accentCyan, textTransform: "uppercase" }}>
          Causality Inspector
        </div>
        <div>Select a message to inspect causality.</div>
      </div>
    );
  }

  const isSelectedFromMe = selectedMessage.senderId === humanAgentId;
  const selectedRole =
    agentRoleById.get(selectedMessage.senderId) ??
    (isSelectedFromMe ? "human" : selectedMessage.senderId.slice(0, 8));
  const selectedType =
    selectedMessage.contentType === "phase_start" || selectedMessage.contentType === "phase_summary"
      ? "SYSTEM"
      : isSelectedFromMe
        ? "USER"
        : "AGENT";

  // 3 状态: 根消息 / 上游已找到 / 上游引用存在但 not loaded
  const upstreamId = selectedMessage.causedBy ?? null;
  const upstreamStatus: "ROOT" | "FOUND" | "MISSING" =
    !upstreamId ? "ROOT" : upstreamMessage ? "FOUND" : "MISSING";

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        color: HUD.textPrimary,
      }}
    >
      {/* CURRENT */}
      <div>
        <SectionTitle accent={HUD.accentCyan}>Current Message</SectionTitle>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "8px 10px",
            background: "rgba(34,211,238,0.04)",
            border: `1px solid ${HUD.selectedBorder}`,
            borderRadius: 4,
          }}
        >
          <KeyValueRow label="id" value={`msg/${selectedMessage.id.slice(0, 12)}`} mono />
          <KeyValueRow
            label="sender"
            value={
              <span>
                <span style={{ color: roleColor(selectedRole) }}>{selectedRole}</span>{" "}
                <span style={{ color: HUD.textDim, fontFamily: "ui-monospace, monospace" }}>
                  ({selectedMessage.senderId.slice(0, 8)})
                </span>
              </span>
            }
          />
          <KeyValueRow label="type" value={selectedType} />
          {selectedMessage.contentType !== "text" && (
            <KeyValueRow label="content" value={selectedMessage.contentType} />
          )}
          <KeyValueRow label="at" value={fmtTime(selectedMessage.sendTime)} />
          <KeyValueRow
            label="caused_by"
            value={
              upstreamId ? (
                <span style={{ color: HUD.accentAmber, fontFamily: "ui-monospace, monospace" }}>
                  msg/{upstreamId.slice(0, 12)}
                </span>
              ) : (
                <span style={{ color: HUD.textDim }}>null (root)</span>
              )
            }
          />
        </div>
      </div>

      {/* CAUSAL MAP (opt-in; hidden when isolated) */}
      {(upstreamMessage || downstreamMessages.length > 0) && (
        <div>
          <button
            type="button"
            onClick={() => setShowMap((p) => !p)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 8px",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: HUD.labelLetterSpacing,
              textTransform: "uppercase",
              background: "transparent",
              border: `1px solid ${HUD.panelBorder}`,
              borderRadius: 3,
              color: showMap ? HUD.accentCyan : HUD.textMuted,
              cursor: "pointer",
              transition: HUD.hoverTransition,
              marginBottom: showMap ? 8 : 0,
            }}
          >
            <span>{showMap ? "▾" : "▸"}</span>
            Causal Map
          </button>
          {showMap && (
            <CompactAgentGraph
              selectedMessage={selectedMessage}
              upstreamMessage={upstreamMessage}
              downstreamMessages={downstreamMessages}
              humanAgentId={humanAgentId}
              agentRoleById={agentRoleById}
              agentStatusById={agentStatusById}
              onJumpToMessage={onJumpToMessage}
            />
          )}
        </div>
      )}

      {/* UPSTREAM */}
      <div>
        <SectionTitle accent={HUD.accentAmber}>Upstream</SectionTitle>
        {upstreamStatus === "ROOT" && (
          <div
            style={{
              padding: "8px 10px",
              fontSize: 11,
              color: HUD.textDim,
              background: "rgba(255,255,255,0.015)",
              border: `1px dashed ${HUD.panelBorder}`,
              borderRadius: 4,
            }}
          >
            This is a root message. No upstream cause.
          </div>
        )}
        {upstreamStatus === "FOUND" && upstreamMessage && (
          <MessageMini
            message={upstreamMessage}
            label="Upstream"
            labelColor={HUD.accentAmber}
            humanAgentId={humanAgentId}
            agentRoleById={agentRoleById}
            agentStatusById={agentStatusById}
            onClick={() => onJumpToMessage(upstreamMessage.id)}
            fmtTime={fmtTime}
          />
        )}
        {upstreamStatus === "MISSING" && (
          <div
            style={{
              padding: "8px 10px",
              fontSize: 11,
              color: HUD.accentAmber,
              background: "rgba(251,191,36,0.05)",
              border: `1px solid ${HUD.accentAmber}40`,
              borderRadius: 4,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ fontWeight: 600 }}>Upstream reference exists but message is not loaded.</div>
            <div style={{ color: HUD.textDim, fontFamily: "ui-monospace, monospace", fontSize: 10 }}>
              caused_by: msg/{upstreamId?.slice(0, 12)}
            </div>
          </div>
        )}
      </div>

      {/* DOWNSTREAM */}
      <div>
        <SectionTitle accent={HUD.accentCyan}>
          Downstream ({downstreamMessages.length})
        </SectionTitle>
        {downstreamMessages.length === 0 ? (
          <div
            style={{
              padding: "8px 10px",
              fontSize: 11,
              color: HUD.textDim,
              background: "rgba(255,255,255,0.015)",
              border: `1px dashed ${HUD.panelBorder}`,
              borderRadius: 4,
            }}
          >
            Leaf message · no downstream caused.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {downstreamMessages.map((d) => (
              <MessageMini
                key={d.id}
                message={d}
                label="Downstream"
                labelColor={HUD.accentCyan}
                humanAgentId={humanAgentId}
                agentRoleById={agentRoleById}
                agentStatusById={agentStatusById}
                onClick={() => onJumpToMessage(d.id)}
                fmtTime={fmtTime}
              />
            ))}
          </div>
        )}
      </div>

      {/* DIAGNOSTICS */}
      <DiagnosticsPanel
        selectedMessage={selectedMessage}
        upstreamMessage={upstreamMessage}
        downstreamMessages={downstreamMessages}
        upstreamId={upstreamId}
        upstreamStatus={upstreamStatus}
        selectedType={selectedType}
        humanAgentId={humanAgentId}
        agentRoleById={agentRoleById}
      />
    </div>
  );
}
