# Swarm-IDE 代码库审查报告

> 基于 2026-05-15 代码状态的全面梳理与优化建议。

---

## 一、项目概览

Swarm-IDE 是一个 IM 范式的多 Agent 协作平台。核心思想是：Agent 可以像人一样在群聊中发消息、创建子 Agent、组建群组。人类通过 Web 界面随时介入任意层级的 Agent 对话。

**目录结构**:
```
swarm-ide/
├── backend/              # Next.js 16 后端（核心）
│   ├── app/api/          # API 路由（22 个端点）
│   ├── app/im/           # IM 界面
│   ├── app/graph/        # Graph 可视化
│   ├── src/db/           # 数据库（Drizzle + postgres.js）
│   ├── src/lib/          # storage.ts, config.ts
│   ├── src/runtime/      # AgentRuntime, event bus, MCP, skills
│   └── skills/           # Agent 技能定义
├── whitepaper-site/      # 白皮书展示站点（独立 Next.js 应用）
└── specs/                # 设计文档
```

---

## 二、数据库模型

6 张表，外键关系清晰：

```
workspaces
  └─ agents (workspace_id)
  └─ groups (workspace_id)
  └─ messages (workspace_id, group_id)
  └─ files (workspace_id, CASCADE)

groups
  └─ group_members (group_id)
```

| 表 | 核心字段 | 说明 |
|---|---|---|
| `workspaces` | id, name, createdAt | 工作空间 |
| `agents` | id, workspace_id, role, parent_id, llm_history | Agent（role="human" 是人类） |
| `groups` | id, workspace_id, name, context_tokens | 群组（P2P 是双人默认群） |
| `group_members` | group_id, user_id, last_read_message_id | 群成员 + 已读游标 |
| `messages` | id, workspace_id, group_id, sender_id, content_type, content, send_time | 消息 |
| `files` | id, workspace_id, filename, mime_type, size, created_at | 上传文件 |

**问题**：数据库初始化靠 `init.ts` 手写 `CREATE TABLE`，无 Drizzle migration 系统。Schema 变更需手动改 SQL，且已有部署环境需要跑 `init-db` 才能同步新表。

---

## 三、API 接口清单

### 3.1 Workspace

| 路由 | 方法 | 请求 | 响应 | 说明 |
|---|---|---|---|---|
| `/api/workspaces` | GET | `?` | `{ workspaces: [...] }` | 列出所有 |
| `/api/workspaces` | POST | `{ name? }` | `{ workspaceId, humanAgentId, p2pGroupId }` | 创建（含默认 human agent + P2P 群） |
| `/api/workspaces/[id]` | DELETE | `?workspaceId` | `{ ok }` | 级联删除所有关联数据 |
| `/api/workspaces/[id]/defaults` | GET | `?workspaceId` | `{ humanAgentId, p2pGroupId }` | 获取默认值 |

### 3.2 Agent

| 路由 | 方法 | 请求 | 响应 | 说明 |
|---|---|---|---|---|
| `/api/agents` | GET | `?workspaceId&meta=true` | `{ agents: [...] }` | 列出（meta 只返回 id/role/parentId） |
| `/api/agents` | POST | `{ workspaceId, creatorId, role, groupId? }` | `{ agentId, groupId, createdAt }` | 创建子 Agent（自动创建 P2P 群） |
| `/api/agents/[id]` | GET | — | `{ agentId, role, llmHistory }` | 获取 Agent |
| `/api/agents/[id]` | DELETE | `?workspaceId` | `{ ok }` | 删除（禁止删 human） |
| `/api/agents/[id]/context-stream` | GET (SSE) | — | SSE: agent.* 事件 | Agent 上下文流，非 human 自动唤醒 |
| `/api/agents/interrupt-all` | POST | `{ workspaceId }` | `{ interrupted, agentIds }` | 中断所有 running agent |

### 3.3 Group

| 路由 | 方法 | 请求 | 响应 | 说明 |
|---|---|---|---|---|
| `/api/groups` | GET | `?workspaceId&agentId` | `{ groups: [...] }` | 列出（支持按 agent 过滤） |
| `/api/groups` | POST | `{ workspaceId, memberIds[], name? }` | `{ id, name }` | 创建（2 人自动检测重复 P2P） |
| `/api/groups/[id]` | DELETE | `?workspaceId` | `{ ok }` | 删除 |
| `/api/groups/[id]/messages` | GET | `?workspaceId&agentId&limit` | `{ messages: [...] }` | 获取消息 |
| `/api/groups/[id]/messages` | POST | `{ workspaceId, senderId, content }` | `{ id }` | 发送消息 |

