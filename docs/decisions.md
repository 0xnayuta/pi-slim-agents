# 设计决策

塑造 pi-slim-agents 的关键设计决策。

## D001：保持 pi-slim-agents 精简

**决策：** 不构建带有 tmux、工作树（worktree）、调度器或委员会（council）的重量级子代理框架。

**理由：**
- 复杂的编排增加维护负担和运行时开销
- pi-mono 并非设计为多代理运行时
- 用户需求通过聚焦的、单一用途的委派提示词来满足
- 简单性带来可靠性和可预测性

**结果：**
- 没有后台代理进程
- 提示词-only 模式下不会自动执行工具
- 委派是请求-响应模式，不是持久化的
- 用户必须在自己的推理中手动采用专家角色

---

## D002：提示词-only 是 v0.1.0 的稳定默认模式

**决策：** `runnerMode: "prompt-only"` 是稳定默认值。提供商调用（provider-call）运行器仅为架构设计。

**理由：**
- pi-mono ExtensionAPI 不暴露直接的模型调用
- `@mariozechner/pi-ai` 无法通过 pnpm 严格模块解析导入
- 基于提示词的委派在没有真实模型调用的情况下也能产生良好结果
- 当 pi-mono API 支持时可以添加提供商调用集成

**结果：**
- `/agent` 返回委派提示词，而非搜索结果
- 用户在收到委派提示词后必须手动执行搜索
- 提供商调用运行器在不可用时优雅回退为提示词-only
- 未来：当实际提供商调用可用时 `executed: true`

---

## D003：`/agent` 在提示词-only 模式下不执行操作

**决策：** 在提示词-only 模式下，`/agent` 仅生成委派提示词。不会执行工具或启动子代理。

**理由：**
- 模式之间的行为边界清晰
- 不会产生关于 `/agent` 功能的错误预期
- 回退是明确且可见的
- 用户随时可以通过 `/agents status` 检查

**结果：**
- 用户体验横幅显示 "⚠️ 提示词-only 委派 — 未执行任何工具"
- JSON 输出包含 `executed: false`、`toolsExecuted: false`、`childSessionStarted: false`
- 自用验证（dogfood）需要两步模式：`/agent` + 让主代理执行搜索
- 直接搜索（绕过 `/agent`）可用于实际工作

---

## D004：使用 Markdown frontmatter 定义代理/模板

**决策：** 代理和模板使用带有 YAML frontmatter 的 Markdown 文件定义。

**理由：**
- 人类可读且易于编辑
- 创建代理无需 TypeScript 或构建步骤
- frontmatter 支持元数据（别名、标签、模式、温度）
- Markdown 正文提供自然的提示词结构
- 与标准文本编辑器兼容

**结果：**
- 代理通过文件系统加载（项目/用户/包优先级）
- 加载时进行 frontmatter 校验
- 用户可以通过将包级代理复制到项目级来自定义
- 模板可以通过 `/agents create` 实例化

---

## D005：安全的 sourcePath 元数据

**决策：** JSON 输出绝不包含绝对路径或完整的用户目录路径。

**理由：**
- 隐私：用户目录路径可能泄露个人信息
- 安全：绝对路径可能泄露系统结构
- 可移植性：相对路径可在不同环境中使用

**结果：**
- `sourcePath` 始终是安全的显示路径：
  - `builtin`：相对于包根目录（如 `agents/oracle.md`）
  - `project`：相对于项目 cwd（如 `.pi/slim-agents/agents/foo.md`）
  - `user`：家目录缩写（如 `~/.pi/agent/...`）
  - `external`：仅文件名
- `sourcePathKind` 字段标识路径类型
- API 密钥清理同样应用于 JSON 输出

---

## D006：提供商调用（provider-call）已推迟

**决策：** 不在 v0.1.0 中强制实际提供商调用集成。等待稳定的 pi-mono ExtensionAPI。

**理由：**
- pnpm 严格模块解析阻止导入 `@mariozechner/pi-ai`
- 变通方案（public-hoist-pattern、shamefully-hoist）破坏模块隔离
- pi-mono 可能在未来暴露直接的模型调用 API
- 提示词-only 委派在没有真实模型调用的情况下也很有效

