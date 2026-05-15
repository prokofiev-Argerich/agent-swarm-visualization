export const runtime = "nodejs";

import { getAgentContextStreamResponse } from "@/server/handlers/agent-context-stream";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId") ?? "";
  return getAgentContextStreamResponse(req, agentId);
}
