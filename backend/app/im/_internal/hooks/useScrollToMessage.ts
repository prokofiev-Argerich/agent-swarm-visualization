"use client";

import { useCallback } from "react";

export function useScrollToMessage(containerRef: React.RefObject<HTMLDivElement | null>) {
  return useCallback(
    (messageId: string): boolean => {
      const container = containerRef.current;
      if (!container) return false;
      const el = container.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
      if (!el) {
        // eslint-disable-next-line no-console
        console.warn("[scrollToMessage] message not in DOM:", messageId);
        return false;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("causal-flash");
      window.setTimeout(() => el.classList.remove("causal-flash"), 1500);
      return true;
    },
    [containerRef]
  );
}
