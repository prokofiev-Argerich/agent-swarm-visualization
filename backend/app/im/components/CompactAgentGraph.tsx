"use client";

import { HUD, STATUS_COLORS, roleColor, type AgentStatus } from "./uiTokens";

type Message = {
  id: string;
  senderId: string;
  content: string;
  contentType: string;
  sendTime: string;
  causedBy?: string;
};

type CompactAgentGraphProps = {
  selectedMessage: Message;
  upstreamMessage: Message | null;
  downstreamMessages: Message[];
  humanAgentId?: string | null;
  agentRoleById: Map<string, string>;
  agentStatusById: Record<string, AgentStatus | undefined>;
  onJumpToMessage?: (messageId: string) => void;
};

type NodePos = {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  status?: AgentStatus | null;
  messageId?: string;
  isCenter?: boolean;
};

type EdgeInfo = {
  fromId: string;
  toId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

const WIDTH = 380;
const HEIGHT = 220;
const NODE_RADIUS = 18;
const ROW_UPSTREAM_Y = 32;
const ROW_CURRENT_Y = 100;
const ROW_DOWNSTREAM_Y = 178;
const DOWNSTREAM_MAX = 4;

function shortenName(role: string, fallback: string): string {
  return role.length > 8 ? role.slice(0, 8) : role || fallback.slice(0, 6);
}

export function CompactAgentGraph({
  selectedMessage,
  upstreamMessage,
  downstreamMessages,
  humanAgentId,
  agentRoleById,
  agentStatusById,
  onJumpToMessage,
}: CompactAgentGraphProps) {
  const nodes: NodePos[] = [];
  const edges: EdgeInfo[] = [];

  const senderRole = (id: string): string => {
    if (id === humanAgentId) return "human";
    return agentRoleById.get(id) ?? id.slice(0, 6);
  };

  // CURRENT (center)
  const currentSender = selectedMessage.senderId;
  const currentNode: NodePos = {
    id: `current-${selectedMessage.id}`,
    label: shortenName(senderRole(currentSender), currentSender),
    x: WIDTH / 2,
    y: ROW_CURRENT_Y,
    color: currentSender === humanAgentId ? "#22c55e" : roleColor(senderRole(currentSender)),
    status: agentStatusById[currentSender],
    messageId: selectedMessage.id,
    isCenter: true,
  };
  nodes.push(currentNode);

  // UPSTREAM (top)
  if (upstreamMessage) {
    const usSender = upstreamMessage.senderId;
    const upNode: NodePos = {
      id: `upstream-${upstreamMessage.id}`,
      label: shortenName(senderRole(usSender), usSender),
      x: WIDTH / 2,
      y: ROW_UPSTREAM_Y,
      color: usSender === humanAgentId ? "#22c55e" : roleColor(senderRole(usSender)),
      status: agentStatusById[usSender],
      messageId: upstreamMessage.id,
    };
    nodes.push(upNode);
    edges.push({
      fromId: upNode.id,
      toId: currentNode.id,
      fromX: upNode.x,
      fromY: upNode.y + NODE_RADIUS,
      toX: currentNode.x,
      toY: currentNode.y - NODE_RADIUS,
    });
  }

  // DOWNSTREAM (bottom row)
  const visibleDownstream = downstreamMessages.slice(0, DOWNSTREAM_MAX);
  const n = visibleDownstream.length;
  if (n > 0) {
    const totalWidth = WIDTH - 60;
    const stepX = n > 1 ? totalWidth / (n - 1) : 0;
    const startX = n > 1 ? 30 : WIDTH / 2;
    visibleDownstream.forEach((d, i) => {
      const sender = d.senderId;
      const x = n > 1 ? startX + i * stepX : startX;
      const dn: NodePos = {
        id: `downstream-${d.id}`,
        label: shortenName(senderRole(sender), sender),
        x,
        y: ROW_DOWNSTREAM_Y,
        color: sender === humanAgentId ? "#22c55e" : roleColor(senderRole(sender)),
        status: agentStatusById[sender],
        messageId: d.id,
      };
      nodes.push(dn);
      edges.push({
        fromId: currentNode.id,
        toId: dn.id,
        fromX: currentNode.x,
        fromY: currentNode.y + NODE_RADIUS,
        toX: dn.x,
        toY: dn.y - NODE_RADIUS,
      });
    });
  }

  return (
    <div
      style={{
        position: "relative",
        background:
          "radial-gradient(circle at 50% 50%, rgba(8,145,178,0.06), transparent 60%), linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px) 0 0 / 16px 16px, linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px) 0 0 / 16px 16px, #f8fafc",
        border: `1px solid ${HUD.panelBorder}`,
        borderRadius: HUD.panelRadius,
        padding: 6,
      }}
    >
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ display: "block", width: "100%", height: "auto" }}>
        <defs>
          <marker
            id="compact-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={HUD.accentCyan} opacity="0.7" />
          </marker>
        </defs>
        {/* row labels */}
        <text x={6} y={ROW_UPSTREAM_Y + 4} fontSize="8" fill={HUD.textDim} letterSpacing="0.06em">
          UPSTREAM
        </text>
        <text x={6} y={ROW_CURRENT_Y + 4} fontSize="8" fill={HUD.accentCyan} letterSpacing="0.06em">
          CURRENT
        </text>
        <text x={6} y={ROW_DOWNSTREAM_Y + 4} fontSize="8" fill={HUD.textDim} letterSpacing="0.06em">
          DOWNSTREAM
        </text>

        {edges.map((e, idx) => (
          <line
            key={idx}
            x1={e.fromX}
            y1={e.fromY}
            x2={e.toX}
            y2={e.toY}
            stroke={HUD.accentCyan}
            strokeWidth="1.5"
            strokeOpacity="0.7"
            markerEnd="url(#compact-arrow)"
            strokeDasharray="3 3"
          />
        ))}

        {nodes.map((n) => {
          const status = n.status ?? null;
          const statusToken = status ? STATUS_COLORS[status as AgentStatus] : null;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              style={{ cursor: n.messageId ? "pointer" : "default" }}
              onClick={() => {
                if (n.messageId && onJumpToMessage) onJumpToMessage(n.messageId);
              }}
            >
              <circle
                r={NODE_RADIUS}
                fill="#f1f5f9"
                stroke={n.color}
                strokeWidth={n.isCenter ? 2.5 : 1.5}
                opacity={1}
                style={{
                  filter: n.isCenter
                    ? `drop-shadow(0 0 8px ${n.color}80)`
                    : statusToken
                      ? `drop-shadow(0 0 4px ${statusToken.dot}60)`
                      : "none",
                }}
              />
              {statusToken && (
                <circle
                  r={3}
                  cx={NODE_RADIUS - 4}
                  cy={-NODE_RADIUS + 4}
                  fill={statusToken.dot}
                  opacity={0.95}
                />
              )}
              <text
                textAnchor="middle"
                dy={4}
                fontSize="10"
                fontWeight="700"
                fill={n.color}
                fontFamily="ui-monospace, monospace"
              >
                {n.label}
              </text>
            </g>
          );
        })}

        {/* empty state */}
        {nodes.length === 1 && (
          <text
            x={WIDTH / 2}
            y={HEIGHT - 8}
            textAnchor="middle"
            fontSize="9"
            fill={HUD.textDim}
            fontFamily="ui-monospace, monospace"
            letterSpacing="0.04em"
          >
            isolated · no upstream / downstream
          </text>
        )}
      </svg>
    </div>
  );
}