### 3.4 File

| 路由 | 方法 | 请求 | 响应 | 说明 |
|---|---|---|---|---|
| `/api/files` | GET | `?workspaceId` | `{ files: [...] }` | 列出（自动 ensureSchema） |
| `/api/files/upload` | POST | multipart: workspaceId, file | `{ fileId, filename, ... }` | 上传（白名单 .md/.txt/.json/.csv, 最大 2MB） |

### 3.5 UI & Graph

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/ui-stream` | GET (SSE) | UI 事件流：agent.created, group.created, message.created, llm.start/done, tool_call.start/done, db.write |
| `/api/agent-graph` | GET | 返回 nodes（agents）+ edges（消息流向） |
| `/api/glm/stream` | POST | LLM 流式代理（GLM/OpenRouter） |

### 3.6 Admin

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/admin/init-db` | POST | ensureSchema |
| `/api/admin/reset` | POST | 清空数据库并重新 init |
| `/api/admin/clear-db` | POST | 清空 Postgres |
| `/api/admin/clear-realtime` | POST | 清空 Upstash 实时数据 |

---

## 四、核心架构

### 4.1 分层模型

```
┌─────────────────────────────────────────┐
│  Frontend (React 19 + SSE)              │
│  - IM 界面 (app/im/page.tsx)            │
│  - Graph 可视化 (app/graph/page.tsx)    │
├─────────────────────────────────────────┤
│  API Routes (Next.js Route Handlers)    │
│  - REST API + SSE endpoints             │
├─────────────────────────────────────────┤
│  Storage (Drizzle ORM + postgres.js)    │
│  - store 对象：所有 CRUD 操作           │
├─────────────────────────────────────────┤
│  Runtime                                │
│  - AgentRuntime（单例，管理 Runner）    │
│  - AgentRunner（per-agent 事件循环）    │
│  - AgentEventBus（per-agent）           │
│  - WorkspaceUIBus（per-workspace）      │
│  - MCP Client, SkillLoader              │
└─────────────────────────────────────────┘
```

### 4.2 AgentRuntime 生命周期

```
AgentRuntime（单例，globalThis.__swarmIdeRuntime）
  └─ runners: Map<agentId, AgentRunner>
  └─ ensureRunner(agentId) → 创建/复用 Runner
  └─ wakeAgent(agentId, reason) → emit agent.wakeup
  └─ processGroupUnread(agentId, groupId) → LLM 推理循环

AgentRunner（独立事件循环）
  └─ 监听 agent.wakeup + agent.unread
  └─ 收集未读消息 → 构建 history → 调 LLM
  └─ LLM 返回 tool_calls → 逐个 executeToolCall
  └─ 工具结果 append 到 history → 再次调 LLM（循环）
  └─ 完成/出错时 emit agent.done / agent.error
```

### 4.3 SSE 双通道

| 通道 | 范围 | 事件类型 | 消费者 |
|---|---|---|---|
| `context-stream` | per-agent | agent.wakeup, agent.unread, agent.stream, agent.done, agent.error | Agent 详情面板 |
| `ui-stream` | per-workspace | ui.agent.created, ui.group.created, ui.message.created, ui.agent.llm.start/done, ui.agent.tool_call.start/done, ui.db.write | 全局 UI（侧边栏、聊天列表） |

### 4.4 事件总线

```typescript
// AgentEventBus: per-agent，agent 内部状态流转
agent.wakeup    → AgentRunner 开始处理
agent.unread    → 有新的未读消息批次
agent.stream    → LLM 流式输出（reasoning/content/tool_calls/tool_result）
agent.done      → 当前轮次完成
agent.error     → 出错

// WorkspaceUIBus: per-workspace，UI 状态更新
ui.agent.created       → 左侧 agent tree 新增节点
ui.group.created       → 左侧 group list 新增
ui.message.created     → 聊天列表新增消息
ui.agent.llm.start     → 显示"Thinking..."
ui.agent.llm.done      → 隐藏"Thinking..."
ui.agent.tool_call.start/done → 显示工具调用状态
ui.db.write            → 数据变更，前端刷新列表
ui.agent.file.read     → Agent 读取了文件
```

### 4.5 数据流全景（消息生命周期）

