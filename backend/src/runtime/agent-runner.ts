import { store } from "@/lib/storage";
import { AgentEventBus } from "./event-bus";
import { createDeferred, safeJsonParse } from "./utils";
import { getWorkspaceUIBus } from "./ui-bus";
import { appendAgentHistorySnapshot, appendAgentStreamEvent } from "./agent-logger";
import { buildSkillsBlock, historyHasSkills } from "./context/skills-context";
import { buildFilesBlock } from "./context/files-context";
import { createLlmClient } from "./llm/llm-client";
import { createToolRegistry, getAgentTools, ToolExecutor } from "./tools/builtin-tools";
import type { UUID, HistoryMessage, ToolCall } from "./types";
import type { ToolContext, ToolResult } from "./tools/types";
import { SEND_TOOL_NAMES } from "./types";

export class AgentRunner {
  private wake = createDeferred<void>();
  private started = false;
  private running = false;
  private interruptRequested = false;
  private currentGroupId: UUID | null = null;
  private readonly toolExecutor: ToolExecutor;
  private readonly llmClient;

  constructor(
    private readonly agentId: UUID,
    private readonly bus: AgentEventBus,
    private readonly ensureRunner: (agentId: UUID) => void,
    private readonly wakeAgent: (agentId: UUID) => void
  ) {
    this.toolExecutor = new ToolExecutor(createToolRegistry());
    this.llmClient = createLlmClient({
      bus: this.bus,
      getTools: () => getAgentTools(),
    });
  }

  start() {
    if (this.started) return;
    this.started = true;
    void this.ensureSkillsLoaded();
    void this.loop();
  }

  private async ensureSkillsLoaded() {
    try {
      const agent = await store.getAgent({ agentId: this.agentId });
      const parsed = safeJsonParse<unknown>(agent.llmHistory, {});
      const history = Array.isArray(parsed) ? (parsed as HistoryMessage[]) : [];
      if (historyHasSkills(history)) return;
      const skillsBlock = await buildSkillsBlock();
      if (!skillsBlock) return;
      history.push({ role: "system", content: skillsBlock });
      await store.setAgentHistory({
        agentId: this.agentId,
        llmHistory: JSON.stringify(history),
      });
    } catch {
      // best-effort only
    }
  }

  wakeup(reason: "manual" | "group_message" | "direct_message" | "context_stream" = "manual") {
    this.wake.resolve();
    this.wake = createDeferred<void>();
    this.bus.emit(this.agentId, {
      event: "agent.wakeup",
      data: { agentId: this.agentId, reason },
    });
  }

  requestInterrupt() {
    this.interruptRequested = true;
    this.wake.resolve();
    this.wake = createDeferred<void>();
  }

  private consumeInterruptRequest() {
    if (!this.interruptRequested) return false;
    this.interruptRequested = false;
    return true;
  }

