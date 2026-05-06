# 路线图 — pi-slim-agents

## 当前状态

**v0.1.0 — 已具备发布就绪状态（npm 发布已推迟）**

- ✅ 所有审查轮次（R0-R7）已完成
- ✅ R7 结论：v0.1.0 已就绪
- ⚠️ npm 发布暂时被账户 2FA/令牌问题阻塞
- 🔄 当前重点：在 devpiano 中进行自用验证（dogfood）

**阶段：** 自用验证 / 发布前稳定化

**未来可行性探索：**
- M14：提供商调用（provider-call）真实集成（等待 pi-mono ExtensionAPI）
- M17：子会话委派（child session delegation）（等待 pi-mono API）

---

## v0.1.0 — M2：最小可运行循环

**使用提示词-only 运行器的基础委派。**

- [x] `/agents` 命令列出可用的专家代理
- [x] `delegate_agent` 工具用于 LLM 委派
- [x] 提示词-only 运行器（返回结构化委派提示词）
- [x] 通过 `before_agent_start` 注入路由提示
- [x] 6 个内置代理：orchestrator、explorer、librarian、oracle、designer、fixer
- [x] 代理别名支持（search → explorer 等）
- [x] 启用/禁用配置

## v0.1.0 — M3：可靠性与配置

**测试、别名校验和配置。**

- [x] 使用 tsx 的测试套件（无测试框架）
- [x] 内置代理加载测试
- [x] Frontmatter 解析测试
- [x] 别名冲突检测和解决
- [x] 通过配置启用/禁用代理
- [x] 用户级和项目级配置合并

## v0.1.0 — M4：提供商调用（Provider-Call）运行器

**双运行器模式与优雅回退。**

- [x] `runnerMode` 配置：`"prompt-only"`（默认）和 `"provider-call"`
- [x] 提供商调用运行器架构，集成 `@mariozechner/pi-ai` complete()
- [x] 当 pi-ai 无法导入时优雅回退（pnpm 严格模块解析）
- [x] 代理级 `model` 和 `temperature` 配置
- [x] 温度优先级：config > frontmatter > 默认值（0.2）
- [x] 模型优先级：agent > defaultModel > "current"
- [x] 提示词组装：系统提示词（代理正文 + 边界约束）+ 用户消息（任务/上下文/文件/模式）
- [x] 带元数据的提供商调用输出格式
- [x] 提供商调用模式下禁用代理/未知代理的拒绝
- [x] 提供商调用模式下的别名解析
- [x] 81 个测试覆盖所有功能

## v0.1.0 — M5：状态 / 重载 / 历史记录 / 指标

**可观测性、可调试性和运维命令。**

- [x] `/agents status` — 运行时状态（runnerMode、提供商调用可用性、代理数量、配置路径）
- [x] `/agents reload` — 从磁盘热重载配置和代理
- [x] `/agents history` — 最近的委派历史记录（内存中，最新优先）
- [x] `/agents metrics` — 委派指标（计数、平均耗时、按代理、按 runnerMode）
- [x] 独立回退命令：`/agents-status`、`/agents-reload`、`/agents-history`、`/agents-metrics`
- [x] `delegate_agent` 中的委派历史记录记录（时间戳、代理、任务摘要、状态、耗时、别名）
- [x] `determineDelegationStatus` — 将结果分类为 success/fallback/error
- [x] 代理 `source` 字段（package/user/project）用于诊断
- [x] 提供商调用可用性缓存（每会话检查一次）
- [x] 错误消息中的密钥清理
- [x] 提供商调用调研记录在 `docs/provider-call.md` 中
- [x] 115 个测试覆盖所有新功能

## v0.1.0 — M6：快捷命令 / 输出模板 / 轻量重放

**用户体验改进和结构化输出。**

