"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MID_CHAT_MIN_HEIGHT, MID_GRAPH_MIN_HEIGHT, MID_SPLITTER_SIZE } from "../constants";

export function useMidSplitter() {
  const [midSplitRatio, setMidSplitRatio] = useState(0.55);
  const [midStackHeight, setMidStackHeight] = useState(0);
  const midStackRef = useRef<HTMLDivElement | null>(null);
  const midChatHeightRef = useRef(0);

  const midChatHeight = useMemo(() => {
    if (!midStackHeight) return 0;
    const available = Math.max(0, midStackHeight - MID_SPLITTER_SIZE);
    if (available <= 0) return 0;
    const minChat = MID_CHAT_MIN_HEIGHT;
    const minGraph = MID_GRAPH_MIN_HEIGHT;
    if (available <= minGraph + minChat) {
      return Math.max(minChat, available - minGraph);
    }
    const maxChat = available - minGraph;
    const desired = available * midSplitRatio;
    return Math.min(maxChat, Math.max(minChat, desired));
  }, [midSplitRatio, midStackHeight]);

  useEffect(() => {
    midChatHeightRef.current = midChatHeight;
  }, [midChatHeight]);

  useEffect(() => {
    const el = midStackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        if (!rect.height) continue;
        setMidStackHeight(rect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const startMidResize = useCallback(
    (clientY: number) => {
      const container = midStackRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const available = Math.max(0, rect.height - MID_SPLITTER_SIZE);
      if (available <= 0) return;
      const minChat = MID_CHAT_MIN_HEIGHT;
      const minGraph = MID_GRAPH_MIN_HEIGHT;
      const maxChat = Math.max(minChat, available - minGraph);
      const startY = clientY;
      const startHeight = midChatHeightRef.current || available * midSplitRatio;

      const onMove = (e: PointerEvent | MouseEvent) => {
        const delta = e.clientY - startY;
        const next = Math.min(maxChat, Math.max(minChat, startHeight + delta));
        const ratio = available ? next / available : 0.5;
        setMidSplitRatio(ratio);
      };

      const onTouchMove = (e: TouchEvent) => {
        const touch = e.touches[0];
        if (!touch) return;
        const delta = touch.clientY - startY;
        const next = Math.min(maxChat, Math.max(minChat, startHeight + delta));
        const ratio = available ? next / available : 0.5;
        setMidSplitRatio(ratio);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onUp);
        document.body.style.cursor = "";
      };

      document.body.style.cursor = "row-resize";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onUp);
    },
    [midSplitRatio]
  );

  const handleMidResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      startMidResize(event.clientY);
    },
    [startMidResize]
  );

  const handleMidMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      startMidResize(event.clientY);
    },
    [startMidResize]
  );

  const handleMidTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      if (!touch) return;
      startMidResize(touch.clientY);
    },
    [startMidResize]
  );

  return {
    midSplitRatio,
    midStackHeight,
    midChatHeight,
    midStackRef,
    midChatHeightRef,
    startMidResize,
    handleMidResizeStart,
    handleMidMouseDown,
    handleMidTouchStart,
  };
}
