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

## 未完成项

| 优先级 | 项 |
|---|---|
| 中 | 文件删除 API/前端（storage 有 `deleteFile`，未暴露） |
| 低 | 文件内容预览 |
| 低 | 多文件批量上传 |
| 低 | 文件定期清理（长期） |
| 低 | Drizzle migration 系统（长期） |

## 风险记录

1. **文件路径安全**依赖 `path.resolve` + `startsWith` 检查，Windows 路径格式差异需额外验证。
2. **Agent 可能通过 bash 绕过 read_file** — bash 工具仍可 `cat data/uploads/...`，system prompt 仅作软性约束。
