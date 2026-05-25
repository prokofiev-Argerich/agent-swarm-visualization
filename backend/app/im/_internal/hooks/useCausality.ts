"use client";

import { useEffect, useMemo } from "react";
import type { Message } from "../types";

export function useCausality(
  messages: Message[],
  selectedMessageId: string | null,
  setSelectedMessageId: (id: string | null) => void
) {
  const messageById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const downstreamByMessageId = useMemo(() => {
    const map = new Map<string, Message[]>();
    for (const m of messages) {
      const upstreamId = m.causedBy;
      if (!upstreamId) continue;
      const list = map.get(upstreamId);
      if (list) list.push(m);
      else map.set(upstreamId, [m]);
    }
    return map;
  }, [messages]);

  const selectedMessage = useMemo<Message | null>(
    () => (selectedMessageId ? messageById.get(selectedMessageId) ?? null : null),
    [selectedMessageId, messageById]
  );

  const upstreamMessage = useMemo<Message | null>(() => {
    if (!selectedMessage?.causedBy) return null;
    return messageById.get(selectedMessage.causedBy) ?? null;
  }, [selectedMessage, messageById]);

  const downstreamMessages = useMemo<Message[]>(() => {
    if (!selectedMessage) return [];
    return downstreamByMessageId.get(selectedMessage.id) ?? [];
  }, [selectedMessage, downstreamByMessageId]);

  useEffect(() => {
    if (selectedMessageId && !messageById.has(selectedMessageId)) {
       
      setSelectedMessageId(null);
    }
  }, [selectedMessageId, messageById, setSelectedMessageId]);

  return { messageById, downstreamByMessageId, selectedMessage, upstreamMessage, downstreamMessages };
}
