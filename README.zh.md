# pi-slim-agents

**[English](README.md)** | 中文

为 [pi-mono](https://github.com/mariozechner/pi-coding-agent) 打造的轻量级专家代理，无需重量级子代理编排。

## 状态

**v0.1.0 — 已具备发布就绪状态**

这是 pi-slim-agents 的首个版本。核心委派系统已具备功能并可投入使用。npm 发布尚在等待中 — 包已为发布做好准备。

| 功能 | 状态 |
|------|------|
| 提示词-only 委派（prompt-only delegation） | ✅ 稳定（默认） |
| 提供商调用运行器（provider-call runner） | ⚠️ 仅架构设计（回退为提示词-only） |
| 内置代理（built-in agents） | ✅ 6 个代理就绪 |
| `/agent` 快捷命令 | ✅ 支持 |
| 模板（templates） | ✅ 7 个模板可用 |
| JSON 输出 | ✅ 所有命令 |
| 历史记录 / 指标（history / metrics） | ✅ 支持 |
| 重放（replay） | ✅ 支持 |
| 标签 / 搜索 / 过滤（tags / search / filter） | ✅ 支持 |

### 这不是什么

pi-slim-agents 不是：
- 完整的子代理框架
- tmux 面板运行器
- 工作树管理器
- 调度器
- 委员会/投票系统
- 自主代理执行器
- 执行工具的子代理运行器（在提示词-only 模式下）

它是一个轻量级的专家委派层，帮助主代理调用聚焦的角色提示词。默认的 `/agent` 命令生成委派提示词，但不会执行工具或生成子代理。

## 功能特性

- **6 个内置专家代理**：explorer、librarian、oracle、fixer、designer、orchestrator
- **代理别名**：`search` → `explorer`、`arch` → `oracle` 等
- **标签和过滤**：`/agents --tag review --readonly`
- **7 个模板**：security-reviewer、test-writer、doc-generator、refactor-planner、bug-triager、release-checker、cpp-reviewer
- **`/agent` 快捷命令**：`/agent explorer find playback code`
- **`--mode` 标志**：quick、normal、deep
- **历史记录**：`/agents history --agent oracle --limit 20`
- **重放**：`/agents replay 5 --mode deep`
- **指标**：`/agents metrics`
- **JSON 输出**：所有命令支持 `--format json`
- **提示词评估示例**：`examples/prompt-evals/` 带静态检查器

## 安装

### 从 npm 安装（发布后）

```bash
pi install npm:@0xnayuta/pi-slim-agents
```

> **注意**：npm 发布尚在等待中。发布后，上述命令即可安装此包。

### 本地开发

```bash
pnpm install
pnpm build
pi install /path/to/pi-slim-agents
```

### 验证安装

```bash
/agents
```

应显示 6 个内置代理。

## 快速开始

### 列出代理

```text
/agents
```

### 委派任务

```text
/agent explorer find playback speed implementation
/agent oracle review this design
/agent fixer add null check to parseConfig
```

> **注意：** 在提示词-only 模式（默认）下，`/agent` 返回专家委派提示词 — 它不会执行工具或启动子代理。使用生成的提示词引导主代理，或让主代理直接使用 grep/read/bash 执行搜索。

### 使用模式

```text
/agent --mode deep oracle review the architecture
/agent -m quick explorer find playback code
```

### 使用 JSON 输出

```text
/agent --format json oracle review this design
/agent --mode deep --format json arch review the architecture
```

### 使用模板

```text
/agents templates
/agents create security-reviewer security
/agents validate
/agents reload
```

### 查看历史记录和指标

```text
/agents history
/agents metrics
/agents replay 5
```

### JSON 输出

```text
/agents --format json
/agent --format json oracle review this design
/agents history --format json
```

## 内置代理

| 代理 | 角色 | 适用场景 | 只读 |
|------|------|----------|------|
| `explorer` | 代码库导航器 | 查找文件、定位代码模式 | 是 |
| `librarian` | 文档调研员 | 库文档、API 参考、最佳实践 | 是 |
| `oracle` | 战略顾问 | 架构审查、复杂调试、代码审查 | 是 |
| `fixer` | 实现专家 | 有界的代码变更、测试、Bug 修复 | 否 |
| `designer` | UI/UX 专家 | 样式、响应式设计、视觉打磨 | 否 |
| `orchestrator` | 任务协调器 | 分解和路由指导 | 否 |

### 代理别名

| 别名 | 解析为 |
|------|--------|
| `search`、`find`、`locate` | `explorer` |
| `docs`、`research`、`library` | `librarian` |
| `arch`、`review`、`judge` | `oracle` |
| `fix`、`implement`、`patch` | `fixer` |
| `ui`、`ux`、`design` | `designer` |
| `route`、`router` | `orchestrator` |

## 模板

模板是创建项目级代理的起点。它们**默认不启用**。

| 模板 | 适用场景 |
|------|----------|
| `security-reviewer` | 输入验证、认证、依赖风险 |
| `test-writer` | 测试计划、测试用例、覆盖率缺口 |
| `doc-generator` | README、API 文档、变更日志 |
| `refactor-planner` | 清理计划、现代化指导 |
| `bug-triager` | 缩小 Bug 来源范围 |
| `release-checker` | 版本升级、变更日志、试运行 |
| `cpp-reviewer` | 内存安全、CMake、clangd 诊断 |

### 使用模板

```text
/agents templates                                    # 列出所有模板
/agents create security-reviewer my-security         # 从模板创建
/agents validate                                    # 校验已创建的代理
/agents reload                                      # 激活新代理
```

## 配置

在项目根目录创建 `.pi/slim-agents.json`：

```json
{
  "runnerMode": "prompt-only",
  "outputTemplate": true,
  "agents": {
    "designer": {
      "enabled": true
    }
  }
}
```

### 配置选项

| 选项 | 默认值 | 描述 |
|------|--------|------|
| `runnerMode` | `"prompt-only"` | 委派模式 |
| `outputTemplate` | `true` | 使用结构化输出模板 |
| `agents.<name>.enabled` | `true` | 启用/禁用特定代理 |
| `agents.<name>.temperature` | `0.2` | 提供商调用的温度参数 |
| `history.persistent` | `false` | 将历史记录存储到 JSONL 文件 |
| `history.retention` | `200` | 最大历史记录条数 |

### 持久化历史记录

```json
{
  "history": {
    "persistent": true,
    "path": ".pi/slim-agents/history.jsonl",
    "retention": 200
  }
}
```

添加到 `.gitignore`：
```
.pi/slim-agents/history.jsonl
```

## JSON 输出

所有命令支持 `--format json`：

```text
/agents --format json
/agent --format json oracle review this design
/agents status --format json
/agents history --format json
/agents metrics --format json
/agents templates --format json
/agents validate --format json
```

### JSON 信封

```json
{
  "schemaVersion": 1,
  "kind": "agents",
  "filters": {},
  "count": 6,
  "items": [...]
}
```

### 示例：委派结果

```json
{
  "schemaVersion": 1,
  "kind": "agentResult",
  "requestedAgent": "oracle",
  "resolvedAgent": "oracle",
  "aliasUsed": false,
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
  "task": {
    "summary": "review this design"
  },
  "output": {
    "text": "Delegated to @oracle...",
    "format": "text"
  }
}
```

### 隐私保护

JSON 输出中不包含 API 密钥、完整提示词、完整任务文本。

## 历史记录和重放

```text
/agents history                              # 最近的委派
/agents history --agent oracle              # 按代理过滤
/agents history --status error              # 按状态过滤
/agents history --limit 20                  # 更多结果
/agents history --query playback            # 搜索

/agents replay 5                             # 重放委派
/agents replay 5 --mode deep                 # 以更深分析重放
/agents replay 5 --agent oracle              # 用不同代理重放
/agents replay 5 --files src/a.ts,src/b.ts   # 用逗号分隔的文件列表重放

/agents export-history                       # 导出为 JSON
/agents metrics                              # 委派统计
```

## 提示词评估示例

所有内置代理和模板的轻量评估用例位于 `examples/prompt-evals/`。

### 运行静态检查

```bash
pnpm test:prompts
```

检查内容：
- 所有评估文件存在
- 每个代理有 3+ 个评估用例
- 必需字段已填写
- 代理提示词有边界约束

详情参见 [examples/prompt-evals/README.md](examples/prompt-evals/README.md)。

## 开发

```bash
# 安装依赖
pnpm install

# 类型检查
pnpm typecheck

# 构建
pnpm build

# 运行所有测试
pnpm test

# 仅运行代理测试
pnpm test:agents

# 仅运行提示词评估检查
pnpm test:prompts

# 检查包内容
pnpm check:package

# 试运行打包
pnpm pack:dry

# 完整发布检查
pnpm release:check
```

## 当前限制

### ⚠️ 提示词-only 是稳定的默认模式

**在提示词-only 模式（默认）下，`/agent` 和 `delegate_agent` 仅返回结构化的委派提示词。它们不会：**
- 执行 grep、read、bash 或任何其他工具
- 启动后台子代理
- 自动执行搜索
- 返回提示词后继续运行

这意味着 `/agent explorer find playback code` 返回的是 explorer 代理的专家提示词 — 它实际上不会搜索代码库。要执行真正的搜索，请让主 pi 会话使用生成的提示词作为指导，或直接使用 grep/read/bash。

**示例 — 两步自用验证（dogfood）模式：**
```
步骤 1：/agent explorer find where playback scheduling is implemented
步骤 2：向 pi 提问："Using the Explorer instructions above, actually search the
        repository for playback scheduling. Use grep/read/bash and return
        path:line evidence."
```

**示例 — 直接搜索（不使用 /agent）：**
```
Search the repository for playback scheduling implementation. Use grep/read/bash.
Return path:line evidence.
```

此版本有意不支持：

- **通过提供商调用的实际模型调用** — 回退为提示词-only
- **代理间委派** — 不在范围内
- **代理组合或流水线** — 不在范围内
- **提供商调用流式传输** — 不在范围内
- **生成 pi 子进程** — 不在范围内
- **工作树隔离** — 不在范围内
- **调度器 / cron 编排** — 不在范围内
- **委员会 / 投票流程** — 不在范围内
- **子会话委派** — 等待 pi-mono API
- **Token 用量追踪** — 需要实际的提供商调用
- **MCP 集成** — 不在范围内

### 提供商调用状态

提供商调用（provider-call）运行器在架构上已完成，但由于 pnpm 严格模块解析阻止了 `@mariozechner/pi-ai` 的导入，无法进行实际的模型调用。当提供商调用不可用时，运行器会优雅地回退为提示词-only。

使用 `/agents status` 检查提供商调用可用性。

完整调研参见 [docs/provider-call.md](docs/provider-call.md)。

## 路线图

里程碑历史和未来计划参见 [docs/roadmap.md](docs/roadmap.md)。

潜在的未来里程碑：
- M14：提供商调用真实集成（等待 pi-mono ExtensionAPI）
- M15：Token 用量追踪
- M16：`/agent` 中的标签自动补全
- M17：子会话委派（等待 pi-mono API）

## 文档

- [docs/project-state.md](docs/project-state.md) — 当前项目状态
- [docs/next-actions.md](docs/next-actions.md) — 当前任务看板
- [docs/decisions.md](docs/decisions.md) — 关键设计决策
- [docs/roadmap.md](docs/roadmap.md) — 功能路线图和里程碑历史
- [docs/design.md](docs/design.md) — 架构和设计
- [docs/dogfood.md](docs/dogfood.md) — 自用验证（Dogfooding）指南
- [docs/agent-authoring.md](docs/agent-authoring.md) — 代理创作指南
- [docs/provider-call.md](docs/provider-call.md) — 提供商调用调研
- [docs/prompt-tuning.md](docs/prompt-tuning.md) — 提示词质量检查清单
- [docs/reviews/index.md](docs/reviews/index.md) — 审查轮次摘要
- [examples/prompt-evals/README.md](examples/prompt-evals/README.md) — 评估示例指南

## 许可证

MIT — 参见 [LICENSE](LICENSE)。

## 致谢

灵感来自 [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)。

**重要**：本项目不是 OpenCode 插件，也没有移植完整的 oh-my-opencode-slim 运行时。它仅采用了轻量专家代理的设计理念，并将其重写为 pi-mono 扩展。
