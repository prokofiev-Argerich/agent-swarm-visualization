# WoW-Agent: 从 Swarm-IDE 到多 Agent 工作流操作系统

## Context

Swarm-IDE 是一个基于 IM（即时通讯）范式的多 Agent 协作平台。它的核心哲学是：Agent 像微信联系人一样存在，人类可以任意介入任意层级的 Agent 对话，Agent 可以动态创建 sub-agent，拓扑在运行时自演化。

用户希望在此基础上叠加一层"工作流语义"：
- 一个 Agent 等价于一个完整工作流
- 多个 Agent 等价于多个工作流
- 顶层 Agent 负责编排"工作流之间的工作流"
- 系统最一开始需要和用户多轮互动（Intake）
- 执行过程中不确定时需要询问用户

Swarm-IDE 的现有能力（动态创建 sub-agent、任意 agent 通信、人类介入、流式 graph 展示、MCP/Skill 扩展）恰好是这一改造的理想底座。

## 现有架构分析

### 数据库层（5 张表）
- `workspaces` — 顶层容器
- `agents` — Agent（含 human），有 `parentId` 支持嵌套
- `groups` — 聊天群组，P2P/多人群组
- `group_members` — 群组成员 + `lastReadMessageId`
- `messages` — 消息，`contentType` 支持扩展

### Agent Runtime
- `AgentRuntime` 单例管理所有 `AgentRunner`（`backend/src/runtime/agent-runtime.ts`）
- 每个 AgentRunner 有独立的事件循环：`loop()` → `processUntilIdle()` → `processGroupUnread()`
- LLM 流式调用支持 GLM 和 OpenRouter 两种 provider
- 工具调用循环：`runWithTools()`，最大 3 轮
- 内置工具：create, self, get_skill, list_agents, send, send_group_message, bash 等
- MCP 外部工具扩展（`backend/src/runtime/mcp.ts`）

### 通信系统
- `AgentEventBus`（per-agent，内存事件总线，Redis 持久化）
- `WorkspaceUIBus`（per-workspace，UI 事件总线，Redis 持久化）
- SSE 双通道：`/api/agents/[id]/context-stream` + `/api/ui-stream`

### 前端
- Next.js 16 + React 19 + Tailwind 4 + Framer Motion
- `app/im/page.tsx`（~2190 行）核心 IM 界面：左侧 agent 树 + 中间聊天 + 右侧详情面板
- Agent 可视化图：draggable nodes + animated beams + status rings

### 扩展点
- Skills：SKILL.md 文件自动注入 agent system prompt（`backend/src/runtime/skill-loader.ts`）
- MCP：外部工具通过 `mcp.json` 配置

## 改造目标

在 Swarm-IDE 之上叠加 **Workflow Runtime** 层，实现：

1. **Intake 模式**：项目一开始进入多轮访谈，不直接执行
2. **Blueprint 审批**：工作流蓝图必须经用户确认后才实例化
3. **运行时暂停**：Agent 遇到不确定时发结构化 DecisionRequest，不是长篇解释
4. **Artifact 校验**：每个重要输出必须经过 Verifier Agent 检查
5. **模板沉淀**：执行完生成可复用模板

## 具体改造计划

### Phase A：数据库层（新增 6 张表）

**文件：** `backend/src/db/schema.ts`

```typescript
// 工作流定义
export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  goal: text("goal").notNull(),
  blueprint: text("blueprint").notNull(), // JSON string: WorkflowSpec
  status: text("status").notNull().default("draft"), // draft | approved | running | blocked | done | failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

// 工作流执行实例
export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").primaryKey(),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
  status: text("status").notNull().default("running"), // running | blocked | done | failed
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// 产出物
export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey(),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
  runId: uuid("run_id").references(() => workflowRuns.id),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  type: text("type").notNull(), // plan | draft | code | report | decision
  content: text("content").notNull(),
  status: text("status").notNull().default("draft"), // draft | verified | rejected
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// 决策请求（Human Gate）
export const decisionRequests = pgTable("decision_requests", {
  id: uuid("id").primaryKey(),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
  runId: uuid("run_id").references(() => workflowRuns.id),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  question: text("question").notNull(),
  options: text("options").array(),
  recommendation: text("recommendation"),
  risk: text("risk").notNull().default("low"), // low | medium | high
  blocking: boolean("blocking").notNull().default(true),
  status: text("status").notNull().default("pending"), // pending | answered | dismissed
  answer: text("answer"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// 假设日志
export const assumptionLogs = pgTable("assumption_logs", {
  id: uuid("id").primaryKey(),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
  runId: uuid("run_id").references(() => workflowRuns.id),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  assumption: text("assumption").notNull(),
  reason: text("reason").notNull(),
  risk: text("risk").notNull().default("low"),
  reversible: boolean("reversible").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// 工作流模板
export const workflowTemplates = pgTable("workflow_templates", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  blueprint: text("blueprint").notNull(), // JSON: WorkflowSpec
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
```

