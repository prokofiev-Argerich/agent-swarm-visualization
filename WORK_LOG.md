# Swarm-IDE 工作日志

> 记录项目关键改动、设计决策和未完成项。

---

## 2026-05-15

### 删除功能（Agent / Group / Workspace）

IM 界面新增删除按钮，支持删除 agent、group 和 workspace。

**设计约束**：
- 禁止删除 `role === "human"` 的 agent
- 删除 group 时级联删除 messages、group_members
- 删除 workspace 时级联删除所有关联数据（含 files 表和磁盘上传目录）
- Workspace 删除需二次确认

**修复**：`backend/src/runtime/agent-logger.ts:204` 预存 bug `logDir` → `input.logDir`

---

### ARCHITECTURE.md

项目根目录新增架构文档，覆盖技术栈、数据库关系、AgentRuntime 架构、双事件总线、SSE 通道、Skill 系统、MCP 扩展、运行逻辑、内置工具、提示词模板和数据流全景图。

---

### 文件上传与 Agent 读取系统

**核心链路**：上传 → DB 记录 → SSE 刷新 → UI 列表 → Agent 上下文注入 → `read_file` 工具 → 权限校验 → 读取事件

**安全规则**：
- 扩展名白名单：`.md`、`.txt`、`.json`、`.csv`
- 最大 2MB
- fileId 驱动（上传逻辑生成 UUID），禁止路径访问
- 文件存储在 `data/uploads/{workspaceId}/{fileId}`，不暴露原始文件名

**API**：
- `POST /api/files/upload` — multipart/form-data
- `GET /api/files?workspaceId=xxx` — 返回文件列表

**Agent 工具**：`read_file({ fileId })`
- workspace 权限校验 + 路径遍历防护
- 内容超过 100KB 自动截断
- 返回 `{ filename, content, truncated, totalBytes }`

**前端**：左侧文件面板，支持上传、展开/收起、点击插入 read_file、复制 fileId

---

### 鲁棒性修复

| 修复项 | 说明 |
|---|---|
| 自动 Schema 初始化 | `withSchemaRetry` 包裹文件相关 storage 方法，遇到 `42P01`（表不存在）自动 `ensureSchema()` 建表重试 |
| Upload 顺序调整 | 先写磁盘临时文件 → rename → 写 DB → DB 失败删文件。避免磁盘写入失败留下孤儿 DB 记录 |
| files 外键级联 | `ON DELETE CASCADE`，删除 workspace 时自动清理 files 记录 |

---

## 2026-05-15 重构阶段

### 阶段 0：提取共享工具

| 文件 | 说明 |
|---|---|
| `backend/src/lib/constants.ts` | 集中 SESSION_KEY、ALLOWED_FILE_EXTENSIONS、MAX_FILE_SIZE |
| `backend/src/lib/sse.ts` | 统一 SSE 封装（sseWithId、sseKeepalive、createSSEResponse） |
| `backend/src/lib/file-service.ts` | 文件系统操作独立（write/read/delete uploads） |
| `backend/app/api/files/*` | files API 加 Zod 验证 |

### 阶段 1：Drizzle migration

| 文件 | 说明 |
|---|---|
| `backend/drizzle.config.ts` | 迁移配置 |
| `backend/src/db/migrate.ts` | `drizzle-orm/postgres-js/migrator` 封装 |
| `backend/src/db/migrations/0000_init.sql` | 初始迁移（6 表 + 外键） |
| `backend/src/db/init.ts` | 改用 `migrate()` 代替手写 `CREATE TABLE` |

### 阶段 2：Storage 按领域拆分

| 文件 | 说明 |
|---|---|
| `backend/src/lib/storage/shared.ts` | withSchemaRetry、uuid、now、initialAgentHistory、emitDbWrite |
| `backend/src/lib/storage/workspaces.ts` | list/create/ensureDefaults/delete |
| `backend/src/lib/storage/agents.ts` | create/list/get/setHistory/unread/delete |
| `backend/src/lib/storage/groups.ts` | create/list/mergeP2P/members/delete |
| `backend/src/lib/storage/messages.ts` | list/send/directMessage/markRead |
| `backend/src/lib/storage/files.ts` | create/get/list/delete |
| `backend/src/lib/storage/index.ts` | 组装 store 对象，调用方兼容 |

### 阶段 3：IM 页面组件提取

| 文件 | 说明 |
|---|---|
| `backend/app/im/components/FilePanel.tsx` | 文件面板（上传、展开/收起、fileId 复制） |
| `backend/app/im/components/Composer.tsx` | 输入框（Ctrl+Enter 发送） |

