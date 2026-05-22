"use client";

import { useMemo } from "react";
import type { DisplayItem, Message, PhaseSummary } from "../types";

export function useDisplayItems(
  messages: Message[],
  phaseSummaries: PhaseSummary[],
  expandedPhases: Set<string>,
  phaseMessages: Record<string, Message[]>
) {
  const completedPhaseIds = useMemo(() => {
    return new Set(phaseSummaries.map((p) => p.phaseId));
  }, [phaseSummaries]);

  const displayItems = useMemo((): DisplayItem[] => {
    const items: DisplayItem[] = [];
    const seenPhases = new Set<string>();
    const seenMsgIds = new Set<string>();
    const emitMsg = (m: Message) => {
      if (!seenMsgIds.has(m.id)) {
        seenMsgIds.add(m.id);
        items.push({ kind: "message", message: m });
      }
    };

    let i = 0;
    while (i < messages.length) {
      const m = messages[i]!;
      const pid = m.phaseId ?? null;

      if (!pid) {
        emitMsg(m);
        i++;
        continue;
      }

      const block: Message[] = [];
      while (i < messages.length && messages[i]!.phaseId === pid) {
        block.push(messages[i]!);
        i++;
      }

      const isCompleted = completedPhaseIds.has(pid);
      const isExpanded = expandedPhases.has(pid);

      if (!isCompleted) {
        for (const bm of block) emitMsg(bm);
      } else if (isExpanded) {
        const summary = phaseSummaries.find((p) => p.phaseId === pid);
        if (summary) {
          items.push({ kind: "phase-card", summary, expanded: true });
        }
        const pm = phaseMessages[pid];
        if (pm && pm.length > 0) {
          for (const pmMsg of pm) emitMsg(pmMsg);
        } else {
          for (const bm of block) emitMsg(bm);
        }
      } else {
        const summary = phaseSummaries.find((p) => p.phaseId === pid);
        if (summary) {
          items.push({ kind: "phase-card", summary, expanded: false });
        } else {
          for (const bm of block) emitMsg(bm);
        }
      }
      seenPhases.add(pid);
    }

    for (const s of phaseSummaries) {
      if (!seenPhases.has(s.phaseId)) {
        const isExpanded = expandedPhases.has(s.phaseId);
        items.unshift({ kind: "phase-card", summary: s, expanded: isExpanded });
        if (isExpanded) {
          const pm = phaseMessages[s.phaseId];
          if (pm && pm.length > 0) {
            for (const pmMsg of pm) emitMsg(pmMsg);
          }
        }
      }
    }

    return items;
  }, [messages, phaseSummaries, expandedPhases, phaseMessages, completedPhaseIds]);

  return displayItems;
}
