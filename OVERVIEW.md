# Swarm-IDE 项目概览

> 这份文档是**设计意图与权衡的叙事说明**,补充 `ARCHITECTURE.md` 的参考性内容。
> 适合首次接触本仓库的读者快速理解「为什么这么做」而不是「具体怎么做」。

---

## 一、目的

**Swarm-IDE = 用 IM 范式(微信式聊天)做多 Agent 协作的可视化平台**。

| 别人怎么做 | 这里怎么做 |
|---|---|
| Kimi-Swarm / AutoGen / CrewAI:固定拓扑、预定义角色、控制台/日志为主 | **运行时动态**:任何 agent 可以创建任何 sub-agent,**人类可随时介入任意层级的对话** |
| LangGraph:DAG 图,节点 + 边的精确编排 | **没有 DAG**:只有"创建"和"发消息"两个原语,**拓扑在运行中自演化** |
| 大多数 agent 框架:对话临时、上下文 ad-hoc | **每条消息持久化、每个 agent 历史可回溯、SSE 实时流式可视化** |

### 核心哲学

引自 `README.md`:
- **极简原语** — 系统只依赖少量通信原语即可表达多 Agent 行为
- **液态拓扑** — 拓扑不预设、在运行中自演化
- **扁平协作** — 人类可以像聊天一样介入任意层级

一句话:**"很多个人,每个人能生孩子、能和任何人说话"** —— 这两件事就够构造任意结构。

---

## 二、架构(分层)

```
┌──────────────────────────────────────────────────────┐
│  Frontend  (React 19 + SSE)                          │
│  ├─ /im   微信式聊天 + Agent Tree + Graph 可视化     │
│  └─ /graph  纯拓扑视图                                │
├──────────────────────────────────────────────────────┤
│  API Routes  (Next.js Route Handlers)                │
│  ├─ flat:  /api/workspace-defaults / group-messages  │
│  └─ nested: /api/workspaces/[id]/defaults …(兼容)  │
├──────────────────────────────────────────────────────┤
│  Storage  (Drizzle ORM + postgres.js)                │
│  └─ store{}:按领域拆分 workspaces/agents/groups/…   │
├──────────────────────────────────────────────────────┤
│  Runtime  (in-process Node 单例)                     │
│  ├─ AgentRuntime  全局单例,管理所有 Runner          │
│  ├─ AgentRunner   per-agent 独立事件循环            │
│  ├─ AgentEventBus per-agent 内部事件(stream/done) │
│  ├─ WorkspaceUIBus per-workspace UI 推送            │
│  ├─ SkillLoader   YAML frontmatter 技能注入         │
│  └─ MCP Registry  外部 MCP 工具                     │
└──────────────────────────────────────────────────────┘
```

### 两个 EventBus(关键设计)

不是一个全局总线,**是两套独立的**:

- `AgentEventBus`(per-agent)— Agent 内部状态流转(`agent.wakeup` / `agent.stream` / `agent.done`),订阅者:Agent 详情面板的 SSE
- `WorkspaceUIBus`(per-workspace)— 全局 UI 状态(`ui.agent.created` / `ui.message.created` / `ui.agent.tool_call.start`),订阅者:整个 workspace 的左侧栏 + 拓扑图

**为什么拆**:Agent 内部流可以很高频(token-by-token),前端只需要订阅自己关心的那个 agent;UI 总线只发结构变化,不发 stream chunk。两者频率差一个数量级,合并会让前端被淹。

### 6 张表(数据模型)

```
workspaces ── agents (parent_id 支持嵌套)
   │
   ├── groups ── group_members (含 last_read_message_id 已读游标)
   │
   ├── messages (group_id + sender_id,IM 协议)
   │
   └── files (上传 .md/.txt/.json/.csv,fileId 驱动)
```

外键全部 → workspaces,删除 workspace 触发级联(files 表 CASCADE,其余手动级联)。

---

## 三、实施方式

### 1. AgentRunner 独立事件循环

每个非 human Agent 起一个 AgentRunner,各自跑:
```
loop():
  await wake.promise          // 等被叫醒
  processUntilIdle():
    listUnreadByGroup()       // 轮询未读
    for each batch:
      构建 history
      markRead
      runWithTools(history)   // LLM + 工具循环,最多 3 轮
```
唤醒方式三种:`group_message` / `direct_message` / `manual`。Agent **不是**被 HTTP 请求驱动的,是被消息事件驱动的 —— 这是 IM 范式的核心。

### 2. 11 个内置工具,只有 2 个真原语

```
真原语:create + send_group_message/send_direct_message
辅助:  self / list_agents / list_groups / list_group_members /
       create_group / read_file / bash / get_skill / get_group_messages
```
README 说"只需 create + send",**字面意义上是真的** —— 所有复杂协作(分工、汇总、子任务派生)都是这两个原语组合而成。

### 3. SSE 双通道 + Flat Route Facade

```
浏览器
  ├─ EventSource('/api/agent-context-stream?agentId=X')  ← per-agent 流
  └─ EventSource('/api/ui-stream?workspaceId=W')         ← workspace 全局事件
```
Flat route 是为了**绕过 Next.js 16 + Turbopack 的嵌套动态路由 dev-mode bug**,nested route 保留作为 production 别名。前端走 `apiPaths` 集中管理,所以以后哪边坏了切换无痛。

