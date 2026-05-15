# Swarm-IDE 架构与运行逻辑

> 基于 IM（即时通讯）范式的多 Agent 协作平台。Agent 像微信联系人一样存在，人类可以任意介入任意层级的对话，Agent 可以动态创建 sub-agent，拓扑在运行时自演化。

---

## 一、技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16 + React 19 + Tailwind 4 + Framer Motion |
| 后端 | Next.js API Routes (Node.js runtime) |
| 数据库 | PostgreSQL + Drizzle ORM |
| 消息总线 | 内存 EventBus + Redis/Upstash 持久化（可选） |
| LLM | GLM (智谱) 或 OpenRouter (DeepSeek/Kimi 等) |
| 外部工具 | MCP (Model Context Protocol) |

---

## 二、数据库层（6 张表）

**文件：** `backend/src/db/schema.ts`

| 表 | 说明 |
|---|---|
| `workspaces` | 顶层容器 |
| `agents` | Agent（含 human），`parentId` 支持嵌套 |
| `groups` | 聊天群组，P2P/多人群组 |
| `group_members` | 群组成员 + `lastReadMessageId`（联合主键） |
| `messages` | 消息，`contentType` 支持扩展 |
| `files` | 上传文件（workspace_id 外键 CASCADE） |

外键关系：
- `agents.workspaceId` -> `workspaces.id`
- `groups.workspaceId` -> `workspaces.id`
- `group_members.groupId` -> `groups.id`
- `messages.workspaceId` -> `workspaces.id`
- `messages.groupId` -> `groups.id`
- `files.workspaceId` -> `workspaces.id` (CASCADE)

**Schema 演进**：使用 Drizzle migration（`drizzle-kit generate` 生成 `backend/src/db/migrations/*.sql`，运行时由 `ensureSchema()` 调用 `migrate()` 应用）。Drizzle 自动用 `drizzle.__drizzle_migrations` 表跟踪状态。

---

## 三、核心运行时

**文件：** `backend/src/runtime/agent-runtime.ts`

```
AgentRuntime（单例）
  -> runners: Map<agentId, AgentRunner>
      -> 每个 AgentRunner 独立事件循环
```

### AgentRuntime（单例管理器）

- `bootstrap()` — 从数据库加载所有非 human Agent，创建 AgentRunner
- `ensureRunner(agentId)` — 获取或创建 AgentRunner
- `wakeAgentsForGroup(groupId, senderId)` — 群组有新消息时唤醒所有成员
- `wakeAgent(agentId, reason)` — 直接唤醒指定 Agent
- `interruptAll()` — 请求所有 Agent 停止当前循环

### AgentRunner（单个 Agent 的事件循环）

每个 Agent 有独立的事件循环：

```
start()
  -> loop()
      -> await wake.promise（等待被唤醒）
      -> processUntilIdle()
          -> listUnreadByGroup()（轮询未读消息）
          -> for each batch:
              -> processGroupUnread(groupId, messages)
                  -> 构建 LLM history
                  -> markGroupReadToMessage()（标记已读）
                  -> runWithTools(history)（LLM 调用 + 工具循环）
```

**唤醒方式：**
- `group_message` — 群组中有新消息
- `direct_message` — 收到直接消息
- `manual` — 手动唤醒

---

## 四、双事件总线

### AgentEventBus（Agent 内部事件）

**文件：** `backend/src/runtime/event-bus.ts`

事件类型：
- `agent.wakeup` — Agent 被唤醒
- `agent.unread` — 有待处理的消息批次
- `agent.stream` — LLM 流式输出（reasoning / content / tool_calls / tool_result）
- `agent.done` — LLM 调用完成
- `agent.error` — 执行出错

每个 Agent 有独立的 channel，支持 `subscribe` 和 `getSince`（按事件 ID 重放）。

### WorkspaceUIBus（Workspace 级 UI 事件）

**文件：** `backend/src/runtime/ui-bus.ts`