```
用户发消息
  → POST /api/groups/[id]/messages
    → store.createMessage() → 写入 DB
    → WorkspaceUIBus.emit ui.message.created → 前端收到 SSE
    → AgentRunner 监听 agent.unread
      → processGroupUnread()
        → 构建 history（system prompt + 文件列表 + messages）
        → 调 LLM（/api/glm/stream）
          → LLM 返回 content / tool_calls
            → 如果是 send_group_message → 再次 createMessage
            → 如果是 read_file → 读取文件 → emit ui.agent.file.read
            → 如果是 create → 创建子 Agent → emit ui.agent.created
        → 完成 → emit agent.done
          → WorkspaceUIBus.emit ui.agent.history.persisted
```

---

## 五、冗余与可重构点

### 🔴 高优先级

#### 1. `storage.ts` 过于庞大（~1300 行）

**问题**：一个 `store` 对象包含所有表的 CRUD，职责混杂。Workspace、Agent、Group、Message、File 全挤在一起。

**建议**：按领域拆分为独立模块：
```
src/lib/storage/
  ├── index.ts          # 统一导出
  ├── workspace-store.ts
  ├── agent-store.ts
  ├── group-store.ts
  ├── message-store.ts
  └── file-store.ts
```

#### 2. API 路由缺乏统一的错误处理和请求体验证

**问题**：每个路由都重复写 `try/catch` + `e instanceof Error ? e.message : String(e)`。没有 Zod 验证，全靠手动判空。

**建议**：
- 引入 Zod（项目已依赖）做请求体验证
- 统一错误处理中间件/包装器：
```typescript
function apiHandler<T>(fn: (req: Request) => Promise<T>) {
  return async (req: Request) => {
    try {
      return Response.json(await fn(req));
    } catch (e) {
      return Response.json({ error: formatError(e) }, { status: 500 });
    }
  };
}
```

#### 3. 前端 `im/page.tsx` 过于庞大

**问题**：单文件承载三栏布局 + 状态管理 + SSE 处理 + Agent Tree 渲染 + Chat UI + File Panel。维护困难。

**建议**：拆分为组件目录：
```
app/im/
  ├── page.tsx              # 组装层
  ├── components/
  │   ├── sidebar.tsx       # 左侧栏（workspace + agents + groups + files）
  │   ├── chat-panel.tsx    # 中间聊天区
  │   ├── composer.tsx      # 输入框
  │   ├── agent-detail.tsx  # 右侧 Agent 详情
  │   └── sse-provider.tsx  # SSE 连接管理
  └── hooks/
      ├── use-workspace.ts
      ├── use-agents.ts
      └── use-messages.ts
```

#### 4. 数据库无迁移系统

**问题**：`init.ts` 手写 `CREATE TABLE`，新增/修改字段时需要手动处理。已有部署环境需跑 `init-db` 才能同步。

**建议**：使用 Drizzle 官方 migration：`drizzle-kit generate` + `drizzle-kit migrate`。长期必须做。

---

### 🟡 中优先级

#### 5. SSE 封装逻辑重复

**问题**：`context-stream/route.ts` 和 `ui-stream/route.ts` 有几乎相同的 SSE 封装（`sseWithId`, keepalive, abort handler）。

**建议**：提取为共享工具：
```typescript
// lib/sse.ts
export function createSSEStream(handler: (send) => Promise<() => void>) { ... }
```

#### 6. `deleteWorkspace` 中 storage 层操作文件系统

**问题**：`storage.ts` 的 `deleteWorkspace` 直接 `fs.rm()` 删除 `data/uploads/` 目录。storage 应该是纯数据库操作层。

**建议**：文件系统操作提到 API 层或专门的 `file-service.ts`：
```typescript
// API 层
await store.deleteWorkspace({ workspaceId });
await fileService.deleteWorkspaceUploads(workspaceId);
```

#### 7. SESSION_KEY 硬编码多处

**问题**：`"swarm-ide.session.v1"` 在 `clear-db.tsx`, `graph/page.tsx`, `im/page.tsx` 三处重复。

**建议**：集中到一个常量文件：
```typescript
// lib/constants.ts
export const SESSION_KEY = "swarm-ide.session.v1";
```

#### 8. LLM Provider 切换不完善

**问题**：`glm/stream/route.ts` 直接处理 GLM/OpenRouter 两种 provider，没有统一的 provider 抽象。`openai-stream.ts` 存在但可能未充分利用。

**建议**：统一为 provider 接口：
```typescript
interface LLMProvider {
  stream(messages: HistoryMessage[]): AsyncIterable<LLMChunk>;
}
class GLMProvider implements LLMProvider { ... }
class OpenRouterProvider implements LLMProvider { ... }
```

