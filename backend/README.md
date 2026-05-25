# Backend (MVP)

独立 Next.js 后端（Route Handlers），用 Bun 运行。

## 环境变量
- `DATABASE_URL`：PostgreSQL 连接串（例如 `postgres://user:pass@localhost:5432/agent_wechat`）
- `REDIS_URL`：Redis 连接串（例如 `redis://localhost:6379`）
- `LLM_PROVIDER`：LLM 提供方（`glm` 或 `openrouter`，默认 `glm`）
- `GLM_API_KEY`：智谱 API Key（或使用 `ZHIPUAI_API_KEY` 作为兼容）
- `GLM_BASE_URL`（可选）：默认 `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- `GLM_MODEL`（可选）：默认 `glm-4.7`
- `OPENROUTER_API_KEY`：OpenRouter API Key（当 `LLM_PROVIDER=openrouter` 时必填）
- `OPENROUTER_BASE_URL`（可选）：默认 `https://openrouter.ai/api/v1/chat/completions`
- `OPENROUTER_MODEL`（可选）：OpenRouter 模型名（留空则使用服务端默认）
- `OPENROUTER_HTTP_REFERER`（可选）：OpenRouter 建议的 `HTTP-Referer`
- `OPENROUTER_APP_TITLE`（可选）：OpenRouter 建议的 `X-Title`

## 启动 PostgreSQL + Redis（Docker）
```bash
cd backend
docker compose up -d
```

## 本地启动
```bash
cd backend
npm install
GLM_API_KEY=xxx npm run dev
```

如需用 Bun（可选）：
```bash
cd backend
bun install
GLM_API_KEY=xxx bun run dev
```

## 初始化数据库
首次启动 dev server 即可,storage 层 `withSchemaRetry` 会捕获 schema 缺失自动跑 Drizzle migration。也可显式触发:
```bash
curl -X POST http://localhost:3017/api/admin/init-db
```

## 已实现接口(按领域分类,共 ~28 个路由)

完整列表与说明见 [`ARCHITECTURE.md`](../ARCHITECTURE.md) 和 [`CODEBASE_REVIEW.md`](../CODEBASE_REVIEW.md);常用路由:

| 领域 | 主要路由 |
|---|---|
| Health | `GET /api/health` |
| Workspace | `GET/POST /api/workspaces` / `DELETE /api/workspaces/[id]` / `GET /api/workspace-defaults?workspaceId` |
| Agent | `GET/POST /api/agents` / `GET/DELETE /api/agents/[id]` / `GET /api/agent-context-stream?agentId` (SSE) / `POST /api/agents/interrupt-all` |
| Group | `GET/POST /api/groups` / `DELETE /api/groups/[id]` / `GET/POST /api/group-messages?groupId&before&limit` (扁平,支持 cursor 分页) |
| Phase | `GET /api/phase-summaries?groupId` (扁平别名) / `GET /api/groups/[id]/phase-summaries` (嵌套兼容) |
| File | `GET /api/files?workspaceId` / `POST /api/files/upload` (multipart, .md/.txt/.json/.csv, ≤2MB) |
| UI / Graph | `GET /api/ui-stream?workspaceId` (SSE) / `GET /api/agent-graph?workspaceId` |
| LLM | `POST /api/glm/stream` (GLM/OpenRouter 流式代理) |
| Admin | `POST /api/admin/{init-db,reset,clear-db,clear-realtime}` |
| Search | `GET /api/search?q` |

每个嵌套路由(`/api/groups/[id]/messages`)通常配有一个扁平别名(`/api/group-messages?groupId`),前端通过 `src/lib/api-paths.ts` 统一走扁平路由 — 绕开 Turbopack nested-dynamic-route dev-mode bug。

## 架构分层

```text
Next.js Route (app/api/*)
  -> Service / Use Case (src/services/*)
    -> Storage / Repository (src/lib/storage/*)
      -> Drizzle ORM -> PostgreSQL
```

| 层 | 职责 | 示例 |
|---|---|---|
| **Route** | HTTP 解析、参数校验、返回 Response | `app/api/agents/route.ts` |
| **Service** | 业务用例、跨表事务、编排 | `src/services/agent-service.ts` |
| **Storage** | 纯数据访问、CRUD | `src/lib/storage/agents.ts` |
| **Runtime** | Agent 编排、LLM 调用、工具执行 | `src/runtime/*` |
| **Tools** | Runtime 能力（文件、消息、群组...） | `src/runtime/tools/*` |

### 边界规则

- Route 不做 Drizzle transaction，只调用 Service
- Storage 不反向 import Service
- Storage 不直接发 UI 事件（`emitDbWrite` 已标记 deprecated）
- AgentRunner 通过 **ports** 注入 UI 事件和日志，不直接依赖 `getWorkspaceUIBus`
- Runtime Tools 通过 `ToolContext.events` 发事件，不直接 import UI Bus

## smoke test
```bash
npm run smoke:api
```
区分 Next.js HTML 404(路由未注册,fail)和 handler JSON 404(资源不存在,pass)。