事件类型：
- `ui.agent.created` — 新 Agent 创建
- `ui.group.created` — 新群组创建
- `ui.message.created` — 新消息
- `ui.agent.llm.start` / `ui.agent.llm.done` — LLM 调用开始/结束
- `ui.agent.tool_call.start` / `ui.agent.tool_call.done` — 工具调用开始/结束
- `ui.agent.interrupt_all` — 批量中断
- `ui.db.write` — 数据库写入

两个总线都支持 **Redis/Upstash 持久化**，用于跨进程事件同步。

---

## 五、SSE 双通道

| 通道 | 用途 | 文件 |
|---|---|---|
| `/api/agent-context-stream?agentId=...`(扁平,前端首选) <br/> `/api/agents/[id]/context-stream`(嵌套兼容) | Agent 内部事件流（reasoning、content、tool calls） | `backend/app/api/agent-context-stream/route.ts` + `backend/app/api/agents/[agentId]/context-stream/route.ts`(均 delegate 到 `src/server/handlers/agent-context-stream.ts`) |
| `/api/ui-stream` | Workspace UI 事件流（agent 创建、消息、工具可视化） | `backend/app/api/ui-stream/route.ts` |

前端通过两个独立的 EventSource 同时订阅这两个通道,实现实时更新。

> **API facade 模式**：Next.js 16 + Turbopack 在 dev mode 下,嵌套动态路由(`[id]/sub/`)首次请求会间歇性 404。为此每个嵌套路由都搭配一个扁平别名,二者复用同一个 `src/server/handlers/*.ts`。客户端经 `src/lib/api-paths.ts` 统一走扁平路由,production 不受影响。涉及路由:`workspace-defaults`、`agent-context-stream`、`group-messages`。

---

## 六、前端 IM 界面

**文件：** `backend/app/im/page.tsx`（~2200 行）

布局：
- **左侧边栏**：Agent 树（嵌套父子关系）+ Group 列表 + Workspace 信息
- **中间面板**：聊天区（IMMessageList）+ 可拖拽的 Agent 拓扑图（Framer Motion 动画）
- **右侧面板**：LLM history / Realtime content / Realtime reasoning / Realtime tools

交互：
- 点击左侧 group row 切换聊天
- 拓扑图支持拖拽节点、滚轮缩放
- 实时显示 Agent 状态（IDLE / BUSY / WAKING）

---

## 七、Skill 系统

**文件：** `backend/src/runtime/skill-loader.ts`

- `skills/` 目录下每个子目录放一份 `SKILL.md`
- 支持 YAML frontmatter（`name`、`description`、`allowed-tools`、`auto-load`）
- `auto-load: true` 的 Skill 自动注入所有 Agent 的 system prompt
- 其他 Skill 通过 `get_skill` 工具按需加载
- Skill 中的相对路径会被解析为绝对路径

当前 `skills/` 目录为空，没有预置 Skill。

---

## 八、MCP 扩展

**文件：** `backend/src/runtime/mcp.ts`

通过 `mcp.json` 配置外部工具服务器，动态加载 MCP 工具定义到 Agent 的工具列表中。

---

## 九、运行逻辑详解

### 9.1 启动流程

```
AgentRuntime.bootstrap()
  -> 从数据库加载所有非 human Agent
  -> 为每个 Agent 创建 AgentRunner 并启动
      -> AgentRunner.start() -> loop()
```

### 9.2 消息处理流程

```
processUntilIdle()
  -> listUnreadByGroup() 轮询所有未读消息分组
  -> for each batch:
      -> processGroupUnread(groupId, messages)
          -> 1. 构建 LLM history（system + user messages）
             2. markGroupReadToMessage() 标记已读
             3. runWithTools(history) -> LLM 调用
             4. 如果有 tool_calls -> executeToolCall() -> 结果加入 history -> 下一轮
             5. 最多 3 轮工具调用
```

### 9.3 LLM 调用

```
callLlmStreaming(history, ctx)
  -> provider === "openrouter" -> callOpenRouterStreaming()
  -> provider === "glm" -> callGlmStreaming()
```

**OpenRouter 通路：**
- `mapOpenRouterMessages()` 保留 `reasoning_content` 字段
- 发送 `tools` + `tool_choice: "auto"`
- SSE 流式解析，实时 emit `agent.stream` 事件

