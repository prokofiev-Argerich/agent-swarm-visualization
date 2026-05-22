export const runtime = "nodejs";

import { getUpstashRealtime } from "@/runtime/upstash-realtime";

import { sseWithId, sseKeepalive } from "@/lib/sse";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  if (!workspaceId) {
    return Response.json({ error: "Missing workspaceId" }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendKeepalive = () => controller.enqueue(sseKeepalive());

      let upstashUnsubscribe: (() => void) | null = null;

      const channel = getUpstashRealtime().channel(`ui:${workspaceId}`);
      upstashUnsubscribe = await channel.subscribe({
        events: [
          "ui.agent.created",
          "ui.group.created",
          "ui.group.updated",
          "ui.message.created",
          "ui.agent.llm.start",
          "ui.agent.llm.done",
          "ui.agent.history.persisted",
          "ui.agent.tool_call.start",
          "ui.agent.tool_call.done",
          "ui.db.write",
        ],
        history: { start: "-" as any, end: "+" as any },
        onData: (evt) => {
          const payload = {
            event: evt.event,
            data: (evt.data as any)?.data ?? evt.data,
          };
          controller.enqueue(sseWithId((evt as any).id, payload));
        },
      });

      const keepalive = setInterval(sendKeepalive, 15_000);

      let closed = false;
      const abortHandler = async () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        upstashUnsubscribe?.();
        try {
          controller.close();
        } catch {
          // ignore double-close
        }
      };

      if (req.signal.aborted) void abortHandler();
      req.signal.addEventListener("abort", () => void abortHandler(), { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Encoding": "none",
    },
  });
}