  private async loop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await this.wake.promise;
      if (this.running) continue;
      this.running = true;
      try {
        await this.processUntilIdle();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.bus.emit(this.agentId, {
          event: "agent.error",
          data: { message },
        });
        void appendAgentStreamEvent({
          agentId: this.agentId,
          kind: "error",
          error: message,
        });
        void store
          .getAgent({ agentId: this.agentId })
          .then((agent) => {
            try {
              getWorkspaceUIBus().emit(agent.workspaceId, {
                event: "ui.agent.error",
                data: {
                  workspaceId: agent.workspaceId,
                  agentId: this.agentId,
                  message,
                },
              });
            } catch {
              // ignore emit failures
            }
          })
          .catch(() => {
            // ignore lookup failures
          });
      } finally {
        this.running = false;
      }
    }
  }

  private async processUntilIdle() {
    const role = await store.getAgentRole({ agentId: this.agentId }).catch(() => null);
    if (role === "human" || role === null) return;
    if (this.consumeInterruptRequest()) return;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.consumeInterruptRequest()) return;
      const batches = await store.listUnreadByGroup({ agentId: this.agentId });
      if (batches.length === 0) return;

      this.bus.emit(this.agentId, {
        event: "agent.unread",
        data: {
          agentId: this.agentId,
          batches: batches.map((batch) => ({
            groupId: batch.groupId,
            messageIds: batch.messages.map((m) => m.id),
          })),
        },
      });

      for (const batch of batches) {
        if (this.consumeInterruptRequest()) return;
        await this.processGroupUnread(batch.groupId, batch.messages);
        if (this.consumeInterruptRequest()) return;
      }
    }
  }

  private async processGroupUnread(
    groupId: UUID,
    unreadMessages: Array<{
      id: UUID;
      senderId: UUID;
      content: string;
      contentType: string;
      sendTime: string;
    }>
  ) {
    this.currentGroupId = groupId;
    try {
      const workspaceId = await store.getGroupWorkspaceId({ groupId });
      const agent = await store.getAgent({ agentId: this.agentId });
      const parsed = safeJsonParse<unknown>(agent.llmHistory, {});
      const history = Array.isArray(parsed) ? (parsed as HistoryMessage[]) : [];
      const skillsBlock = await buildSkillsBlock();
      const hasSkills = historyHasSkills(history);

      if (history.length === 0) {
        const role = agent.role;
        history.push({
          role: "system",
          content:
            `You are an agent in an IM system.\n` +
            `Your agent_id is: ${this.agentId}.\n` +
            `Your workspace_id is: ${workspaceId}.\n` +
            `Your role is: ${role}.\n` +
            `Act strictly as this role when replying. Be concise and helpful.\n` +
            `Your replies are NOT automatically delivered to humans.\n` +
            `To send messages, you MUST call tools like send_group_message or send_direct_message.\n` +
            `If you need to coordinate with other agents, you may use tools like self, list_agents, create, send, list_groups, list_group_members, create_group, send_group_message, send_direct_message, and get_group_messages.\n` +
            `If you need to run shell commands, use the bash tool.\n` +
            `If you need to read a file that was uploaded to this workspace, use the read_file tool with the fileId (never a filesystem path).` +
            (skillsBlock ? `\n\n${skillsBlock}` : ""),
        });
      } else if (skillsBlock && !hasSkills) {
        history.push({ role: "system", content: skillsBlock });
      }

      // Inject workspace file list into context
      const filesBlock = await buildFilesBlock(workspaceId);
      if (filesBlock) {
        const existingFilesIdx = history.findIndex(
          (m) => m.role === "system" && typeof m.content === "string" && m.content.startsWith("## Uploaded Files")
        );
        if (existingFilesIdx >= 0) {
          history.splice(existingFilesIdx, 1);
        }
        history.push({ role: "system", content: filesBlock });
      }

      const userContent = unreadMessages
        .map((m) => `[group:${groupId}] ${m.senderId}: ${m.content}`)
        .join("\n");
      history.push({ role: "user", content: userContent });

      const lastId = unreadMessages[unreadMessages.length - 1]?.id;
      if (lastId) {
        await store.markGroupReadToMessage({ groupId, readerId: this.agentId, messageId: lastId });
      }

      const { assistantText, assistantThinking, didSend } = await this.runWithTools({
        groupId,
        workspaceId,
        history,
        triggerMessageId: lastId,
      });

      history.push({
        role: "assistant",
        content: assistantText,
        reasoning_content: assistantThinking || undefined,
      });

      let finalDidSend = didSend;
      let finalText = assistantText;

      if (!didSend && !this.interruptRequested) {
        history.push({
          role: "user",
          content:
            "Reminder: 本轮未调用 send_*。先判断是否需要对外可见；需要时使用 send_group_message 或 send_direct_message，无需时可不发送。",
        });

        const followup = await this.runWithTools({
          groupId,
          workspaceId,
          history,
          triggerMessageId: lastId,
        });

        history.push({
          role: "assistant",
          content: followup.assistantText,
          reasoning_content: followup.assistantThinking || undefined,
        });

        finalDidSend = followup.didSend;
        finalText = followup.assistantText;
      }

      // Fallback: auto-send final reply to the trigger group if agent never called send
      if (!finalDidSend && !this.interruptRequested && this.currentGroupId) {
        try {
          const activePhase = await store.getActiveWorkflowPhase({ groupId: this.currentGroupId });
          const result = await store.sendMessage({
            groupId: this.currentGroupId,
            senderId: this.agentId,
            content: finalText,
            contentType: "text",
            phaseId: activePhase?.id,
            causedBy: lastId,
          });
          const members = await store.listGroupMemberIds({ groupId: this.currentGroupId });
          getWorkspaceUIBus().emit(workspaceId, {
            event: "ui.message.created",
            data: {
              workspaceId,
              groupId: this.currentGroupId,
              memberIds: members,
              message: { id: result.id, senderId: this.agentId, sendTime: result.sendTime },
            },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.bus.emit(this.agentId, {
            event: "agent.error",
            data: { message: `Auto-send fallback failed: ${msg}` },
          });
        }
      }

      await store.setAgentHistory({
        agentId: this.agentId,
        llmHistory: JSON.stringify(history),
        workspaceId,
      });
      try {
        await appendAgentHistorySnapshot({
          agentId: this.agentId,
          workspaceId,
          groupId,
          history,
        });
      } catch {
        // best-effort logging
      }
      getWorkspaceUIBus().emit(workspaceId, {
        event: "ui.agent.history.persisted",
        data: { workspaceId, agentId: this.agentId, groupId, historyLength: history.length },
      });
    } finally {
      this.currentGroupId = null;
    }
  }

  private async runWithTools(input: {
    groupId: UUID;
    workspaceId: UUID;
    history: HistoryMessage[];
    triggerMessageId?: UUID;
  }) {
    const maxToolRounds = 3;
    let assistantText = "";
    let assistantThinking = "";
    let didSend = false;

    for (let round = 0; round < maxToolRounds; round++) {
      const res = await this.llmClient.streamChat(input.history, {
        agentId: this.agentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        round,
      });
      assistantText = res.assistantText;
      assistantThinking = res.assistantThinking;

      if (res.toolCalls.length === 0) {
        return { assistantText, assistantThinking, didSend };
      }

      input.history.push({
        role: "assistant",
        content: res.assistantText,
        tool_calls: res.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.argumentsText },
        })),
        reasoning_content: res.assistantThinking || undefined,
      });

      for (const call of res.toolCalls) {
        if (call.name && SEND_TOOL_NAMES.has(call.name)) {
          didSend = true;
        }
        const toolContext: ToolContext = {
          agentId: this.agentId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          currentGroupId: this.currentGroupId,
          triggerMessageId: input.triggerMessageId,
          bus: this.bus,
          ensureRunner: this.ensureRunner,
          wakeAgent: this.wakeAgent,
        };

        // Emit tool_call.start UI event
        getWorkspaceUIBus().emit(input.workspaceId, {
          event: "ui.agent.tool_call.start",
          data: {
            workspaceId: input.workspaceId,
            agentId: this.agentId,
            groupId: input.groupId,
            toolCallId: call.id,
            toolName: call.name,
          },
        });

        let result: ToolResult;
        try {
          result = await this.toolExecutor.execute(call, toolContext);
        } catch (err) {
          result = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }

        // Emit tool_call.done UI event
        getWorkspaceUIBus().emit(input.workspaceId, {
          event: "ui.agent.tool_call.done",
          data: {
            workspaceId: input.workspaceId,
            agentId: this.agentId,
            groupId: input.groupId,
            toolCallId: call.id,
            toolName: call.name,
            ok: result.ok,
          },
        });

        this.bus.emit(this.agentId, {
          event: "agent.stream",
          data: {
            kind: "tool_result",
            delta: JSON.stringify(result),
            tool_call_id: call.id,
            tool_call_name: call.name,
          },
        });
        void appendAgentStreamEvent({
          agentId: this.agentId,
          round,
          kind: "tool_result",
          delta: JSON.stringify(result),
          tool_call_id: call.id,
          tool_call_name: call.name,
        });
        input.history.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: call.id,
          name: call.name,
        });
      }
    }

    return { assistantText, assistantThinking, didSend };
  }
}
