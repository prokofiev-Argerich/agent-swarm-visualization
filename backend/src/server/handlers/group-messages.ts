import { store } from "@/lib/storage";
import { getAgentRuntime } from "@/runtime/agent-runtime";
import { getWorkspaceUIBus } from "@/runtime/ui-bus";

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
    const result = await store.listGroupMessagesPaged({
      groupId: trimmed,
      limit: opts.limit ?? 50,
      before: opts.before ?? undefined,
      phaseId: opts.phaseId ?? undefined,
    });

    if (opts.markRead && opts.readerId) {
      await store.markGroupRead({ groupId: trimmed, readerId: opts.readerId });
    }

    return Response.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
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
  const activePhase = await store.getActiveWorkflowPhase({ groupId: trimmed });

  const result = await store.sendMessage({
    groupId: trimmed,
    senderId: opts.body.senderId,
    content: opts.body.content,
    contentType: opts.body.contentType ?? "text",
    phaseId: activePhase?.id,
  });

  const memberIds = await store.listGroupMemberIds({ groupId: trimmed });
  const workspaceId = await store.getGroupWorkspaceId({ groupId: trimmed });
  getWorkspaceUIBus().emit(workspaceId, {
    event: "ui.message.created",
    data: {
      workspaceId,
      groupId: trimmed,
      memberIds,
      message: { id: result.id, senderId: opts.body.senderId, sendTime: result.sendTime },
    },
  });

  const runtime = getAgentRuntime();
  void runtime.wakeAgentsForGroup(trimmed, opts.body.senderId);

  return Response.json(result, { status: 201 });
}
