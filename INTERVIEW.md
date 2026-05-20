# Swarm-IDE 项目简介(面试稿)

## 一句话定义

**用微信式 IM 范式做多 Agent 协作平台**:不预设 DAG、不固定角色,只给 agent 两个原语(`create_agent` + `send_message`),让协作拓扑在运行时自演化,人类作为一种特殊 agent 全程可见、可介入。

---

## 解决了什么问题

1. **现有 Agent 框架(LangGraph / AutoGen / CrewAI)依赖预定义拓扑** — 节点、边、角色都要先画 DAG;复杂多 Agent 协作,改流程就要改代码。
2. **Agent 对话临时、上下文 ad-hoc** — 缺乏持久化、缺乏回放、缺乏对人类的可视化。
3. **人类难以介入 Agent 内部对话** — 通常只能看日志,不能像在群里发消息一样实时插话。

**我的解决方案**:把多 Agent 协作"翻译"成 IM 模型 —— 群、消息、未读游标、@提及;人类是一个特殊 Agent;Agent 之间的协作就是发消息建群,完全自演化。

---

## 技术栈

| 层 | 选型 | 选这个的理由 |
|---|---|---|
| 前端 | Next.js 16 (App Router) + React 19 + Tailwind 4 | SSR + SSE 原生支持,前后端共享类型 |
| 实时通信 | **SSE 双通道**(per-agent stream + workspace UI bus) | 比 WebSocket 简单,断线重连免费,IM 场景够用 |
| 后端 | Next.js Route Handlers (Node.js runtime) | 单仓一站式 |
| 数据库 | PostgreSQL 17 + Drizzle ORM | 类型安全,migration 显式 |
| DB 驱动 | `postgres` (postgres-js) | Drizzle 官方推荐,比 `pg` 性能更好 |
| LLM 集成 | OpenRouter / GLM,**自研 StreamAssembler** 统一 SSE 格式 | 不依赖 LangChain 这层抽象 |
| 工具协议 | **MCP** (Model Context Protocol, Anthropic 标准) | 任何 MCP server 即插即用 |
| 容器化 | docker-compose (Postgres + Redis) | 一行起本地环境 |
| 实时层(可选) | Redis Streams | 跨进程订阅 + 历史重放 |

---

## 架构(自顶向下 4 层)

```
┌─────────────────────────────────────────────┐
│ Frontend  React + SSE 双通道                 │
│  /im (聊天) + /graph (拓扑可视化)           │
├─────────────────────────────────────────────┤
│ API Routes  flat + nested 双路由(facade)   │
│  ├─ /api/group-messages?groupId=...         │
│  └─ /api/groups/[id]/messages (兼容)        │
├─────────────────────────────────────────────┤
│ Storage  Drizzle ORM + postgres-js          │
│  store{} 按领域拆 7 个文件,spread 合并     │
├─────────────────────────────────────────────┤
│ Runtime  in-process 单例                    │
│  ├─ AgentRuntime (全局)                     │
│  ├─ AgentRunner (per-agent 独立事件循环)   │
│  ├─ AgentEventBus (per-agent 高频流)       │
│  ├─ WorkspaceUIBus (per-workspace 结构事件)│
│  └─ MCP Registry / Skill Loader             │
└─────────────────────────────────────────────┘
```

### 关键设计点(面试可深挖)

**1. 两个 EventBus,不是一个全局总线**
- `AgentEventBus`(per-agent):token-by-token 高频流,只推给查看该 Agent 详情的客户端
- `WorkspaceUIBus`(per-workspace):结构变化事件(消息创建、群创建、agent 创建),推给整个 workspace
- *为什么拆*:两者频率差一个数量级,合并会让前端被淹

**2. AgentRunner 是独立事件循环,不是 HTTP 驱动**
```
loop():
  await wake.promise          // 阻塞等被叫醒
  processUntilIdle():
    listUnreadByGroup()       // 拉所有群的未读
    runWithTools(history)     // LLM + tool loop,最多 N 轮
```
唤醒方式三种:`group_message` / `direct_message` / `manual`。Agent **不是被 HTTP 请求驱动**,是被消息事件驱动 —— 这是 IM 范式的核心。

**3. 11 个内置工具,但只有 2 个真原语**
- **真原语**:`create_agent` + `send_group_message`
- 其他工具(`list_agents` / `read_file` / `bash` / `create_group` …)都是辅助
- 所有复杂协作(分工、汇总、子任务派生)都是这两个原语的组合

**4. SSE Flat Route Facade**
- Next.js 16 + Turbopack 对 nested dynamic route 有 dev-mode bug
- 解法:同一个 handler 同时挂 `/api/group-messages` (flat) 和 `/api/groups/[id]/messages` (nested)
- 前端走 `apiPaths` 集中管理 URL,以后切换无痛