- [x] `/agent <agent-or-alias> <task...>` 快捷命令
- [x] `/agent` 复用 `runDelegation` 核心逻辑（无代码重复）
- [x] `/agent` 记录历史记录和指标
- [x] `/agent` 处理空任务（帮助）、未知代理（可用列表）、禁用代理（明确错误）
- [x] 带 XML 标签的结构化输出模板（`<summary>`、`<findings>`、`<evidence>`、`<risks>`、`<next_actions>`）
- [x] 每个代理的模板变体（explorer、librarian、oracle、fixer、designer、orchestrator）
- [x] `outputTemplate` 配置开关（默认：true）
- [x] `/agents replay <id>` — 从历史记录重新运行委派
- [x] `/agents-replay <id>` — 独立回退
- [x] 历史记录包含自动递增的 `id`
- [x] 历史记录包含 `fullTask`、`fullContext`、`fullFiles` 用于重放（可配置）
- [x] `history.storeFullTask` 配置选项（默认：true）
- [x] 重放使用原始 `resolvedAgent` 以防止别名漂移
- [x] 当别名现在解析为不同代理时重放发出警告
- [x] 重放拒绝已禁用/已移除的代理并给出明确错误
- [x] 157 个测试覆盖所有新功能

## v0.1.0 — M7：历史记录 / 重放可用性

**增强的历史记录/重放，支持模式、过滤器、修改和持久化。**

- [x] `/agent --mode <mode>` 和 `/agent -m <mode>` 标志支持
- [x] 模式校验：quick、normal、deep
- [x] 无效模式返回明确错误并列出有效模式列表
- [x] 模式贯穿委派、历史记录和指标
- [x] `/agents history --agent <name>` 过滤
- [x] `/agents history --status <status>` 过滤
- [x] `/agents history --mode <mode>` 过滤
- [x] `/agents history --runner <mode>` 过滤
- [x] `/agents history --limit <n>`（默认 10，最大 100）
- [x] `/agents history --query <text>` 不区分大小写搜索
- [x] 过滤条件可组合
- [x] 过滤结果为空时显示明确消息
- [x] `/agents replay <id> --mode <mode>` 覆盖
- [x] `/agents replay <id> --agent <agent>` 覆盖（带别名解析）
- [x] `/agents replay <id> --task <task>` 覆盖
- [x] `/agents replay <id> --context <context>` 覆盖
- [x] `/agents replay <id> --files <f1,f2>` 覆盖
- [x] 重放 `replayOf` 字段在历史记录中
- [x] 重放显示原始代理、新代理和修改的字段
- [x] 带代理覆盖的重放检查启用/禁用状态
- [x] `/agents export-history` — 将过滤后的历史记录导出为 JSON
- [x] `/agents-history-export` — 独立回退
- [x] 导出时剥离完整的任务/上下文/文件以保护隐私
- [x] 可选的持久化 JSONL 历史记录（`history.persistent`）
- [x] 会话启动时加载持久化历史记录
- [x] 每次委派时追加持久化历史记录
- [x] 保留限制执行（可配置，默认 200）
- [x] 写入失败不影响委派
- [x] 历史记录表格显示 mode 列和 replayOf 指示器
- [x] `storeFullContext` 配置用于独立的上下文存储
- [x] `parseFlags` 工具用于 CLI 风格的参数解析
- [x] 独立命令支持过滤器参数
- [x] 200 个测试覆盖所有新功能

## v0.1.0 — M8：代理模板 / 预设 + 创作完善

**常见专家角色的快速入门模板、校验和创作文档。**

- [x] `/agents templates` — 列出可用的代理模板
- [x] `/agents create <template> <agent>` — 从模板创建项目级代理
- [x] `/agents validate` — 跨所有位置校验代理文件
- [x] 独立回退命令：`/agents-templates`、`/agents-create`、`/agents-validate`
- [x] 7 个代理模板（security-reviewer、test-writer、doc-generator、refactor-planner、bug-triager、release-checker、cpp-reviewer）
- [x] 模板加载服务，提供 `loadTemplates`、`getTemplate`
- [x] 从模板创建代理，带别名冲突检测
- [x] 校验：frontmatter、必需字段、别名安全性/冲突、空正文、只读边界
- [x] frontmatter 中的 `recommendedMode` 字段用于模板指导
- [x] 改进的代理创作文档
- [x] 更新了技能指南，添加模板部分
- [x] 模板目录包含在包分发中
- [x] 223 个测试覆盖所有新功能

## v0.1.0 — M9：代理搜索 / 过滤 + 标签元数据

**增强的搜索、过滤和标签元数据。**