**同步修改：** `backend/src/db/init.ts` 新增 `CREATE TABLE IF NOT EXISTS` 语句。

### Phase B：Workflow Runtime（后端核心）

**文件：** `backend/src/runtime/workflow-runtime.ts`（新建）

#### B1. WorkflowSpec 类型定义

```typescript
type WorkflowSpec = {
  name: string;
  goal: string;
  agents: AgentSpec[];
  edges: [string, string][]; // [fromAgentName, toAgentName]
  humanGates: HumanGateSpec[];
  successCriteria: string[];
};

type AgentSpec = {
  name: string;
  role: string;
  systemPrompt: string;
  inputs: string[];
  outputs: string[];
  tools: string[];
  askUserWhen: string[];
  canCreateAgents: boolean;
};

type HumanGateSpec = {
  before: string; // step/agent name
  reason: string;
};
```

#### B2. WorkflowRuntime 类

在 `AgentRuntime` 之上的一层编排器：

```typescript
export class WorkflowRuntime {
  private agentRuntime = getAgentRuntime();

  // 从 WorkflowSpec 实例化：创建所有 agent，建立通信拓扑
  async instantiateWorkflow(spec: WorkflowSpec, workspaceId: UUID): Promise<UUID> {
    // 1. 创建 workflow 记录（status: draft）
    // 2. 为每个 AgentSpec 创建 agent（role = spec.name）
    // 3. 为每条 edge 创建群组（让相关 agent 可以在群里协作）
    // 4. 创建 MetaOrchestratorAgent（role = "orchestrator"）
    // 5. orchestrator 发送初始任务给第一个 agent
    return workflowId;
  }

  // 用户批准蓝图后启动
  async approveAndStart(workflowId: UUID): Promise<void> {
    // 更新 workflow status = running
    // 唤醒 orchestrator agent
  }

  // 处理 DecisionRequest：Agent 发特殊消息触发
  async handleDecisionRequest(req: DecisionRequest): Promise<void> {
    // 存入 decision_requests 表
    // 通过 UI bus 发送事件，前端展示确认卡片
    // 如果是 blocking，暂停相关 agent 的处理循环
  }

  // 用户回复决策
  async answerDecision(decisionId: UUID, answer: string): Promise<void> {
    // 更新 decision_requests
    // 将答案作为消息发送回请求 agent
    // 唤醒 agent 继续处理
  }

  // 处理 Artifact 提交
  async handleArtifact(artifact: ArtifactInput): Promise<void> {
    // 存入 artifacts 表
    // 触发 Verifier Agent（如果配置了）
  }
}
```

#### B3. Agent 角色系统 prompt 模板

利用现有 Skill 系统（`backend/src/runtime/skill-loader.ts`），为特殊角色提供系统 prompt：

**IntakeAgent Skill：** `skills/intake-agent/SKILL.md`
- 职责：多轮访谈，收集需求
- 输出格式：ProjectBrief JSON
- 规则：不允许直接执行，只许提问

**WorkflowArchitectAgent Skill：** `skills/workflow-architect/SKILL.md`
- 职责：将 ProjectBrief 转成 WorkflowSpec
- 输出格式：WorkflowSpec JSON
- 规则：不直接执行，只输出设计

**MetaOrchestratorAgent Skill：** `skills/meta-orchestrator/SKILL.md`
- 职责：编排工作流执行
- 能力：list_agents, send, create, self
- 规则：监控状态，路由任务，处理阻塞

**VerifierAgent Skill：** `skills/verifier/SKILL.md`
- 职责：检查 artifact 质量
- 输出格式：{ passed, issues[], next_action }

### Phase C：Human Gate 协议（运行时暂停机制）

**核心设计：** Agent 遇到不确定时，不发普通消息，而是发 `contentType = "decision_request"` 的结构化消息。

**文件：** `backend/src/runtime/agent-runtime.ts`（修改）

在 `processGroupUnread()` 中，当 agent 处理消息时，如果检测到消息中包含 `DECISION_REQUEST` 标记（或通过 tool call 发出），触发 `WorkflowRuntime.handleDecisionRequest()`。

**决策消息格式：**

```json
{
  "type": "decision_request",
  "question": "目标用户是谁？",
  "options": ["开发者", "创业者", "企业管理者"],
  "recommendation": "开发者",
  "risk": "medium",
  "blocking": true
}
```

**Agent 系统 prompt 中增加规则：**