**5. LLM History 在 agents 表里序列化为 JSON**
- 重启后 agent 完整复活,继续唤醒-处理循环
- 不需要 Redis 之类的运行时态

**6. Workflow Phases(可选阶段化协作)**
- 长流程项目(PRD 评审、代码审查)按阶段切分
- 完成的阶段折叠成摘要卡片,只展开当前活跃阶段
- 解决长对话上下文爆炸 + 前端无限渲染

---

## 数据模型(6 张核心表)

```
workspaces ── agents (parent_id 支持嵌套)
   │
   ├── groups ── group_members (含 last_read_message_id 已读游标)
   │
   ├── messages (group_id + sender_id + phase_id,IM 协议)
   │
   ├── workflow_phases / phase_summaries (阶段化协作,可选)
   │
   └── files (上传 .md/.txt/.json/.csv)
```

---

## 我做了什么(面试时可讲的具体贡献)

### 1. 消息分页 + 阶段摘要(最近一次特性)
- **背景**:长对话 IM 页面性能下降,前端无限渲染
- **方案**:
  - cursor-based 分页(`before` 参数 + nextCursor)
  - 完成的 phase 折叠为摘要卡片,active phase 内联展开
  - 前端用 `Set<messageId>` 去重,SSE 新消息 merge 而不是 replace
- **难点**:
  - Drizzle migration 在 dev 不自动跑 → 实现 `withSchemaRetry`:捕获 PostgreSQL 错误码 `42P01`(表不存在)和 `42703`(列不存在),自动执行 migration 后重试
  - Phase 自动绑定:`send_group_message` 调用时 `getActiveWorkflowPhase` 自动写 `phase_id`,避免 Agent 手动管理

### 2. Agent 工具系统扩展
- 新增 `start_phase` / `end_phase` 工具(OpenAI 兼容 function calling)
- 在 Orchestrator 角色的 system prompt 中显式注入阶段管理指南
- 工具调用支持流式增量构建(`__index__` + `__streaming_chunk__`)

### 3. 跨进程 Schema 自愈
- dev/prod 共享同一份 schema 定义(Drizzle)
- 任何查询如果命中 schema 缺失错误,自动跑对应 migration
- 避免"手动 migrate"的运维负担,保持 dev 体验丝滑

### 4. SSE 实时通信
- 双通道:per-agent 高频 token stream + workspace 结构事件
- 前端 EventSource 重连免费;后端用 ReadableStream 反压

---

## 非典型设计选择(可被追问的取舍)

| 选择 | 取舍 |
|---|---|
| **没引入 LangChain/LangGraph** | 自己写 runtime;stack trace 干净;代价:stream parsing/tool loop 都要自己实现 |
| **AgentRuntime 是 globalThis 单例** | 不是依赖注入;Next.js dev hot-reload 通过 `globalThis.__swarmIdeRuntime` 避免被多次实例化;务实但脆 |
| **SSE 而不是 WebSocket** | 单向流,反向(浏览器→server)走普通 POST;失去双向但简化了断线重连;IM 场景够用 |
| **递归无深度限制** | sub-agent 可无限创建 sub-sub-agent;理论上指数爆炸,实际靠 LLM 不抽风 + workspace 资源限制 |
| **bash 工具直接 exec** | 限制在 workspace root 内;但仍能 `cat ~/.ssh/id_rsa`;开发期 OK,**生产必须沙箱** |

---

## 面试时怎么讲(30 秒电梯)

> 我做了一个叫 Swarm-IDE 的多 Agent 协作平台。**别人(LangGraph)用 DAG 描述协作,我用 IM 模型**。Agent 之间发消息建群,人类是一种特殊 agent 可以随时介入。技术上是 Next.js 16 + Postgres + Drizzle + SSE 双通道,自己写的 AgentRuntime 跑 in-process 事件循环,工具系统兼容 OpenAI function calling + Anthropic MCP。最近做了一个消息分页 + 阶段摘要的特性,顺手实现了一个 schema-retry 机制让 dev 环境自动跑 migration。

---

## 可被追问的方向

- **拓扑可视化** — 怎么处理 60+ agents 的 graph layout(实际见过这个规模)
- **冲突解决** — 多 agent 同时改同一文件的策略(目前没做,可讨论 OT / CRDT)
- **Sandbox** — bash 工具的生产安全方案(Docker exec / WASM / nsjail)
- **可观测性** — Agent 之间消息的因果链追踪(目前只有 timestamp,没有 trace_id)
- **冷启动** — workspace 重启时 60 个 AgentRunner 同时唤醒的雪崩问题