- [x] 标签元数据 — 所有内置代理和模板都有用于分类的标签
- [x] `/agents --tag <tag>` — 按标签过滤代理（多个标签为 AND 语义）
- [x] `/agents --query <text>` — 跨名称、描述、别名、标签的不区分大小写搜索
- [x] `/agents --readonly | --writable` — 按只读状态过滤
- [x] `/agents --enabled | --disabled` — 按启用状态过滤
- [x] `/agents --source builtin | user | project` — 按来源过滤
- [x] `/agents templates --tag <tag>` — 按标签过滤模板
- [x] `/agents templates --query <text>` — 搜索模板
- [x] `/agents validate` — 现在检查标签（有效性、重复、缺失标签、数量限制）
- [x] `/agents validate` 中的标签校验
- [x] **M9 反馈候选**：提供商调用真实集成、pi-ai 可导入性修复、Token 用量追踪、`/agents --regex`、`/agent` 中的标签自动补全、`/agents --format json`

## v0.1.0 — M10：机器可读输出 / 正则搜索 / 脚本化

**用于脚本、CI 和外部工具集成的 JSON 输出和正则搜索。**

- [x] 所有 list/status/history/metrics/validate 命令支持 `--format json`
- [x] `/agents --format json` — 带过滤器的代理 JSON 列表
- [x] `/agents templates --format json` — 带过滤器的模板 JSON 列表
- [x] `/agents status --format json` — JSON 状态报告
- [x] `/agents history --format json` — 带过滤器的 JSON 委派历史记录
- [x] `/agents metrics --format json` — JSON 委派指标
- [x] `/agents validate --format json` — JSON 校验结果
- [x] 所有 JSON 输出包含 `schemaVersion: 1` 和 `kind` 字段
- [x] 所有 JSON 输出使用 camelCase 字段名
- [x] `--format text` 是默认值（向后兼容）
- [x] 不支持的 `--format` 值返回明确错误并列出支持的格式
- [x] `/agents --regex <pattern>` — 正则搜索（匹配 name、description、aliases、tags）
- [x] `/agents templates --regex <pattern>` — 模板正则搜索
- [x] 正则默认使用不区分大小写标志（`i`）
- [x] 无效正则模式返回明确错误（不崩溃）
- [x] 正则与其他过滤条件 AND 组合（`--tag --regex --query`）
- [x] 文本输出不变（JSON 中无 Markdown）
- [x] JSON 输出排除：API 密钥、完整提示词、完整结果、完整任务/上下文
- [x] 统一格式化器层（`src/format.ts`）
- [x] 标签自动补全设计预留已记录
- [x] Token 用量追踪预留已记录
- [x] 47 个新的 M10 测试（总计 302 个，1 个已存在的 Windows 特定 `/proc` 失败）
- [x] 更新了 `docs/design.md`，包含 JSON 输出、正则、自动补全、Token 用量设计

## v0.1.0 — M11：代理命令 JSON / 元数据 / JSON 完善

**/agent 命令的 JSON 输出、源元数据增强和 JSON 完善。**

- [x] `/agent --format json` — 委派结果的 JSON 输出（成功/错误）
- [x] `/agent --mode <mode> --format json` — 组合模式和格式标志
- [x] `kind: agentResult` — /agent 委派的新 JSON 响应 kind
- [x] `kind: error` — 格式/正则失败的结构化错误 JSON
- [x] 过滤器对未设置的字段使用 `null`（一致的序列化）
- [x] `/agents --format json` 包含 `metadata` — sourcePath、createdAt、lastModified、sizeBytes
- [x] `/agents templates --format json` 包含 `metadata`
- [x] 通过 `fs.statSync` 收集文件元数据（非致命，失败时优雅返回 null）
- [x] `src/metadata.ts` 中的 `collectFileMetadata()` 工具
- [x] `serializeAgentFilters()` / `serializeTemplateFilters()` — 可复用的过滤器工具
- [x] `formatAgentResultJson` 中的 API 密钥清理（`sanitizeJsonText()`）
- [x] `FileMetadata` 类型添加到 `types.ts`
- [x] `AgentDefinition.metadata` 和 `TemplateInfo.metadata` 字段
- [x] 独立回退 JSON 命令未实现（标志支持已可靠）
- [x] 提供商调用路线图更新了阻塞点和候选解决方案
- [x] 31 个新的 M11 测试（总计 333 个，1 个已存在的 Windows 特定 `/proc` 失败）
- [x] 更新了 `docs/design.md`，包含 M11 设计说明
- [x] 更新了 `docs/provider-call.md`，包含 M11 路线图
- [x] 更新了 README，包含 /agent --format json、元数据、隐私说明、独立 JSON 命令