### 阶段 4：统一 LLM StreamAssembler

| 文件 | 说明 |
|---|---|
| `backend/src/lib/llm/types.ts` | LlmChunk、AssembledState、TokenUsage |
| `backend/src/lib/llm/assembler.ts` | 统一 StreamAssembler(替代 GLMStreamAssembler + OpenAIStreamAssembler) |
| `backend/src/lib/llm/sse.ts` | parseSSEJsonLines |
| `backend/src/lib/llm/index.ts` | 统一导出 |

### 阶段 5：API facade + 路由鲁棒性修复

**起因**：Next.js 16 + Turbopack 在 dev 下对嵌套动态路由(`[id]/sub/`)首次请求可能返回 404,production build 正常。

**架构**：
- 抽离 shared handler 到 `src/server/handlers/*`
- 同时暴露扁平路由 + 嵌套路由,两者复用同一 handler
- 客户端统一走 `apiPaths`,只用扁平路由
- 嵌套路由作为 production 兼容 alias

| 文件 | 说明 |
|---|---|
| `backend/src/server/handlers/workspace-defaults.ts` | `ensureWorkspaceDefaults` 包装 |
| `backend/src/server/handlers/agent-context-stream.ts` | SSE 流包装 |
| `backend/src/server/handlers/group-messages.ts` | list + send 包装 |
| `backend/app/api/workspace-defaults/route.ts` | 扁平路由 |
| `backend/app/api/agent-context-stream/route.ts` | 扁平路由 |
| `backend/app/api/group-messages/route.ts` | 扁平路由 |
| `backend/src/lib/api-paths.ts` | 客户端路由常量 |
| `backend/scripts/smoke-api.mjs` | API smoke test(区分 Next.js 404 vs handler JSON 404) |
| `backend/package.json` | 新增 `smoke:api` script |
| `backend/tsconfig.json` | 新增 `@/server/*` path alias |

**Drizzle migration 修复**：
- `backend/src/db/migrations/0000_init.sql`：`---> statement-breakpoint`(3 dash) → `--> statement-breakpoint`(2 dash)。原版会让 migrator split 后留下孤儿 `-`,触发 `syntax error at or near "-"`
- `backend/src/db/init.ts`：删掉 `CREATE TABLE drizzle_migrations`(死代码,drizzle 自己用 `drizzle.__drizzle_migrations`)

**前端迁移**：`backend/app/im/page.tsx` 6 处 fetch 全部走 `apiPaths`,移除 hardcoded URL

**ESLint 配置(只配置,不修代码)**：
- 新增 `backend/eslint.config.mjs`：ESLint v9 flat config + `eslint-config-next/core-web-vitals`
- 之前 `npm run lint` 因缺 `eslint.config.*` 直接报错,现已能运行

**本轮验证状态**：
- `npm run smoke:api` passed
- `npx tsc --noEmit` clean
- `npm run lint` now runs, but fails on pre-existing lint issues:
  - 4 errors in `app/im/page.tsx`(全部 `react-hooks/set-state-in-effect`,React 19 新规则,源自旧 useEffect)
  - 15 warnings across old files(主要是 unused eslint-disable + exhaustive-deps)
- 本轮新建/修改文件无 lint 问题。本轮可以交付。

---

## 阶段 6:lint cleanup(待办,独立立项)

> 本轮不动 lint violations。原因:4 个 errors 要改 useEffect 行为,风险高于本轮 route 重构。

执行顺序:
1. 先修 `app/im/page.tsx` 的 4 个 `react-hooks/set-state-in-effect` errors(行 1022 / 1090 / 1235 / 1241)
2. 每个 useEffect 单独改,避免批量重构
3. errors clean 后再处理 `exhaustive-deps` warnings
4. 最后删 unused eslint-disable 和修 config 文件 anonymous default export

---

## 未完成项

| 优先级 | 项 |
|---|---|
| 中 | 文件删除 API/前端（storage 有 `deleteFile`，未暴露） |
| 中 | 推广 Zod 到所有 API（目前只有 files API） |
| 低 | 文件内容预览 |
| 低 | 多文件批量上传 |
| 低 | 文件定期清理（长期） |
| 低 | 统一 API 错误处理中间件 |

## 风险记录

1. **文件路径安全**依赖 `path.resolve` + `startsWith` 检查，Windows 路径格式差异需额外验证。
2. **Agent 可能通过 bash 绕过 read_file** — bash 工具仍可 `cat data/uploads/...`，system prompt 仅作软性约束。
