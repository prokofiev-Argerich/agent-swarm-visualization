import { store } from "@/lib/storage";

export async function getWorkspaceDefaultsResponse(workspaceId: string): Promise<Response> {
  const trimmed = workspaceId?.trim();
  if (!trimmed) {
    return Response.json({ error: "Missing workspaceId" }, { status: 400 });
  }

  try {
    const result = await store.ensureWorkspaceDefaults({ workspaceId: trimmed });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === "workspace not found" ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
