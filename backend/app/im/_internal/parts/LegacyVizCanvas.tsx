"use client";

import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Briefcase, Code2, Network, User } from "lucide-react";
import { cx } from "../utils";
import type { AgentStatus } from "@/lib/agent-status";
import type { UUID, VizBeam } from "../types";

function statusColor(status: string) {
  if (status === "BUSY") return "#ef4444";
  if (status === "ERROR") return "#f97316";
  if (status === "WAKING") return "#facc15";
  if (status === "IDLE") return "#4ade80";
  return "#e4e4e7";
}

type VizLayout = {
  positions: Map<UUID, { x: number; y: number }>;
  ordered: Array<{ id: UUID; role: string }>;
  edges: Array<{ fromId: UUID; toId: UUID }>;
};

type Props = {
  vizSize: { width: number; height: number };
  vizScale: number;
  vizOffset: { x: number; y: number };
  vizIsPanning: boolean;
  setVizScale: React.Dispatch<React.SetStateAction<number>>;
  setVizOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  setVizIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  vizRef: React.RefObject<HTMLDivElement | null>;
  vizPanStartRef: React.MutableRefObject<{ x: number; y: number; ox: number; oy: number } | null>;
  vizLayout: VizLayout;
  vizBeams: VizBeam[];
  agentStatusById: Record<string, AgentStatus>;
  streamAgentId: string | null;
  handleNodePointerDown: (id: string, event: ReactPointerEvent<HTMLDivElement>) => void;
  handleNodeMouseDown: (id: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  handleNodeTouchStart: (id: string, event: ReactTouchEvent<HTMLDivElement>) => void;
};

export function LegacyVizCanvas({
  vizSize,
  vizScale,
  vizOffset,
  vizIsPanning,
  setVizScale,
  setVizOffset,
  setVizIsPanning,
  vizRef,
  vizPanStartRef,
  vizLayout,
  vizBeams,
  agentStatusById,
  streamAgentId,
  handleNodePointerDown,
  handleNodeMouseDown,
  handleNodeTouchStart,
}: Props) {
  return (
    <div
      ref={vizRef}
      className="viz-canvas"
      style={{
        position: "relative",
        minHeight: 200,
        borderTop: "1px solid #27272a",
        background:
          "radial-gradient(circle at 20% 20%, rgba(56,189,248,0.12), transparent 40%), radial-gradient(circle at 80% 70%, rgba(34,197,94,0.12), transparent 45%), linear-gradient(transparent 23px, rgba(39,39,42,0.35) 24px), linear-gradient(90deg, transparent 23px, rgba(39,39,42,0.35) 24px), url('/viz-bg.jpeg') center/cover no-repeat",
        backgroundSize: "24px 24px, 24px 24px, 24px 24px, 24px 24px, cover",
        cursor: vizIsPanning ? "grabbing" : "grab",
        overflow: "hidden",
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        setVizIsPanning(true);
        vizPanStartRef.current = { x: e.clientX, y: e.clientY, ox: vizOffset.x, oy: vizOffset.y };
      }}
      onMouseMove={(e) => {
        if (!vizIsPanning || !vizPanStartRef.current) return;
        const dx = e.clientX - vizPanStartRef.current.x;
        const dy = e.clientY - vizPanStartRef.current.y;
        setVizOffset({ x: vizPanStartRef.current.ox + dx, y: vizPanStartRef.current.oy + dy });
      }}
      onMouseUp={() => {
        setVizIsPanning(false);
        vizPanStartRef.current = null;
      }}
      onMouseLeave={() => {
        setVizIsPanning(false);
        vizPanStartRef.current = null;
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "6px 10px",
          borderRadius: 999,
          border: "1px solid #27272a",
          background: "rgba(9,9,11,0.7)",
          fontSize: 12,
          color: "#e4e4e7",
        }}
      >
        <span className="mono">缩放 {Math.round(vizScale * 100)}%</span>
        <button
          className="btn"
          style={{ padding: "2px 8px", fontSize: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            setVizScale((s) => Math.min(s + 0.1, 2));
          }}
        >
          +
        </button>
        <button
          className="btn"
          style={{ padding: "2px 8px", fontSize: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            setVizScale((s) => Math.max(s - 0.1, 0.5));
          }}
        >
          -
        </button>
        <button
          className="btn"
          style={{ padding: "2px 8px", fontSize: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            setVizScale(0.9);
            setVizOffset({ x: 0, y: 0 });
          }}
        >
          Reset
        </button>
        <span className="muted mono">Ctrl/⌘ + 滚轮缩放</span>
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${vizOffset.x}px, ${vizOffset.y}px) scale(${vizScale})`,
          transformOrigin: "center center",
          transition: vizIsPanning ? "none" : "transform 120ms ease-out",
        }}
      >
        <svg
          width={vizSize.width}
          height={vizSize.height}
          style={{ position: "absolute", inset: 0 }}
        >
          <g>
            {vizLayout.edges.map((edge) => {
              const from = vizLayout.positions.get(edge.fromId);
              const to = vizLayout.positions.get(edge.toId);
              if (!from || !to) return null;
              const midY = (from.y + to.y) / 2;
              const path = `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
              return (
                <path
                  key={`${edge.fromId}-${edge.toId}`}
                  d={path}
                  stroke="rgba(148,163,184,0.35)"
                  strokeWidth={1.2}
                  fill="none"
                />
              );
            })}
          </g>
          <AnimatePresence>
            {vizBeams.map((beam) => {
              const from = vizLayout.positions.get(beam.fromId);
              const to = vizLayout.positions.get(beam.toId);
              if (!from || !to) return null;
              const color = beam.kind === "create" ? "#3b82f6" : "#ffffff";
              return (
                <motion.g
                  key={beam.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.9 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <motion.line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={color}
                    strokeWidth={beam.kind === "create" ? 2.5 : 1.6}
                    strokeDasharray={beam.kind === "create" ? "8 6" : "0"}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: beam.kind === "create" ? 0.5 : 0.35 }}
                    transition={{ duration: 0.5 }}
                  />
                  <motion.circle
                    r={beam.kind === "create" ? 7 : 4}
                    fill={color}
                    initial={{ cx: from.x, cy: from.y }}
                    animate={{ cx: to.x, cy: to.y }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    style={{ filter: `drop-shadow(0 0 ${beam.kind === "create" ? "12px" : "5px"} ${color})` }}
                  />
                  {beam.label ? (
                    <foreignObject
                      x={(from.x + to.x) / 2 - 80}
                      y={(from.y + to.y) / 2 - 40}
                      width={160}
                      height={40}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: beam.kind === "create" ? "#bfdbfe" : "#e4e4e7",
                          border: `1px solid ${beam.kind === "create" ? "rgba(59,130,246,0.5)" : "rgba(82,82,91,0.5)"}`,
                          background:
                            beam.kind === "create"
                              ? "rgba(30,58,138,0.6)"
                              : "rgba(9,9,11,0.7)",
                          borderRadius: 999,
                          padding: "4px 8px",
                          textAlign: "center",
                        }}
                      >
                        {beam.kind === "create" ? `create_agent(${beam.label})` : "send_message"}
                      </div>
                    </foreignObject>
                  ) : null}
                </motion.g>
              );
            })}
          </AnimatePresence>
        </svg>

        {vizLayout.ordered.map((agent) => {
          const pos = vizLayout.positions.get(agent.id);
          if (!pos) return null;
          const status = agentStatusById[agent.id] ?? "IDLE";
          const ring = statusColor(status);
          const isHuman = agent.role === "human";
          const isActive = streamAgentId === agent.id;
          const Icon =
            agent.role === "productmanager"
              ? Briefcase
              : agent.role === "coder"
                ? Code2
                : agent.role === "assistant"
                  ? Network
                  : User;
          return (
            <motion.div
              key={agent.id}
              initial={{ scale: 0, opacity: 0, x: pos.x, y: pos.y }}
              animate={{ scale: 1, opacity: 1, x: pos.x, y: pos.y }}
              transition={{ type: "spring", stiffness: 220, damping: 18 }}
              className={cx("viz-node", isActive && "active")}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 90,
                height: 90,
                marginLeft: -45,
                marginTop: -45,
                cursor: "grab",
              }}
              title={agent.id}
              onPointerDown={(e) => handleNodePointerDown(agent.id, e)}
              onMouseDown={(e) => handleNodeMouseDown(agent.id, e)}
              onTouchStart={(e) => handleNodeTouchStart(agent.id, e)}
            >
              {isActive ? (
                <div className="viz-reticle">
                  <div className="viz-reticle-pulse" />
                </div>
              ) : null}
              <div
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: "50%",
                  border: `2px solid ${ring}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(5,5,5,0.9)",
                  boxShadow: `0 0 30px ${ring}55`,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: 70,
                    height: 70,
                    borderRadius: "50%",
                    border: `2px solid ${isHuman ? "#f8fafc" : "#4ade80"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,0.6)",
                  }}
                >
                  <Icon size={24} color={isHuman ? "#f8fafc" : "#e4e4e7"} />
                </div>
                {status === "BUSY" ? (
                  <motion.div
                    style={{
                      position: "absolute",
                      inset: 6,
                      borderRadius: "50%",
                      border: "2px solid #ef4444",
                      borderTopColor: "transparent",
                      borderRightColor: "transparent",
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                ) : null}
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 94,
                  left: "50%",
                  transform: "translateX(-50%)",
                  textAlign: "center",
                  width: 120,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#e4e4e7",
                }}
              >
                {agent.role}
                <div style={{ fontSize: 9, color: ring, marginTop: 2 }}>{status}</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