```
当你遇到以下情况时，必须发出 decision_request：
1. 关键输入缺失
2. 多个合理方案无法自动排序
3. 会产生外部影响（花钱、发消息、发布内容）
4. 风险等级高
5. 验收标准不明确

其他情况可以自动假设，但必须记录 assumption。
```

### Phase D：API 层新增

**新增路由文件：**

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/workflows` | GET/POST | 列/创建工作流 |
| `/api/workflows/[id]` | GET/PATCH | 获取/更新工作流 |
| `/api/workflows/[id]/approve` | POST | 用户批准蓝图 |
| `/api/workflows/[id]/runs` | GET/POST | 列/启动执行实例 |
| `/api/decisions` | GET | 列决策请求 |
| `/api/decisions/[id]/answer` | POST | 用户回复决策 |
| `/api/artifacts` | GET/POST | 列/提交产出物 |
| `/api/artifacts/[id]/verify` | POST | 校验产出物 |
| `/api/templates` | GET/POST | 列/创建工作流模板 |

### Phase E：前端改造

**文件：** `backend/app/im/page.tsx`（修改）

#### E1. 左侧边栏增加 Workflow Tree

在现有 agent 树旁边增加 workflow 树：

```
[Workspace]
├─ Workflows
│  ├─ workflow-1 [draft]
│  │  ├─ IntakeAgent
│  │  ├─ ArchitectAgent
│  │  └─ (Blueprint 待审批)
│  └─ workflow-2 [running]
│     ├─ ResearchAgent [BUSY]
│     ├─ WriterAgent [IDLE]
│     └─ VerifierAgent [IDLE]
└─ Agents (原有)
```

#### E2. 新增 Decision Request 卡片

当收到 `ui.decision_request.created` 事件时，在聊天区域上方显示卡片：

```
┌─────────────────────────────────────┐
│ ⚠️ 需要确认                          │
│                                     │
│ 目标用户是谁？                        │
│                                     │
│ ○ 开发者   ○ 创业者   ○ 企业管理者    │
│                                     │
│ 💡 建议：开发者                       │
│                                     │
│ [确认] [修改] [跳过]                 │
└─────────────────────────────────────┘
```

#### E3. Blueprint 审批界面

当 workflow 状态为 `draft` 时，中间面板显示 Blueprint 审批界面：

- 展示 WorkflowSpec JSON（格式化渲染）
- Agent 列表、edges、human gates
- [批准并启动] [编辑] [拒绝] 按钮

#### E4. Artifact 面板

右侧详情面板增加 Artifact 标签页：
- 列出当前 workflow 的所有 artifact
- 显示类型、状态、内容预览
- Verifier 结果（通过/问题列表）

### Phase F：改造现有 AgentRuntime 的兼容点

**最小侵入原则：** 不改现有 AgentRuntime 的核心逻辑，只新增 hook 点。

**F1. 在 `AgentRunner` 中增加 Workflow 感知：**

```typescript
// 新增字段
private workflowId?: UUID;

