"use client";

import { useCallback, useState } from "react";
import { INITIAL_RIGHT_PANELS, RIGHT_PANEL_MIN_HEIGHT } from "../constants";
import type { RightPanelId, RightPanelState } from "../types";

export function useRightPanels() {
  const [rightPanels, setRightPanels] = useState<RightPanelState[]>(
    INITIAL_RIGHT_PANELS.map((p) => ({ ...p }))
  );

  const toggleRightPanel = useCallback((id: RightPanelId) => {
    setRightPanels((prev) =>
      prev.map((panel) =>
        panel.id === id ? { ...panel, collapsed: !panel.collapsed } : panel
      )
    );
  }, []);

  const handleRightPanelResizeStart = useCallback(
    (index: number, event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const first = rightPanels[index];
      const second = rightPanels[index + 1];
      if (!first || !second) return;
      if (first.collapsed || second.collapsed) return;

      const startY = event.clientY;
      const startFirst = first.size;
      const startSecond = second.size;
      const min = RIGHT_PANEL_MIN_HEIGHT;

      const onMove = (e: PointerEvent) => {
        const delta = e.clientY - startY;
        const total = startFirst + startSecond;
        const nextFirst = Math.min(total - min, Math.max(min, startFirst + delta));
        const nextSecond = total - nextFirst;
        setRightPanels((prev) => {
          if (!prev[index] || !prev[index + 1]) return prev;
          if (prev[index].collapsed || prev[index + 1].collapsed) return prev;
          const next = [...prev];
          next[index] = { ...next[index], size: nextFirst };
          next[index + 1] = { ...next[index + 1], size: nextSecond };
          return next;
        });
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
      };

      document.body.style.cursor = "row-resize";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [rightPanels]
  );

  return {
    rightPanels,
    setRightPanels,
    toggleRightPanel,
    handleRightPanelResizeStart,
  };
}
