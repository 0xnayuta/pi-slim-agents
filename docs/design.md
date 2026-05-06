# 设计文档 — pi-slim-agents

## 设计理念

**pi-slim-agents** 为 pi-mono 带来轻量级的专家代理角色，灵感来自 [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) 中的多代理模式，但没有完整的编排框架。

### 核心原则

1. **Markdown 优先**：代理以带有 YAML frontmatter 的 `.md` 文件定义。创建或自定义代理无需 TypeScript。
2. **零运行时开销**：无后台进程、无调度、无复用。代理通过 `delegate_agent` 工具按需调用。
3. **基于提示词的委派（v1）**：委派提示词返回给主 LLM，由其采用专家角色完成任务。这种方式简单且有效。
4. **可扩展**：用户可以在项目级或用户级添加自定义代理，无需修改包。

## 架构

```
┌─────────────────────────────────────────────┐
│                pi-mono session               │
│                                             │
│  ┌────────────────────────────────────────┐  │
│  │         slim-agents extension          │  │
│  │                                        │  │
│  │  ┌──────────┐  ┌───────────────────┐   │  │
│  │  │ /agents   │  │ delegate_agent    │   │  │
│  │  │ command   │  │ tool              │   │  │
│  │  └──────────┘  └────────┬──────────┘   │  │
│  │                         │              │  │
│  │  ┌──────────────────────▼──────────┐   │  │
│  │  │        Agent Loader             │   │  │
│  │  │  project > user > package       │   │  │
│  │  └──────────────────────┬──────────┘   │  │
│  │                         │              │  │
│  │  ┌──────────────────────▼──────────┐   │  │
│  │  │        Runner (v1)              │   │  │
│  │  │  builds delegation prompt       │   │  │
│  │  └─────────────────────────────────┘   │  │
│  └────────────────────────────────────────┘  │
│                                             │
│  agents/orchestrator.md                     │
│  agents/explorer.md                         │
│  agents/librarian.md                        │
│  agents/oracle.md                           │
│  agents/designer.md                         │
│  agents/fixer.md                            │
└─────────────────────────────────────────────┘
```

## 代理加载优先级

代理从三个位置发现。对于同名代理，优先级最高的来源获胜：

1. **项目级** — `.pi/slim-agents/agents/*.md`（团队共享的自定义）
2. **用户级** — `~/.pi/agent/slim-agents/agents/*.md`（个人自定义）
3. **包内置** — `agents/*.md`（随 npm 包附带）

## 配置

配置从两个文件加载，合并时项目级覆盖用户级：

- `~/.pi/agent/slim-agents.json` — 用户级默认值
- `.pi/slim-agents.json` — 项目级覆盖

```json
{
  "agents": {
    "oracle": {
      "temperature": 0.3,
      "appendPrompt": "Focus on security concerns."
    },
    "fixer": {
      "disabled": true
    }
  },
  "disabled": ["council"],
  "extraAgentDirs": ["./custom-agents"]
}
```

## 委派模型

### v1：基于提示词的委派

当 `delegate_agent` 被调用时：
1. 运行器加载目标代理的提示词
2. 构建包含任务、上下文和文件的结构化委派提示词
3. 将提示词作为工具结果返回
4. 主 LLM 读取结果并采用专家角色

这种方式简单，在 pi 扩展 API 内运作良好，并且因为主 LLM 本身已经具备能力，所以能产生良好结果。

### v2（计划中）：子会话委派（Child Session Delegation）

当 pi-mono 暴露子会话 / 提供商调用 API 时：
1. 运行器使用专家的系统提示词创建独立的模型调用
2. 专家在自己的上下文中运行，不会污染主会话
3. 结果流式返回并整合

## 与 oh-my-opencode-slim 的关系

pi-slim-agents **受** oh-my-opencode-slim **启发**但**不复制**。主要区别：

| 方面 | oh-my-opencode-slim | pi-slim-agents |
|------|-------------------|----------------|
| 平台 | OpenCode 插件 | pi-mono 扩展 |
| 代理定义 | TypeScript 定义 | Markdown + frontmatter |
| 运行时 | 完整编排（调度器、委员会、复用器） | 最小化基于提示词的委派 |
| 自定义代理 | 基于配置覆盖 | 基于文件（项目/用户/包） |
| 依赖 | OpenCode SDK | 仅 pi-coding-agent |