// 在 processGroupUnread 中，如果检测到 decision_request 标记
// 调用 WorkflowRuntime.handleDecisionRequest()
```

**F2. 在 `executeToolCall` 中增加 Artifact 拦截：**

当 agent 调用 `send_group_message` 发送 `contentType = "artifact"` 的消息时，解析并存入 `artifacts` 表。

**F3. 利用现有 `create` tool：**

Workflow 实例化时直接调用现有的 `create` tool，复用 sub-agent 创建逻辑。

## MVP 路线图

### MVP 1：访谈生成工作流（2-3 周）

**目标：** 模糊需求 → 结构化工作流蓝图

**工作：**
1. 新增数据库表：workflows, workflow_templates
2. 创建 IntakeAgent Skill + WorkflowArchitectAgent Skill
3. 新增 API：`POST /api/workflows`（创建时自动启动 IntakeAgent）
4. 前端：左侧 Workflow Tree + Blueprint 审批界面
5. Workspace 创建时不再自动创建 assistant agent，而是让用户选择"启动新项目"

**验证：**
- 用户说"我要做一个内容生产工作流"
- IntakeAgent 问 3-5 轮问题
- WorkflowArchitectAgent 输出 Blueprint JSON
- 用户在前端看到 Blueprint 并可以批准

### MVP 2：工作流实例化为 Agent 蜂群（2 周）

**目标：** 批准的 Blueprint 自动创建 Agent 并执行

**工作：**
1. 实现 `WorkflowRuntime.instantiateWorkflow()`
2. 为每个 AgentSpec 自动 create agent（复用现有 create tool）
3. 自动创建群组建立通信拓扑
4. 创建 MetaOrchestratorAgent 并发送初始任务
5. 前端：实时显示 workflow 中 agent 状态

**验证：**
- 用户批准 Blueprint
- 系统自动创建 3-5 个 agent
- Agent 开始协作执行任务
- 前端 graph 显示 workflow 内 agent 关系

### MVP 3：不确定性询问（2 周）

**目标：** 执行中能暂停问用户

**工作：**
1. 新增数据库表：decision_requests, assumption_logs
2. 在 Agent system prompt 中增加 decision_request 规则
3. 实现 `WorkflowRuntime.handleDecisionRequest()`
4. 前端：Decision Request 卡片 UI
5. 实现 `POST /api/decisions/[id]/answer`

**验证：**
- Agent 遇到不确定时发送 decision_request
- 前端显示确认卡片
- 用户回复后 Agent 继续执行
- 假设自动记录到 assumption_logs

### MVP 4：多工作流编排（2-3 周）

**目标：** 多个工作流由 MetaOrchestrator 协同

**工作：**
1. 增强 MetaOrchestratorAgent Skill：支持跨 workflow 路由
2. Workflow 间依赖关系：`dependsOn: string[]`
3. 跨 workflow 消息路由
4. 前端：多 workflow 视图切换

**验证：**
- 用户同时启动"内容生产"和"竞品分析"两个 workflow
- MetaOrchestrator 协调它们之间的数据传递
- 一个 workflow 的输出成为另一个的输入

### MVP 5：模板化（2 周）

**目标：** 从一次性执行变成可复用系统

**工作：**
1. 新增 API：`POST /api/templates`（从 workflow 沉淀模板）
2. 模板库 UI
3. 从模板快速创建 workflow
4. 评估标准（Evaluation Rubric）

**验证：**
- 执行完的 workflow 可以"保存为模板"
- 用户可以从模板库一键创建新 workflow
- 模板有使用次数统计

## 关键文件清单

### 新建文件
| 文件 | 用途 |
|------|------|
| `backend/src/runtime/workflow-runtime.ts` | Workflow Runtime 核心 |
| `backend/src/runtime/workflow-store.ts` | Workflow 数据库操作 |
| `skills/intake-agent/SKILL.md` | IntakeAgent 系统 prompt |
| `skills/workflow-architect/SKILL.md` | WorkflowArchitectAgent 系统 prompt |
| `skills/meta-orchestrator/SKILL.md` | MetaOrchestratorAgent 系统 prompt |
| `skills/verifier/SKILL.md` | VerifierAgent 系统 prompt |
| `backend/app/api/workflows/route.ts` | 工作流 API |
| `backend/app/api/decisions/route.ts` | 决策 API |
| `backend/app/api/artifacts/route.ts` | 产出物 API |
| `backend/app/api/templates/route.ts` | 模板 API |

### 修改文件
| 文件 | 修改内容 |
|------|----------|
| `backend/src/db/schema.ts` | 新增 6 张表 |
| `backend/src/db/init.ts` | 新增 CREATE TABLE 语句 |
| `backend/src/lib/storage.ts` | 新增 workflow 相关操作方法 |
| `backend/src/runtime/agent-runtime.ts` | 增加 Workflow 感知 hook |
| `backend/app/im/page.tsx` | 新增 Workflow Tree、Decision Card、Blueprint 审批 |

## 验证方案

### 端到端测试流程

1. **启动服务：** `docker compose up -d` + `npm run dev`
2. **初始化数据库：** `curl -X POST http://localhost:3017/api/admin/init-db`
3. **创建 Workspace：** `POST /api/workspaces` → 得到 workspaceId
4. **创建工作流：** `POST /api/workflows` → 自动启动 IntakeAgent
5. **Intake 访谈：** 在 IM 界面和 IntakeAgent 对话 3-5 轮
6. **生成 Blueprint：** IntakeAgent 调用 ArchitectAgent，输出 WorkflowSpec
7. **审批 Blueprint：** 前端显示 Blueprint，用户点击"批准"
8. **实例化 Agent：** 系统自动创建 workflow 内所有 agent
9. **执行工作流：** Agent 开始协作，前端 graph 实时显示
10. **遇到不确定：** Agent 发 decision_request，前端显示卡片
11. **用户确认：** 用户选择/输入答案，Agent 继续
12. **输出 Artifact：** Agent 提交产出物，Verifier 检查
13. **保存模板：** 执行完后保存为可复用模板

### 关键检查点

- [ ] 数据库新增表创建成功
- [ ] IntakeAgent 能进行多轮访谈
- [ ] Blueprint JSON 格式正确
- [ ] 用户批准后才实例化 agent
- [ ] DecisionRequest 正确暂停 agent 执行
- [ ] 用户回复后 agent 继续
- [ ] Artifact 存入数据库
- [ ] 模板可以复用