### 4. Skill 系统(可热插拔的角色注入)

```
skills/{name}/SKILL.md  (YAML frontmatter: auto-load / allowed-tools)
       ↓
auto-load: true → 自动注入所有 agent 的 system prompt
auto-load: false → 通过 get_skill 工具按需加载完整内容
```
这是给 agent **加技能**的扩展点,不需要改代码。

### 5. MCP 外部工具

通过 `mcp.json` 配置外部 MCP server(stdio/http/sse),工具定义动态注入到 Agent 的工具列表中。意味着 Agent 能用任何 MCP 兼容服务(GitHub API、文件系统、自定义工具…)。

### 6. 持久化策略

- **Postgres**:`agents.llm_history`(JSON 字符串)持久化所有 LLM 对话历史。重启后 agent 完整复活,继续唤醒-处理循环。
- **Redis/Upstash(可选)**:两个 EventBus 都支持持久化层,跨进程订阅 + 历史重放(`getSince` 按事件 id)。单机模式可以不用。
- **磁盘**:上传文件存 `data/uploads/{workspaceId}/{fileId}`,文件名不暴露。

### 7. API facade 模式 + smoke test

抽 handler 到 `src/server/handlers/*`,flat + nested 两条路由共享同一段实现。`scripts/smoke-api.mjs` ping 所有 endpoint,区分 **Next.js HTML 404(路由没注册)** vs **handler JSON 404(资源不存在)**,前者 fail 后者 pass。

---

## 四、技术栈

| 层 | 选型 | 原因 |
|---|---|---|
| 前端框架 | Next.js 16 + React 19 + Tailwind 4 | App Router、Server Components、SSE 原生支持 |
| 前端动效 | Framer Motion + Streamdown | 拓扑图拖拽动画 + Markdown 流式渲染 |
| 后端 runtime | Next.js API Routes(Node.js) | 单仓一站式,前后端共享类型 |
| 数据库 | PostgreSQL 17 + Drizzle ORM 0.45 | 类型安全 + `0000_init.sql` migration |
| DB 驱动 | `postgres` (postgres-js) | drizzle 官方推荐 |
| 实时层 | Redis 7 / Upstash(可选) | 跨进程订阅,单机也能跑 |
| LLM | OpenRouter(默认 Kimi 2.5) / GLM(智谱) | 自家 StreamAssembler 统一两家 SSE 格式 |
| 工具协议 | MCP(Model Context Protocol) | Anthropic 标准,任何 MCP server 都能接 |
| 校验 | Zod 4(部分) | files API 已用,推广中 |
| 容器化 | docker-compose(Postgres + Redis) | 一行起本地环境 |
| 包管理 | bun(README 提到)/ npm(实际 scripts) | 跑 dev / lint / smoke test |
| ESLint | v9 flat config + `eslint-config-next/core-web-vitals` | 刚加,有 pre-existing lint 待清,见 WORK_LOG 阶段 6 |

---

## 五、几个非典型设计选择(以及代价)

1. **没有引入 LangChain/LangGraph/任何 agent 框架** — 直接拿原始 LLM API + 自己写 runtime。少了一层抽象,debug 时 stack trace 很干净;**代价**:stream parsing / tool loop / history mgmt 都自己写(`src/lib/llm/assembler.ts`)。

2. **AgentRuntime 是 `globalThis` 单例** — 不是依赖注入。Next.js dev hot-reload 时通过 `globalThis.__swarmIdeRuntime` 避免单例被多次实例化。务实但脆,改 runtime 代码需要重启 dev server。

3. **没用 WebSocket,坚持 SSE** — SSE 是 HTTP 单向流,**反向**消息(浏览器 → server)走普通 POST。简化了断线重连,**失去了双向**。对 IM 场景够用,对实时协作编辑不够。

4. **storage 按领域拆 7 个文件 → 用 spread 合并成一个 `store` 对象** — `store.listAgents()`、`store.sendMessage()` 这种调用形式保留了拆分前的便利。**代价**:命名冲突会被静默覆盖(workspaces 和 agents 都曾导出 `ensureWorkspaceDefaults`,靠 spread 顺序解决,易踩坑)。

5. **bash 工具直接 exec 系统命令,没有沙箱** — 限制在 `workspace root` 内,但 agent 可以 `cat ~/.ssh/id_rsa` 之类。开发期可接受,**生产部署绝对不能这么开**。

6. **递归无深度限制** — sub-agent 可以无限创建 sub-sub-agent。理论上指数爆炸,实际靠 LLM 自己不抽风。

---

## 六、一句话总结

**Swarm-IDE 押注"协作不需要预先建模"** —— 不画 DAG、不定流程、不约束角色,只提供「创建 agent」和「发消息」两个原语,把"协作结构应该长什么样"完全交给 LLM 在运行时自己回答,然后用 IM 界面让人类全程可见、可介入、可纠偏。

PRD 评审、代码审查、研究合作、教学辅导……都是这套底座上长出来的**领域应用**,而不是平台本身要做的事情。

---

## 七、相关文档

- `README.md` — 快速上手与运行方式
- `ARCHITECTURE.md` — 参考型文档(表名、字段、文件路径)
- `CODEBASE_REVIEW.md` — 长期债务清单 + 阶段 0-5 重构进度
- `WORK_LOG.md` — 时间线工作日志
