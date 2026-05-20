export const runtime = "nodejs";

import { store } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const trimmed = groupId?.trim();
  if (!trimmed) {
    return Response.json({ error: "Missing groupId" }, { status: 400 });
  }

  const phases = await store.listPhaseSummaries({ groupId: trimmed });
  return Response.json({ phases });
}