## v0.1.0 — M12：提示词调优 / 轻量评估示例

**改进代理提示词并建立轻量评估系统。**

- [x] `examples/prompt-evals/` 目录，包含所有内置代理的人类可读评估用例
- [x] `examples/prompt-evals/template-evals.md` 覆盖所有 7 个模板
- [x] `docs/prompt-tuning.md` 包含提示词质量检查清单和每个代理的失败模式
- [x] 静态提示词评估检查器（`scripts/check-prompt-evals.ts`）：
  - 评估文件存在性检查（6 个代理 + 模板评估）
  - 每个代理至少 3 个用例
  - 必需字段：Agent、Task、Expected behavior
  - 代理文件非空且有边界约束
  - prompt-tuning.md 检查清单存在
- [x] 内置代理提示词精炼：
  - explorer：减少范围蔓延，更清晰的输出格式，要求 file:line 证据
  - oracle：先给结论，限定长度，无推荐时不提供抽象建议
  - fixer：范围强制执行，在提示词-only 模式下不声称已修改
  - librarian：来源引用要求，区分官方文档和教程
  - designer：可操作的指导，项目设计系统感知
  - orchestrator：委派克制，路由精确
- [x] `pnpm test:prompts` 集成到 CI 和 `pnpm test`
- [x] M9 反馈已纳入提示词改进

## v0.1.0 — M13：发布加固 / v0.1.0 就绪

**完成发布包并为 v0.1.0 发布进行加固。**

- [x] 包加固：
  - `.npmignore` 排除开发专用文件
  - `.gitignore` 包含 node_modules、dist、history.jsonl、Python 临时文件
  - `scripts/check-package.ts` 校验所有包内容
  - 13 点包检查覆盖 dist、agents、templates、skills、docs、examples、README、CHANGELOG、LICENSE、.gitignore
- [x] README / CHANGELOG / 发布文档：
  - `docs/release.md` 包含完整的发布前检查清单、发布、回滚
  - `docs/provider-call.md` 包含完整调研和架构状态
  - 带 ✅/⚠️ 指示器的状态表以明确功能
  - "What this is NOT" 部分澄清非范围
  - 当前限制部分明确列出 v0.1.0 排除项
- [x] GitHub Actions CI 流水线：
  - 在推送到 main/master 和拉取请求时运行
  - 覆盖：typecheck → build → test:agents → test:prompts → check:package → pack:dry
  - 使用 pnpm v9 和 corepack
  - 缓存 pnpm store
- [x] `pnpm release:check` 链：typecheck + build + test + check:package + pack:dry
- [x] `prepublishOnly` 钩子防止未经验证的意外发布
- [x] 完成多轮代码审查（R0-R6），覆盖包、扩展集成、代理/模板加载、命令解析、运行器/历史记录/指标、测试/边界情况、文档/用户体验
- [x] 362+ 个测试覆盖所有核心功能
- [x] 提供商调用保持"仅架构设计" — 提示词-only 是 v0.1.0 的稳定默认值

## v0.3.0 — 计划中

**增强的委派和代理能力。**

- [ ] 代理依赖解析（代理 A 可以调用代理 B）
- [ ] 常见模式的代理模板（reviewer、tester、documenter）
- [ ] 代理组合（组合代理以处理复杂工作流）

## v0.4.0 — 计划中

**子会话委派（当 pi-mono API 支持时）。**

- [ ] 通过 pi-mono 子会话 API 进行独立模型调用
- [ ] 专家在隔离上下文中运行（不污染主会话）
- [ ] 流式结果返回主会话
- [ ] 并行委派支持

## v0.5.0 — 计划中

**高级功能。**

- [ ] 代理特定工具权限（限制每个代理可使用的工具）
- [ ] 自定义代理校验（frontmatter 的 schema 检查）
- [ ] 代理测试工具
- [ ] 工作树隔离或环境沙箱

