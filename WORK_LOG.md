# Swarm-IDE 工作日志

> 记录项目关键改动、设计决策和未完成项。

---

## 2026-05-15

### 一、删除功能（Agent / Group / Workspace）

**需求**：IM 界面缺少删除能力，需要在三处添加删除按钮。

**改动**：

| 文件 | 改动 |
|---|---|
| `backend/src/lib/storage.ts` | 新增 `deleteAgent`、`deleteGroup`、`deleteWorkspace` 方法 |
| `backend/app/api/agents/[agentId]/route.ts` | 新增 DELETE handler |
| `backend/app/api/groups/[groupId]/route.ts` | **新建**，DELETE handler |
| `backend/app/api/workspaces/[workspaceId]/route.ts` | **新建**，DELETE handler |
| `backend/app/im/page.tsx` | 添加 Trash2 图标删除按钮 + 确认对话框 |
| `backend/app/globals.css` | `.row-delete-btn` hover 样式 |

**设计决策**：
- 禁止删除 `role === "human"` 的 agent
- 删除 group 时级联删除 messages、group_members
- 删除 workspace 时级联删除所有关联数据
- 删除按钮 hover 时显示，保持界面整洁
- Workspace 删除需二次确认（带警告 emoji）

**修复**：
- `backend/src/runtime/agent-logger.ts:204` 预存 bug：`logDir` → `input.logDir`

---

### 二、ARCHITECTURE.md 文档

**文件**：`ARCHITECTURE.md`（项目根目录）

**内容覆盖**：
- 技术栈（Next.js 16 + React 19 + Tailwind 4 + Drizzle ORM + GLM/OpenRouter）
- 数据库 5 张表及外键关系
- AgentRuntime（单例）+ AgentRunner（独立事件循环）架构
- 双事件总线（AgentEventBus + WorkspaceUIBus）
- SSE 双通道（context-stream + ui-stream）
- 前端 IM 界面布局（三栏）
- Skill 系统（SKILL.md + YAML frontmatter）
- MCP 扩展
- 完整运行逻辑（启动、消息处理、LLM 调用、工具循环）
- 11 个内置工具说明
- 提示词模板（system prompt、history、skill 注入、消息格式）
- 数据流全景图
- 关键文件索引

---

### 三、文件上传与 Agent 读取系统

#### 3.1 数据库层

| 文件 | 改动 |
|---|---|
| `backend/src/db/schema.ts` | 新增 `files` 表（id, workspaceId, filename, mimeType, size, createdAt） |
| `backend/src/db/init.ts` | 新增 `files` 表的 `CREATE TABLE` |

#### 3.2 Storage 层

| 文件 | 改动 |
|---|---|
| `backend/src/lib/storage.ts` | 新增 `createFile`、`getFile`、`listFilesByWorkspace`、`deleteFile` |

#### 3.3 上传 API

| 文件 | 说明 |
|---|---|
| `backend/app/api/files/upload/route.ts` | **新建** POST，接收 multipart/form-data |

**安全规则**：
- 扩展名白名单：`.md`、`.txt`、`.json`、`.csv`
- 最大 2MB
- 不使用原始文件名作为真实存储路径
- 存储位置：`data/uploads/{workspaceId}/{fileId}`
- 返回 `{ fileId, filename, mimeType, size, workspaceId }`

#### 3.4 文件列表 API

| 文件 | 说明 |
|---|---|
| `backend/app/api/files/route.ts` | **新建** GET `?workspaceId=xxx`，返回文件列表 |

#### 3.5 Agent 工具

| 文件 | 改动 |
|---|---|
| `backend/src/runtime/agent-runtime.ts` | 新增 `read_file` 工具定义 + 执行逻辑 |

**`read_file({ fileId })` 设计**：
- 只接受 `fileId`，不接受 `path`
- 通过 `workspaceId + fileId` 查数据库验证权限
- 路径解析后校验必须落在 `data/uploads/{workspaceId}/` 内
- 内容超过 100KB 自动截断，返回 `truncated: true`
- 成功后发射 `ui.agent.file.read` 事件

#### 3.6 系统提示词更新

| 文件 | 改动 |
|---|---|
| `backend/src/lib/storage.ts` | `initialAgentHistory()` 加入 read_file 说明 |
| `backend/src/runtime/agent-runtime.ts` | `processGroupUnread()` 运行时 system prompt 加入 read_file 说明 |

**注入内容**：
> If you need to read a file that was uploaded to this workspace, use the read_file tool with the fileId (never a filesystem path).

#### 3.7 Agent 上下文文件列表注入

**位置**：`backend/src/runtime/agent-runtime.ts`

每次 Agent 处理消息时，自动查询当前 workspace 的文件列表，以 system message 形式注入 history：

