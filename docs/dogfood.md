# 自用验证（Dogfooding）指南 — pi-slim-agents

本指南帮助你在自用验证（dogfood）阶段，在自己的开发工作流中测试 pi-slim-agents。

## 重要：提示词-only 行为

**这是自用验证前最需要理解的事情。**

### `/agent` 不做什么

在提示词-only 模式（默认模式）下，`/agent` 和 `delegate_agent`：

- ❌ 不会执行 grep、read、bash 或任何其他工具
- ❌ 不会搜索代码库
- ❌ 不会启动后台子代理
- ❌ 不会自动继续运行

### `/agent` 做什么

在提示词-only 模式下，`/agent`：

- ✅ 返回结构化的专家委派提示词
- ✅ 显示代理的角色、任务、指令和预期输出格式
- ✅ 在历史记录中记录委派

### 示例：你看到的 vs 你期望的

**你输入：**
```
/agent explorer find where playback scheduling is implemented
```

**pi 返回：**
```
⚠️  Prompt-only delegation — no tools were executed
   This is a specialist prompt only. No child agent was started.
   Use this prompt to guide the main agent, or ask it to perform
   the search manually with grep/read/bash.

📋 Delegated to @explorer (Codebase navigator)
...

--- Delegation Prompt ---
Agent
@explorer

Role
Codebase navigator

Task
find where playback scheduling is implemented

Instructions
...
--- End ---
```

**你期望的：** 带有 `path:line` 证据的实际搜索结果

**你得到的：** explorer 代理的委派提示词

这是提示词-only 模式的**正确行为** — 但它可能不符合你的预期。

---

## 如何正确地进行自用验证

由于提示词-only 模式不执行工具，有两种模式可以有效地进行自用验证。

### 模式 1：两步模式（推荐用于测试 /agent）

**第 1 步：** 运行 `/agent` 生成委派提示词：
```
/agent explorer find where playback scheduling is implemented
```

**第 2 步：** 让主 pi 会话使用生成的提示词实际执行搜索：
```
Using the Explorer instructions above, actually search the repository for
playback scheduling. Use grep/read/bash and return path:line evidence.
```

这样你：
1. 看到专家代理的指令（通过 `/agent`）
2. 获得实际的搜索结果（通过主 pi 会话）

### 模式 2：直接搜索（用于实际工作）

如果你需要实际的搜索结果而不需要测试 `/agent` 本身：

```
Search the repository for playback scheduling implementation.
Use grep/read/bash. Return path:line evidence.
```

这完全绕过 `/agent`，直接给你结果。

### 模式 3：比较两种模式

要获得最有用的自用验证反馈，尝试两种模式并进行比较：

1. 运行 `/agent explorer find where X is implemented`
2. 运行直接搜索"where X is implemented"
3. 比较结果的质量

报告在质量、完整性或格式方面的任何差异。

---

## 自用验证任务

### 基础委派测试

测试每个内置代理以确认委派提示词格式正确：

```
/agent explorer find where playback scheduling is implemented
/agent oracle review the error handling strategy
/agent fixer add a null check to parseConfig
/agent designer review the button component styles
/agent librarian research the best practices for TypeScript discriminated unions
/agent orchestrator break down adding WebSocket support
```

### 模式变体

```
/agent --mode quick explorer find the main entry point
/agent --mode deep oracle review the overall architecture
/agent -m normal explorer locate the auth middleware
```

### JSON 输出

```
/agent --format json oracle review this design
```

验证 JSON 包含：
- `runnerMode: "prompt-only"`
- `executed: false`
- `toolsExecuted: false`
- `childSessionStarted: false`
- `note: "Prompt-only delegation..."`

### 历史记录和重放

```
/agents history
/agents replay 1 --mode deep
```

### 代理模板

```
/agents templates
/agents create security-reviewer my-security
/agents validate
```

---

## 需要关注的内容

### 提示词质量

- 委派提示词是否清晰地解释了专家代理应该做什么？
- 任务、上下文和文件是否正确传递？
- 预期的输出格式是否合理？

### 运行器行为

- 输出是否明确表明这是提示词-only 模式？
- ⚠️ 横幅是否可见且有帮助？
- JSON 字段（`executed`、`toolsExecuted`、`childSessionStarted`）是否正确？

### 文档清晰度

- 不带参数的 `/agent` 是否显示有用的指导？
- README 是否澄清了提示词-only 的含义？
- "当前限制"部分是否清晰？

### 边界情况

- 无效的代理名称会怎样？
- 已禁用的代理会怎样？
- 非常长的任务文本会怎样？

---

## 报告问题

报告自用验证问题时，请包含：

1. **你输入的内容：** 确切的 `/agent` 命令
2. **你期望的结果：** 你认为会发生什么
3. **你实际得到的：** 实际输出（或摘要）
4. **runnerMode：** 通过 `/agents status` 确认模式
5. **pi 版本：** 如果可用，运行 `pi --version`

### 报告渠道

- Bug 报告：在 pi-slim-agents GitHub 仓库中提交 issue
- 问题咨询：使用 pi-mono 社区渠道

---

## 当前状态

| 功能 | 自用验证状态 | 备注 |
|------|-------------|------|
| `/agent` 快捷命令 | ✅ 可工作 | 在提示词-only 模式下返回委派提示词 |
| `delegate_agent` 工具 | ✅ 可工作 | 在提示词-only 模式下返回委派提示词 |
| 提供商调用（provider-call）运行器 | ⚠️ 不可工作 | 回退为提示词-only；pi-ai 无法导入 |
| 子会话（child-session）运行器 | ❌ 未实现 | 等待 pi-mono API |
| 实际工具执行 | ❌ 未实现 | 需要提供商调用或子会话 |

---

## 已跟踪的未来改进

参见 [docs/roadmap.md](roadmap.md) 了解计划中的改进，包括：
- M14：提供商调用真实集成（等待 pi-mono ExtensionAPI）
- M15：Token 用量追踪
- M17：子会话委派（等待 pi-mono API）