## 未来想法

- [ ] 代理市场 / 分享
- [ ] 代理性能基准测试
- [ ] 代理从委派结果中学习
- [ ] 与 pi-mono TUI 集成以显示代理状态
- [ ] 代理特定的上下文窗口管理
- [ ] 调度器 / cron 风格编排
- [ ] 委员会 / 投票流程
- [ ] 委派代理的会话恢复
- [ ] MCP 集成

## v0.1.0 后续跟进

这些事项在 R7 最终发布审查中识别，但对 v0.1.0 不构成阻塞。

### 测试覆盖率改进

- [ ] **Unicode/中文输入测试** — 测试代理在非 ASCII 任务文本下的行为
- [ ] **重复标志测试** — 测试 `/agent --mode deep --mode quick` 边界情况
- [ ] **outputTemplate=false 集成测试** — 验证纯文本输出渲染
- [ ] **任务解析中的类标志文本** — 记录限制（如果任务文本包含 `--flag-like` 模式需用引号包裹）
- [ ] **并发历史记录追加测试** — 测试持久化历史记录的竞态条件

### 功能 / 探索

- [ ] **提供商调用可行性探索** — 监控 pi-mono ExtensionAPI 发布以获取 @mariozechner/pi-ai 导入修复
- [ ] **/agent 中的标签自动补全** — 预留未来增强
- [ ] **Token 用量追踪** — 需要实际的提供商调用集成

### 自用验证（Dogfooding）

- [ ] **在开发工作流中进行自用验证** — 在实际开发工作中使用 /agent、/agents、templates
- [ ] **真实场景的提示词调优** — 基于实际使用迭代代理提示词

### 文档改进

- [ ] **README 目录** — 考虑为 400+ 行文档添加目录
- [ ] **`--source` 过滤器文档** — 添加到 README 快速参考
- [ ] **docs/ 导航索引** — 考虑添加 docs/README.md 用于导航

---

## D1：提示词-only 用户体验澄清（v0.1.x）

**完成于 2026-05-06 — v0.1.0 的自用验证修复。**

### 问题
在提示词-only 模式下，`/agent explorer find X` 仅返回委派提示词。不会执行工具、搜索代码库或启动子代理。这没有清楚地传达给用户，在自用验证测试期间导致了困惑。

### 所做的变更
- **runner.ts**：向 `DelegationResult` 添加了执行元数据（`runnerMode`、`executed`、`toolsExecuted`、`childSessionStarted`、`note`）。为提示词-only 输出在 `formatDelegationResult` 中添加了用户体验横幅。
- **provider-runner.ts**：向所有回退返回路径添加了执行元数据。
- **types.ts**：扩展了 `DelegationResult` 接口，添加执行元数据字段。
- **format.ts**：扩展了 `AgentResultJsonOutput` 和 `formatAgentResultJson`，添加执行字段。
- **index.ts**：将委派结果中的执行元数据传递给 JSON 格式化器和 delegate_agent 工具详情。
- **commands.ts**：更新了 `buildAgentHelpText`，添加提示词-only 警告、两步自用验证模式和直接搜索示例。
- **README.md**：在"当前限制"中添加了提示词-only 澄清部分，更新了 "What this is NOT" 和 "Delegate a task" 部分。
- **docs/dogfood.md**：新文件，包含自用验证指南，涵盖两步模式、直接搜索替代方案和报告说明。
- **skills/use-slim-agents/SKILL.md**：添加了提示词-only 行为说明、两步模式指导和委派后指导。
- **测试**：6 个新测试覆盖执行元数据、formatDelegationResult 横幅、buildAgentHelpText 警告和 JSON 执行字段。

### 未实现（不在 D1 范围内）
- **实际提供商调用集成** — 等待 pi-mono ExtensionAPI
- **子会话运行器** — 等待 pi-mono API
- **执行工具的委派** — 需要提供商调用或子会话

### 未来集成点
- **提供商调用真实集成**：当前仅为架构设计；当真实可用时 `executed: true`（等待 pi-mono ExtensionAPI）
- **子会话运行器**：独立模型调用；实现时 `childSessionStarted: true`（v0.4.0 计划）

---

*最后更新：2026-05-06*
