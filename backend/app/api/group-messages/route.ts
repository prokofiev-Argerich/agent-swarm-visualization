export const runtime = "nodejs";

import {
  listGroupMessagesResponse,
  sendGroupMessageResponse,
} from "@/server/handlers/group-messages";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId") ?? "";
  const markRead = url.searchParams.get("markRead") === "true";
  const readerId = url.searchParams.get("readerId");
  return listGroupMessagesResponse({ groupId, markRead, readerId });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId") ?? "";
  const body = (await req.json()) as {
    senderId: string;
    content: string;
    contentType?: string;
  };
  return sendGroupMessageResponse({ groupId, body });
}