**GLM 通路：**
- 类似逻辑，使用 GLM 的 SSE 格式

### 9.4 工具调用循环

```
runWithTools({ groupId, workspaceId, history })
  for round in 0..2:
    res = await callLlmStreaming(history)
    if res.toolCalls.length === 0: break

    history.push(assistant message with tool_calls)

    for call in res.toolCalls:
      result = await executeToolCall({ groupId, call })
      history.push(tool message with result)
```

### 9.5 内置工具（11 个）

| 工具 | 功能 |
|---|---|
| `create` | 创建 sub-agent（指定 role + guidance） |
| `self` | 返回当前 agent 的 id/workspace/role |
| `get_skill` | 加载指定 Skill 的完整内容 |
| `list_agents` | 列出 workspace 中所有 agent |
| `send` | 向另一个 agent 发直接消息 |
| `list_groups` | 列出当前 agent 可见的群组 |
| `list_group_members` | 列出群组成员 |
| `create_group` | 创建新群组 |
| `send_group_message` | 向群组发消息 |
| `send_direct_message` | 向另一个 agent 发消息（自动创建/复用 P2P 群） |
| `bash` | 执行 shell 命令（有工作目录限制） |
| `get_group_messages` | 获取群组消息历史 |

**工具执行要点：**
- `create` -> `store.createSubAgentWithP2P()` -> 新 agent + P2P 群 -> UI 事件通知
- `send` / `send_group_message` / `send_direct_message` -> 存入 messages 表 -> 唤醒接收方 agent
- `bash` -> `child_process.exec()` -> 返回 stdout/stderr/exitCode，cwd 限制在项目根目录内
- MCP 工具 -> 通过 MCP 协议调用外部服务器

### 9.6 消息发送与唤醒

当 Agent A 调用 `send_group_message` 向 Group G 发消息时：

1. 消息存入 `messages` 表
2. `AgentRuntime.wakeAgentsForGroup(G)` 被调用
3. Group G 中除发送方外的所有非 human Agent 被 `wakeup("group_message")`
4. 被唤醒的 Agent 进入 `processUntilIdle()` 处理未读消息

---

## 十、提示词（Prompt）

### 10.1 基础 System Prompt

每个 Agent 首次运行时的默认 system prompt：

```
You are an agent in an IM system.
Your agent_id is: {agentId}.
Your workspace_id is: {workspaceId}.
Your role is: {role}.
Act strictly as this role when replying. Be concise and helpful.
Your replies are NOT automatically delivered to humans.
To send messages, you MUST call tools like send_group_message or send_direct_message.
If you need to coordinate with other agents, you may use tools like self, list_agents, create, send, list_groups, list_group_members, create_group, send_group_message, send_direct_message, and get_group_messages.
If you need to run shell commands, use the bash tool.
```

### 10.2 初始 History 模板

**文件：** `backend/src/lib/storage/shared.ts` 中的 `initialAgentHistory()`(从 `storage/index.ts` 导出)

```typescript
[
  { role: "system", content: "You are an agent in an IM system..." },
  { role: "system", content: "Additional instructions:\n{guidance}" },  // 如果有 guidance
]
```

### 10.3 Skill 注入

**文件：** `backend/src/runtime/agent-runtime.ts` 中的 `buildSkillsBlock()`

```
## Available Skills
You have access to specialized skills. Each skill provides expert guidance for specific tasks.
Load a skill's full content using the get_skill tool when needed.

- `skill-name`: Skill description
```

**Skill 完整内容格式**（通过 `get_skill` 加载时）：

```
# Skill: {name}

{description}

## Skill Root Directory
This skill is located at: `/absolute/path/to/skill/dir`
All relative paths in this skill should be resolved from this directory.

{SKILL.md 正文内容}
```

### 10.4 消息格式

Agent 收到的用户消息格式：

```
[group:{groupId}] {senderId}: {content}
```

多条未读消息用换行连接。

### 10.5 工具调用结果格式

工具调用结果以 JSON 字符串存入 history：

```typescript
{
  role: "tool",
  content: JSON.stringify(result),
  tool_call_id: call.id,
  name: call.name
}
```

