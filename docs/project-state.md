# 项目状态

## 当前状态

- **v0.1.0 已就绪**（经 R7 审查确认）
- **npm 发布暂时推迟**，原因是 npm 2FA/令牌问题
- **在 devpiano 中进行本地自用验证（dogfood）** 是当前重点

## 当前阶段

自用验证（Dogfood）/ 发布前稳定化。

## 稳定功能

以下功能在 v0.1.0 中稳定可用：

- **提示词-only 委派（prompt-only delegation）** — 稳定默认模式，生成专家委派提示词
- **内置代理（agents）** — 6 个代理就绪：explorer、librarian、oracle、fixer、designer、orchestrator
- **`/agent` 快捷命令** — 通过 `--mode` 标志直接调用（quick、normal、deep）
- **`/agents` 命令** — status、reload、history、metrics、replay、export-history、templates、create、validate
- **模板（templates）** — 7 个模板：security-reviewer、test-writer、doc-generator、refactor-planner、bug-triager、release-checker、cpp-reviewer
- **标签/过滤/正则（tags/filter/regex）** — 按标签、只读状态、来源、正则表达式过滤代理/模板
- **JSON 输出** — 所有命令支持 `--format json`
- **元数据安全 sourcePath** — JSON 输出中无绝对路径、无 API 密钥
- **提示词评估示例** — `examples/prompt-evals/` 带静态检查器
- **发布检查** — `pnpm release:check` 进行完整验证

## 实验性 / 回退功能

- **提供商调用（provider-call）运行器架构** 存在，但实际提供商调用不可用
- **提供商调用当前回退为提示词-only** — pi-ai 无法通过 pnpm 严格模块解析导入
- **持久化历史记录** — 可选 JSONL 持久化（如已配置）

## 未实现

以下功能不在 v0.1.0 范围内：

- 实际提供商调用集成（等待 pi-mono ExtensionAPI）
- 子会话（child-session）运行器（等待 pi-mono API）
- 后台子代理（background subagents）
- 代理组合/流水线（agent composition/pipelines）
- 工作树隔离（worktree isolation）
- 调度器/cron
- MCP 集成
- Token 用量追踪
- `/agent` 中的标签自动补全
- 提供商调用流式传输（streaming）

## 重要行为

### `/agent` 在提示词-only 模式下仅生成委派提示词

在提示词-only 模式（稳定的默认模式）下，`/agent` 和 `delegate_agent`：

- ✅ 返回结构化的专家委派提示词
- ✅ 显示代理的角色、任务、指令和预期输出格式
- ✅ 在历史记录中记录委派

但是：

- ❌ 不会执行 grep、read、bash 或任何其他工具
- ❌ 不会搜索代码库
- ❌ 不会启动后台子代理
- ❌ 不会自动继续运行

**实际的代码搜索仍需主 pi 会话执行。** 使用生成的提示词引导主代理，然后让它用 grep/read/bash 手动执行搜索。

这是 v0.1.0 的预期行为。推荐的工作流程请参见 [docs/dogfood.md](dogfood.md)。

## 近期里程碑

| 里程碑 | 日期 | 状态 |
|--------|------|------|
| R0-R7 审计完成 | 2026-05-06 | ✅ |
| R7：v0.1.0 已就绪 | 2026-05-06 | ✅ |
| 发布准备完成 | 2026-05-06 | ✅ |
| D1-fix：ESM require 修复 | 2026-05-06 | ✅ |
| D1-fix：提示词-only 用户体验修复 | 2026-05-06 | ✅ |
| devpiano 自用验证已开始 | 2026-05-06 | 🔄 |

## 当前已知问题 / 风险

| 问题 | 影响 | 缓解措施 |
|------|------|----------|
| npm 发布因 npm 账户认证流程受阻 | 无法发布到 npm | 推迟发布，代码已具备发布就绪状态 |
| 提示词-only 用户体验可能让新用户困惑 | 用户预期与实际不符 | D1 用户体验修复：横幅提示 + docs/dogfood.md |
| 提供商调用不可用：pi-ai 无法导入 | 回退为提示词-only | 预期行为，关注 pi-mono API 动态 |
| 需要在 devpiano 中获取自用验证反馈 | 未在真实工作流中测试 | 继续使用两步 Explorer 工作流 |
| R5 小型测试已推迟 | 测试覆盖率缺口 | 如需要，在 v0.1.x 中补充 |

## 推荐的下一步操作

1. **在 devpiano 中验证 D1-fix** — 确认启动时无 "require is not defined" 错误
2. **继续使用两步模式进行自用验证** — `/agent` + 让主代理执行搜索
3. **记录自用验证反馈** — 提示词质量、运行器行为、用户体验清晰度
4. **根据需要改进提示词-only 用户体验** — 基于自用验证发现
5. **补充 R5 推迟的测试** — Unicode/中文、重复标志、outputTemplate=false
6. **重新考虑 npm 发布** — 当账户认证问题解决后

## 文档

- [docs/roadmap.md](roadmap.md) — 功能路线图和里程碑历史
- [docs/design.md](design.md) — 架构和设计决策
- [docs/dogfood.md](dogfood.md) — 自用验证指南及工作流
- [docs/provider-call.md](provider-call.md) — 提供商调用调研和状态
- [docs/reviews/index.md](reviews/index.md) — 审查轮次摘要
- [docs/decisions.md](decisions.md) — 关键设计决策
- [docs/next-actions.md](next-actions.md) — 当前行动事项

---

*最后更新：2026-05-06*
