"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

type IMShellProps = {
  top?: ReactNode;
  left: ReactNode;
  mid: ReactNode;
  right: ReactNode;
  leftWidth: number;
  rightWidth: number;
  onLeftWidthChange: (next: number) => void;
  onRightWidthChange: (next: number) => void;
};

const RESIZER_WIDTH = 6;
const LEFT_MIN = 0;
const LEFT_MAX = 600;
const RIGHT_MIN = 0;
const RIGHT_MAX = 700;
const MID_MIN = 360;
const NARROW_BREAKPOINT = 1100;

export function IMShell({
  top,
  left,
  mid,
  right,
  leftWidth,
  rightWidth,
  onLeftWidthChange,
  onRightWidthChange,
}: IMShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftWidthRef = useRef(leftWidth);
  const rightWidthRef = useRef(rightWidth);
  const restoreLeftRef = useRef<number | null>(null);

  useEffect(() => {
    leftWidthRef.current = leftWidth;
  }, [leftWidth]);
  useEffect(() => {
    rightWidthRef.current = rightWidth;
  }, [rightWidth]);

  // Auto-collapse left pane on narrow viewports; restore when widened again.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = containerRef.current;
    if (!el) return;

    const evaluate = (cw: number) => {
      if (cw < NARROW_BREAKPOINT) {
        if (leftWidthRef.current > 0) {
          restoreLeftRef.current = leftWidthRef.current;
          onLeftWidthChange(0);
        }
      } else if (restoreLeftRef.current != null && leftWidthRef.current === 0) {
        const restore = restoreLeftRef.current;
        restoreLeftRef.current = null;
        onLeftWidthChange(restore);
      }
    };

    // Defer initial evaluation so parent hydration effects (localStorage read)
    // can settle leftWidthRef to the actual stored value first.
    const t = window.setTimeout(() => evaluate(el.clientWidth), 50);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        evaluate(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [onLeftWidthChange]);

  const startLeftResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = leftWidthRef.current;
      const containerW = containerRef.current?.clientWidth ?? window.innerWidth;
      const maxAllowed = Math.min(LEFT_MAX, containerW - rightWidthRef.current - MID_MIN - 2 * RESIZER_WIDTH);
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const next = Math.max(LEFT_MIN, Math.min(maxAllowed, startW + dx));
        onLeftWidthChange(next);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onLeftWidthChange]
  );

  const startRightResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = rightWidthRef.current;
      const containerW = containerRef.current?.clientWidth ?? window.innerWidth;
      const maxAllowed = Math.min(RIGHT_MAX, containerW - leftWidthRef.current - MID_MIN - 2 * RESIZER_WIDTH);
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const next = Math.max(RIGHT_MIN, Math.min(maxAllowed, startW - dx));
        onRightWidthChange(next);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onRightWidthChange]
  );

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
        background: "#f1f5f9",
      }}
    >
      {top}
      <div
        ref={containerRef}
        style={{
          display: "grid",
          gridTemplateColumns: `${leftWidth}px ${RESIZER_WIDTH}px 1fr ${RESIZER_WIDTH}px ${rightWidth}px`,
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {left}
        <div
          className="col-resizer"
          onPointerDown={startLeftResize}
          title="Drag to resize"
        />
        {mid}
        <div
          className="col-resizer"
          onPointerDown={startRightResize}
          title="Drag to resize"
        />
        {right}
        {leftWidth === 0 && (
          <button
            type="button"
            onClick={() => onLeftWidthChange(restoreLeftRef.current ?? 320)}
            title="Show left panel"
            aria-label="Show left panel"
            style={{
              position: "absolute",
              left: 0,
              top: 12,
              width: 18,
              height: 56,
              border: "1px solid rgba(148,163,184,0.40)",
              borderLeft: "none",
              borderTopRightRadius: 6,
              borderBottomRightRadius: 6,
              background: "rgba(255,255,255,0.90)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              color: "#0891b2",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontFamily: "ui-monospace, monospace",
              lineHeight: 1,
              padding: 0,
              zIndex: 4,
            }}
          >
            ▸
          </button>
        )}
      </div>
    </div>
  );
}
