import { listGroupMessagesPaged, markGroupRead, sendGroupMessage } from "@/services/message-service";
import { getActiveWorkflowPhase } from "@/services/workflow-service";
import { getAgentRuntime } from "@/runtime/agent-runtime";

export async function listGroupMessagesResponse(opts: {
  groupId: string;
  markRead?: boolean;
  readerId?: string | null;
  limit?: number;
  before?: string;
  phaseId?: string;
}): Promise<Response> {
  const trimmed = opts.groupId?.trim();
  if (!trimmed) {
    return Response.json({ error: "Missing groupId" }, { status: 400 });
  }

  try {
    const result = await listGroupMessagesPaged({
      groupId: trimmed,
      limit: opts.limit ?? 50,
      before: opts.before ?? undefined,
      phaseId: opts.phaseId ?? undefined,
    });

    if (opts.markRead && opts.readerId) {
      await markGroupRead({ groupId: trimmed, readerId: opts.readerId });
    }

    return Response.json(result);
  } catch (err) {
    console.error("[listGroupMessages] 500", { groupId: trimmed, error: String(err) });
    throw err;
  }
}

export async function sendGroupMessageResponse(opts: {
  groupId: string;
  body: { senderId: string; content: string; contentType?: string };
}): Promise<Response> {
  const trimmed = opts.groupId?.trim();
  if (!trimmed) {
    return Response.json({ error: "Missing groupId" }, { status: 400 });
  }
  if (!opts.body?.senderId || !opts.body?.content) {
    return Response.json({ error: "Missing senderId or content" }, { status: 400 });
  }

  // auto-bind active phase
  const activePhase = await getActiveWorkflowPhase({ groupId: trimmed });

  const result = await sendGroupMessage({
    groupId: trimmed,
    senderId: opts.body.senderId,
    content: opts.body.content,
    contentType: opts.body.contentType ?? "text",
    phaseId: activePhase?.id,
  });

  const runtime = getAgentRuntime();
  void runtime.wakeAgentsForGroup(trimmed, opts.body.senderId);

  return Response.json(result, { status: 201 });
}