```
## Uploaded Files in this Workspace
The following files have been uploaded to this workspace.
To read any file, you MUST use the read_file tool with the fileId...

- prd.md (fileId: xxx, size: 12345 bytes)
- requirements.txt (fileId: yyy, size: 6789 bytes)
```

旧文件列表会被替换（避免重复累积）。

#### 3.8 读取事件

| 文件 | 改动 |
|---|---|
| `backend/src/runtime/ui-bus.ts` | 新增 `ui.agent.file.read` 事件类型 |

事件数据：`{ workspaceId, agentId, fileId, filename, truncated }`

#### 3.9 前端文件列表面板

| 文件 | 改动 |
|---|---|
| `backend/app/im/page.tsx` | 左侧边栏底部新增文件面板 |
| `backend/app/globals.css` | `.file-row:hover` 样式 |

**前端功能**：
- 显示当前 workspace 已上传文件列表
- **+ 按钮**：上传文件（打开系统文件选择器）
- **折叠按钮**：展开/收起面板
- **点击文件**：自动在输入框插入 `read_file({ fileId: "xxx" })`
- **ID 按钮**：复制 fileId 到剪贴板
- SSE 监听到 `ui.db.write` + table="files" 时自动刷新列表

#### 3.10 闭环数据流

```
用户上传 PRD.md
  → POST /api/files/upload
    → 保存到 data/uploads/{workspaceId}/{fileId}
    → 写入 DB files 表
    → SSE ui.db.write → 前端刷新列表
      → 左侧边栏显示 "prd.md"
        → Agent 收到新消息
          → system prompt 自动注入文件列表
            → Agent 知道 fileId，可调用 read_file
              → 验证 workspace 权限 → 读取内容
                → 发射 ui.agent.file.read 事件
```

---

## 未完成项

| 优先级 | 项 | 说明 |
|---|---|---|
| 中 | 文件删除 API/前端 | storage 有 `deleteFile`，但未暴露为 API 或前端按钮 |
| 低 | 文件内容预览 | 点击文件不能直接预览内容，只能插入 read_file 到输入框 |
| 低 | 多文件批量上传 | 当前一次只能选一个文件 |
| 低 | 文件定期清理 | `data/uploads/` 中的文件只会随 workspace 删除而清理 |
| 低 | 数据库迁移系统 | 当前靠 `init-db` 初始化，长期建议用 Drizzle migration |

---

## 风险记录

1. ~~**已有部署环境**需要运行 `POST /api/admin/init-db` 来生成新的 `files` 表。~~ 已自动修复 — `withSchemaRetry` 会在表不存在时自动 `ensureSchema()`。
2. **文件路径安全**依赖 `path.resolve` + `startsWith` 检查，未来如有 Windows 路径格式差异需额外验证。
3. **Agent 可能通过 bash 绕过 read_file** — 虽然 system prompt 禁止，但 bash 工具仍然存在，可通过 `cat data/uploads/...` 读取。这是已知风险，后续可考虑对 bash 的 cwd 做更严格限制。

---

## 2026-05-15 补充修复

### 一、自动 Schema 初始化（文件相关方法）

| 文件 | 改动 |
|---|---|
| `backend/src/db/ensure.ts` | **新建** — `ensureSchemaOnce()` + `isMissingTableError()` |
| `backend/src/lib/storage.ts` | 文件方法（`createFile`/`getFile`/`listFilesByWorkspace`/`deleteFile`）包 `withSchemaRetry` |

**逻辑**：查询/写入 `files` 表时若遇到 `42P01`（relation does not exist），自动 `ensureSchema()` 建表并重试一次。

### 二、Upload 顺序调整（鲁棒性）

| 文件 | 改动 |
|---|---|
| `backend/app/api/files/upload/route.ts` | 上传顺序改为：生成 fileId → 写临时文件 → rename → 写 DB → DB 失败删文件 |
| `backend/src/lib/storage.ts` | `createFile` 改为接受 `id` 参数（不再内部生成 UUID） |

**原因**：先写 DB 再写磁盘时，若磁盘写入失败会留下孤儿 DB 记录。改为先写磁盘再写 DB，失败时最多留下孤儿文件，不会污染数据库。

### 三、Workspace 删除级联修复

| 文件 | 改动 |
|---|---|
| `backend/src/lib/storage.ts` | `deleteWorkspace` 事务中新增 `delete(files)`，退出事务后删除 `data/uploads/{workspaceId}` 目录 |
| `backend/src/db/init.ts` | `files` 表外键加 `ON DELETE CASCADE` |

**原因**：`files` 表外键没有级联删除，删除 workspace 时会因外键约束失败。