## JSON 输出与机器可读格式（M10）

所有显示数据的命令都支持 `--format json`，提供脚本化的、机器可读的输出。JSON 输出：

- 始终是有效的 JSON（任何 JSON 库均可解析）
- 不包含 Markdown 格式、ANSI 码或 API 密钥
- 不包含完整提示词正文或代理结果
- 使用 `schemaVersion` 实现前向兼容
- 全部使用 camelCase 字段名

### JSON Schema 设计

每个 JSON 输出包含顶层信封：

```json
{
  "schemaVersion": 1,
  "kind": "<kind>",
  ...
}
```

| kind | 描述 |
|------|------|
| `agents` | 应用过滤后的代理列表 |
| `templates` | 应用过滤后的模板列表 |
| `status` | 运行时状态报告 |
| `history` | 委派历史记录 |
| `metrics` | 委派指标摘要 |
| `validation` | 代理校验结果 |
| `agentResult` | /agent 命令的委派结果（成功或错误） |
| `error` | 格式/正则校验错误响应 |

### schemaVersion 兼容性

如果 JSON schema 在未来版本中变更，`schemaVersion` 将递增。消费者应在解析前检查 `schemaVersion`。

### JSON 输出中的隐私保护

- **无 API 密钥** — 提供商错误在包含前已清理
- **无完整提示词** — 代理 `body` 字段永远不包含在 JSON 中
- **无完整结果** — 提供商调用输出不包含在内
- **无完整任务/上下文** — 历史记录 JSON 仅包含 `taskSummary`（截断为 80 字符）

### 标签、别名与 JSON 输出

标签和别名以数组形式包含在 JSON 输出中。这些字段支持：

- **脚本过滤**：`jq '.items[] | select(.tags | contains("security"))'`
- **外部工具**：从 `/agents metrics --format json` 构建仪表盘
- **CI 集成**：通过 `/agents validate --format json` 校验代理文件

### 正则搜索设计

`--regex` 为高级用户提供进阶的模式匹配。它与其他过滤条件**进行 AND 组合**：

```text
/agents --regex "^cpp"               # 匹配 name、description、aliases、tags
/agents --tag review --regex "oracle" # 必须有 'review' 标签且匹配 'oracle'
/agents templates --regex "writer|reviewer"
```

正则默认**不区分大小写**（`i` 标志）以简化使用。锚点（`^`、`$`）应用于完整可搜索字符串，而非单个字段。

**建议**：简单搜索优先使用 `--query`（纯文本，不区分大小写）。将 `--regex` 保留给复杂模式。

### 标签自动补全设计预留（未来）

标签自动补全在本次版本中**未实现**。需要 pi-mono 命令补全 API 支持。设计预留：

**候选项**将来自：
- 代理名称（来自已加载的代理）
- 代理别名（来自已加载的代理）
- 标签（从所有代理/模板聚合）
- 模板名称

**实现方式**（未来）：
1. 从 `loadAgents()` + `loadTemplates()` 聚合所有唯一标签
2. 通过 pi-mono API 注册补全提供者
3. 在 `--tag<Tab>` 时返回匹配的标签

这**不在 M10 范围内**。

### Token 用量追踪设计预留（未来）

实际的 Token 用量追踪需要可用的提供商调用集成。设计预留：

```json
"tokenUsage": {
  "available": false,
  "reason": "provider-call usage data unavailable"
}
```

当提供商调用可工作时，`tokenUsage` 将从 pi-ai 响应元数据中填充。在没有真实集成的情况下，保持 `available: false`。

**不在范围内**：分词器依赖、估计 Token 数、成本追踪。

### 格式化层架构

格式化器层（`src/format.ts`）将数据生成与展示分离：

```
Command Handler
    │
    ├─ parseFlags(args) → flags{}
    ├─ parseFormatOption(flags) → 'text' | 'json'
    ├─ parseRegexOption(flags) → RegExp | null
    │
    ├─ Load data (loadAgents, historyStore, etc.)
    │
    ├─ filterAgents / filterTemplates (with regex)
    │
    └─ Format:
           formatAgentsJson() → JSON string
           formatTemplatesJson() → JSON string
           formatStatusJson() → JSON string
           formatHistoryJson() → JSON string
           formatMetricsJson() → JSON string
           formatValidationJson() → JSON string
           ...
           OR
           formatAgentList() → text string  (existing)
           formatTemplatesList() → text string
           ...
```