### 10.6 当前 Skill 状态

`skills/` 目录下目前没有 `SKILL.md` 文件，所有 Agent 只使用基础 system prompt。

---

## 十一、数据流全景图

```
用户输入
  -> POST /api/groups/{id}/messages
      -> messages 表（+ UI bus: ui.message.created）
          -> AgentRuntime.wakeAgentsForGroup()
              -> AgentRunner.wakeup("group_message")
                  -> loop() -> processUntilIdle() -> processGroupUnread()
                      -> 构建 history（system + user messages）
                          -> callLlmStreaming() -> OpenRouter/GLM SSE
                              -> 实时 emit agent.stream -> context-stream SSE
                                  -> 如果有 tool_calls -> executeToolCall()
                                      -> 工具执行 emit ui.agent.tool_call -> ui-stream SSE
                                          -> 结果加入 history -> 下一轮 LLM
                                              -> 完成 -> emit agent.done -> 持久化 history
```

---

## 十二、关键文件索引

### 后端核心

| 文件 | 用途 |
|---|---|
| `backend/src/db/schema.ts` | 数据库表定义 |
| `backend/src/db/init.ts` | `ensureSchema()` — 调用 Drizzle migrate() |
| `backend/src/db/migrate.ts` | Drizzle migrator 封装 |
| `backend/src/db/migrations/0000_init.sql` | 初始 schema 迁移(6 张表 + 外键) |
| `backend/src/lib/storage/index.ts` | 组装 `store` 对象 |
| `backend/src/lib/storage/{workspaces,agents,groups,messages,files}.ts` | 按领域拆分的 CRUD |
| `backend/src/lib/storage/shared.ts` | `withSchemaRetry` / `uuid` / `now` / `initialAgentHistory` |
| `backend/src/lib/file-service.ts` | 上传目录文件系统操作 |
| `backend/src/lib/api-paths.ts` | 客户端 API 路由常量(扁平路由优先) |
| `backend/src/lib/llm/*` | 统一 LLM StreamAssembler / SSE 解析 |
| `backend/src/server/handlers/*.ts` | 路由共享 handler(workspace-defaults、agent-context-stream、group-messages) |
| `backend/src/runtime/agent-runtime.ts` | Agent 运行时核心 |
| `backend/src/runtime/event-bus.ts` | Agent 内部事件总线 |
| `backend/src/runtime/ui-bus.ts` | Workspace UI 事件总线 |
| `backend/src/runtime/skill-loader.ts` | Skill 发现与加载 |
| `backend/src/runtime/mcp.ts` | MCP 外部工具 |

### API 路由(部分)

| 文件 | 用途 |
|---|---|
| `backend/app/api/glm/stream/route.ts` | LLM 流式调用 API |
| `backend/app/api/workspace-defaults/route.ts` | 扁平别名(前端首选) |
| `backend/app/api/agent-context-stream/route.ts` | 扁平 SSE 别名 |
| `backend/app/api/group-messages/route.ts` | 扁平消息别名 |
| `backend/app/api/workspaces/[workspaceId]/defaults/route.ts` | 嵌套兼容路由 |
| `backend/app/api/agents/[agentId]/context-stream/route.ts` | 嵌套兼容 SSE |
| `backend/app/api/groups/[groupId]/messages/route.ts` | 嵌套兼容消息 |
| `backend/app/api/ui-stream/route.ts` | UI SSE 通道 |

### 前端

| 文件 | 用途 |
|---|---|
| `backend/app/im/page.tsx` | 前端 IM 主界面(经 `apiPaths` 走扁平路由) |
| `backend/app/im/components/{FilePanel,Composer}.tsx` | IM 子组件 |
| `backend/app/globals.css` | 全局样式 |

### 验证 & 配置

| 文件 | 用途 |
|---|---|
| `backend/scripts/smoke-api.mjs` | API smoke test(`npm run smoke:api`,区分 Next.js HTML 404 vs handler JSON 404) |
| `backend/eslint.config.mjs` | ESLint v9 flat config |
| `backend/tsconfig.json` | 含 `@/server/*` 别名 |
