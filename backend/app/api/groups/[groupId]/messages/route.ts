export const runtime = "nodejs";

import {
  listGroupMessagesResponse,
  sendGroupMessageResponse,
} from "@/server/handlers/group-messages";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const url = new URL(req.url);
  const markRead = url.searchParams.get("markRead") === "true";
  const readerId = url.searchParams.get("readerId");
  const limit = url.searchParams.get("limit");
  const before = url.searchParams.get("before");
  const phaseId = url.searchParams.get("phaseId");
  return listGroupMessagesResponse({
    groupId,
    markRead,
    readerId,
    limit: limit ? parseInt(limit, 10) : undefined,
    before: before ?? undefined,
    phaseId: phaseId ?? undefined,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const body = (await req.json()) as {
    senderId: string;
    content: string;
    contentType?: string;
  };
  return sendGroupMessageResponse({ groupId, body });
}