这种分离确保：
1. JSON 格式化器不会产生 Markdown
2. 文本格式化器保持不变
3. 可以添加新的输出格式而不触及业务逻辑
4. 每个格式化器都可以独立测试

## M11：代理结果 JSON / 元数据 / JSON 完善

### agentResult JSON kind

`/agent --format json` 返回新的 `kind: agentResult` JSON 响应：

```json
{
  "schemaVersion": 1,
  "kind": "agentResult",
  "requestedAgent": "arch",
  "resolvedAgent": "oracle",
  "aliasUsed": true,
  "mode": "deep",
  "runnerMode": "prompt-only",
  "status": "success",
  "durationMs": 123,
  "historyId": 12,
  "replayOf": null,
  "providerCall": {
    "available": false,
    "fallback": false,
    "reason": "Provider-call not available in this environment"
  },
  "task": { "summary": "arch" },
  "output": { "text": "...", "format": "text" }
}
```

**设计决策：**
- 包含 `historyId` 和 `replayOf` 以便脚本将委派结果与历史记录关联
- `providerCall.reason` 描述提供商调用不可用或回退的原因
- `output.format` 区分提示词-only（`text`）和提供商调用（`provider-call`）
- 错误响应使用 `error.code`（如 `UNKNOWN_AGENT`、`AGENT_DISABLED`、`INVALID_MODE`）
- `UNKNOWN_AGENT` 错误中包含 `availableAgents` 以方便脚本使用

### error JSON kind

格式/正则失败返回 `kind: error`：

```json
{
  "schemaVersion": 1,
  "kind": "error",
  "error": {
    "code": "INVALID_REGEX",
    "message": "Invalid regex pattern ...",
    "details": { "pattern": "[" }
  }
}
```

### 过滤器序列化（未设置时为 null）

所有过滤器对象对未设置的字段使用 `null`，而非 `undefined`：

```json
{
  "tags": null,
  "query": null,
  "readonly": true,
  "writable": null,
  "enabled": null,
  "disabled": null,
  "source": "builtin",
  "regex": "review|cpp"
}
```

这使得脚本可以安全地检查 `if (filters.tags !== null)` 而不会有类型混淆。

### 元数据收集

文件级元数据在加载时通过 `fs.statSync` 收集：

```typescript
interface FileMetadata {
  sourcePath: string;    // 安全显示路径（相对或缩写，绝非绝对用户路径）
  sourcePathKind: 'builtin' | 'project' | 'user' | 'external' | 'unknown';
  createdAt: string | null;  // ISO 8601（在 Windows/较旧文件系统上可能为 null）
  lastModified: string | null;  // ISO 8601
  sizeBytes: number | null;  // 字节
}
```

**隐私优先设计**：`sourcePath` 始终是安全的显示路径：
- `builtin`：相对于包根目录（如 `agents/oracle.md`）
- `project`：相对于项目 cwd（如 `.pi/slim-agents/agents/foo.md`）
- `user`：家目录缩写（如 `~/.pi/agent/...`）
- `external`：仅文件名（如 `foo.md`）
- `unknown`：无法确定路径来源（回退）

**非致命设计**：stat 失败时记录警告并返回 null 元数据字段。扩展绝不会因元数据收集而崩溃 — 代理/模板仍然正常加载。

**birthtime 注意事项**：`createdAt` 使用 `fs.statSync().birthtime`。在 Windows 和某些文件系统上，`birthtime` 可能等于最近创建文件的 `mtime`，或者可能早于 2000 年（纪元回退）。收集器会过滤掉 2000 年 1 月 1 日之前的日期作为无效日期。

### API 密钥清理

`formatAgentResultJson` 在序列化前通过 `sanitizeJsonText()` 处理输出：
- `apiKey=sk-...` → `apiKey=[redacted]`
- `sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` → `[API_KEY_REDACTED]`
- `Bearer <token>` → `Bearer [TOKEN_REDACTED]`

这防止了即使委派提示词或结果包含类密钥字符串，API 密钥也不会意外泄露到 JSON 输出中。
