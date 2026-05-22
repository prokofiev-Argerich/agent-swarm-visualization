export const runtime = "nodejs";

import { store } from "@/lib/storage";
import { z } from "zod";

const UUID = z.string().uuid();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim() ?? "";
  const idsParam = url.searchParams.get("ids")?.trim() ?? "";

  if (!UUID.safeParse(workspaceId).success) {
    return Response.json({ error: "Missing or invalid workspaceId" }, { status: 400 });
  }
  const rawIds = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const ids: string[] = [];
  for (const id of rawIds) {
    if (UUID.safeParse(id).success) ids.push(id);
  }
  if (ids.length === 0) {
    return Response.json({ messages: [] });
  }
  if (ids.length > 50) {
    return Response.json({ error: "Too many ids (max 50)" }, { status: 400 });
  }

  try {
    const messages = await store.getMessagesByIds({ workspaceId, ids });
    return Response.json({ messages });
  } catch (e) {
    console.error("[api/messages-by-ids] failed", e);
    const cause = (e as { cause?: { message?: string; code?: string } })?.cause;
    return Response.json(
      {
        error:
          cause?.message ??
          (e instanceof Error ? e.message : "Failed to fetch messages"),
        ...(cause?.code ? { code: cause.code } : {}),
      },
      { status: 500 }
    );
  }
}