**结果：**
- 提供商调用运行器架构存在但回退为提示词-only
- `/agents status` 显示提供商调用可用性和原因
- 未来集成点：pi-mono ExtensionAPI 提供 `complete()` 或 `generateText()`
- 关注 pi-mono 发布中的 API 新增

---

## D007：npm 发布已推迟但代码已具备发布就绪状态

**决策：** 代码已准备好 v0.1.0，但 npm 发布暂时被账户 2FA/令牌问题阻塞。

**理由：**
- R7 审查结论为 "Ready for 0.1.0"
- 全部 362 个测试通过，所有阻塞项已解决
- 包内容已验证正确
- CI 流水线与 release:check 一致

**结果：**
- README 显示 "Release-ready" 和 "npm publication pending"
- CHANGELOG 显示 "[0.1.0] - Unreleased"
- 本地自用验证无需 npm 发布即可进行
- 账户认证问题解决后即可发布

---

## D008：历史记录默认内存存储，可选 JSONL 持久化

**决策：** 历史记录默认存储在内存中。通过 `history.persistent: true` 配置可选 JSONL 持久化。

**理由：**
- 大多数用户不需要跨会话持久化
- JSONL 增加文件 I/O 和复杂性
- 持久化需要更新 `.gitignore`
- 默认行为简单且快速

**结果：**
- 会话结束时历史记录丢失（默认）
- 通过 `history.persistent: true` 可选持久化
- 保留限制可配置（默认：200 条记录）
- 写入失败不影响委派

---

## D009：常见代理角色的别名

**决策：** 内置别名允许简短命令：`search` → `explorer`、`arch` → `oracle` 等。

**理由：**
- 减少常见操作的输入量
- 映射到自然语言模式（search for X、arch review Y）
- 别名在代理加载之前解析
- 用户可以通过自定义代理创建自己的别名

**结果：**
- 在提示词-only 和提供商调用模式下均可解析别名
- 别名校验以检测冲突
- 别名包含在 JSON 输出中（`aliasUsed: true`）
- 独立回退命令也支持别名

---

## D010：标签自动补全预留为未来功能

**决策：** `/agent` 中的标签自动补全是未来增强功能，v0.1.0 中未实现。

**理由：**
- 需要 pi-mono 命令补全 API 支持
- 对核心功能不关键
- 可以在 pi-mono API 可用时再设计
- v0.1.0 应专注于稳定的核心功能

**结果：**
- `/agent` 中的 `--tag` 标志无补全功能
- 标签可用于 `/agents --tag` 过滤
- 未来：补全候选项来自代理名称、别名和标签

---

## D011：JSON 输出中不包含 API 密钥或完整提示词

**决策：** JSON 输出排除敏感数据：API 密钥、完整提示词、完整结果。

**理由：**
- 隐私：提示词可能包含专有上下文
- 安全：类 API 密钥的字符串必须被清理
- 可移植性：JSON 输出可安全分享或记录

**结果：**
- `sanitizeJsonText()` 移除 `apiKey=sk-...`、`sk-XXXXXXXX`、`Bearer <token>`
- 代理 `body` 字段永远不包含在 JSON 中
- 提供商调用输出不包含在 JSON 中
- 历史记录 JSON 仅包含 `taskSummary`（截断为 80 字符）

---

## D012：JSON 输出使用 schemaVersion 实现前向兼容

**决策：** 所有 JSON 输出包含 `schemaVersion: 1` 和 `kind` 字段。

**理由：**
- 消费者可以在解析前检查 schema 版本
- `kind` 字段标识输出类型
- 未来的 schema 变更可以优雅处理

**结果：**
- JSON 信封：`{ "schemaVersion": 1, "kind": "agents", ... }`
- 8 种 kind：agents、templates、status、history、metrics、validation、agentResult、error
- 未设置的过滤字段使用 null（一致的序列化）
- 全部使用 camelCase 字段名

---

*最后更新：2026-05-06*
