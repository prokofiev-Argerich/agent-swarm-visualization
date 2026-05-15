export const runtime = "nodejs";

import { getWorkspaceDefaultsResponse } from "@/server/handlers/workspace-defaults";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  return getWorkspaceDefaultsResponse(workspaceId);
}
