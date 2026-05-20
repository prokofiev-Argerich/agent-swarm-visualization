export const runtime = "nodejs";

import { store } from "@/lib/storage";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId") ?? "";
  const trimmed = groupId.trim();
  if (!trimmed) {
    return Response.json({ error: "Missing groupId" }, { status: 400 });
  }

  const phases = await store.listPhaseSummaries({ groupId: trimmed });
  return Response.json({ phases });
}