#### 9. `config.ts` 过于简单

**问题**：只支持 `tokenLimit`，且用 JSON 文件配置。但 LLM 模型、provider、超时等散落在环境变量中。

**建议**：扩展为统一的配置中心，支持：
- `maxAgentsPerWorkspace`
- `defaultModel`
- `toolTimeoutMs`
- `fileSizeLimit`
- `maxFilesInContext`

#### 10. `upstash-realtime.ts` 与本地事件总线重复

**问题**：AgentEventBus 和 WorkspaceUIBus 都实现了本地 buffer + listener + `getSince`，但两套独立。Upstash 只是可选的持久化层。

**建议**：提取一个通用的 `EventChannel<T>` 基类，AgentEventBus 和 WorkspaceUIBus 继承它。

---

### 🟢 低优先级

#### 11. `agent-logger.ts` 写日志的方式较原始

**问题**：用文件系统 `fs.writeFile` 逐条追加，没有轮转，没有结构化格式。

**建议**：考虑用 pino/winston 等结构化日志库，或至少按日期分文件。

#### 12. `skill-loader.ts` 的 `parseFrontmatter` 自行实现

**问题**：手动解析 YAML frontmatter，代码 120+ 行。

**建议**：用 `yaml` 或 `gray-matter` 库（项目已用 YAML，可以复用）。

#### 13. `withSchemaRetry` 只在文件方法中使用

**问题**：`withSchemaRetry` 很好，但只包裹了文件相关方法。其他表（agents、groups 等）在新环境中也可能遇到表不存在。

**建议**：推广到所有 storage 方法，或在 `getDb()` 层面统一处理。

#### 14. `whitepaper-site` 与 `backend` 共享代码困难

**问题**：两个独立的 Next.js 应用，但可能需要共享类型定义、工具函数。

**建议**：考虑 monorepo 结构，提取 `packages/shared`。

---

## 六、优化路线图

### 阶段一：债务清理（1-2 天）

1. 拆分 `storage.ts` 为领域模块
2. 提取 `lib/sse.ts` 统一 SSE 封装
3. 提取 `lib/constants.ts` 集中常量
4. `deleteWorkspace` 文件系统操作移到 API 层
5. 引入 Zod 做请求体验证（高价值路由优先）

### 阶段二：架构加固（3-5 天）

1. 拆分 `im/page.tsx` 为组件目录
2. 统一 LLM Provider 抽象
3. 扩展 `config.ts` 为配置中心
4. 引入 Drizzle migration 系统
5. 推广 `withSchemaRetry` 到所有 storage 方法

### 阶段三：体验优化（1-2 天）

1. 文件内容预览面板
2. 多文件批量上传
3. 文件删除 API + 前端按钮
4. 日志轮转

---

## 七、关键文件索引

| 文件 | 职责 | 行数估算 | 健康度 |
|---|---|---|---|
| `src/lib/storage.ts` | 所有数据库操作 | ~1300 | 拆分 |
| `app/im/page.tsx` | IM 界面（三栏） | ~1600 | 拆分 |
| `src/runtime/agent-runtime.ts` | Agent 推理循环 | ~1500 | 良好 |
| `src/runtime/ui-bus.ts` | UI 事件总线 | ~180 | 良好 |
| `src/runtime/event-bus.ts` | Agent 事件总线 | ~130 | 良好 |
| `src/runtime/mcp.ts` | MCP 客户端 | ~400 | 良好 |
| `src/runtime/skill-loader.ts` | 技能加载器 | ~325 | 良好 |
| `src/db/init.ts` | 手写 schema init | ~70 | 迁移 |
| `app/api/glm/stream/route.ts` | LLM 代理 | ~200 | 抽象 |
| `app/api/files/upload/route.ts` | 文件上传 | ~90 | 良好 |

---

## 八、风险记录

| 风险 | 影响 | 缓解 |
|---|---|---|
| 改 SESSION_KEY 丢失用户会话 | 中 | 提前通知用户，或做数据迁移 |
| storage 拆分引入回归 | 中 | 逐模块迁移，每步验证 |
| Drizzle migration 首次执行 | 高 | 先在开发环境测试，备份生产 DB |
| page.tsx 拆分引入状态 bug | 中 | 用小步重构，保持行为不变 |
| LLM Provider 抽象影响推理 | 高 | 充分测试两种 provider |
