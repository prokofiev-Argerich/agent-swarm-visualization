export const runtime = "nodejs";

import { store } from "@/lib/storage";
import { getAgentRuntime } from "@/runtime/agent-runtime";
import { getUpstashRealtime } from "@/runtime/upstash-realtime";

import { sseWithId, sseKeepalive } from "@/lib/sse";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  new URL(req.url);
  const runtime = getAgentRuntime();
  await runtime.bootstrap();

  const agent = await store.getAgent({ agentId });
  if (agent.role !== "human") {
    void runtime.wakeAgent(agentId, "context_stream");
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendKeepalive = () => controller.enqueue(sseKeepalive());

      let upstashUnsubscribe: (() => void) | null = null;

      const channel = getUpstashRealtime().channel(`agent:${agentId}`);
      upstashUnsubscribe = await channel.subscribe({
        events: ["agent.wakeup", "agent.unread", "agent.stream", "agent.done", "agent.error"],
        history: { start: "-" as any, end: "+" as any, limit: 2000 },
        onData: (evt) => {
          // evt shape: { id: string, channel: string, event: string, data: unknown }
          const payload = {
            event: evt.event,
            data: (evt.data as any)?.data ?? evt.data,
          };
          controller.enqueue(sseWithId((evt as any).id, payload));
        },
      });

      const keepalive = setInterval(sendKeepalive, 15_000);

      const abortHandler = async () => {
        clearInterval(keepalive);
        upstashUnsubscribe?.();
        controller.close();
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
