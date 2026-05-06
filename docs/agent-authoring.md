# 代理创作指南

本指南介绍如何为 pi-slim-agents 创建和自定义代理。

## 快速入门

### 使用模板（推荐）

模板提供即用的专家角色，可以适配你的项目：

```text
/agents templates
/agents create security-reviewer security
/agents reload
```

然后使用 `/agents validate` 检查问题。

### 手动创建

在以下位置之一创建 Markdown 文件：

- **项目级**：`.pi/slim-agents/agents/my-agent.md`
- **用户级**：`~/.pi/agent/slim-agents/agents/my-agent.md`

文件名（去掉 `.md`）即为代理名称。

## 文件格式

代理文件使用带有 YAML frontmatter 的 Markdown：

```markdown
---
name: my-agent
description: Short description of what this agent does
role: specialist
temperature: 0.2
readonly: true
tags:
  - custom
  - example
order: 50
---

You are My Agent — a specialist in [domain].

**Role**: [What this agent does]

**Behavior**:
- [How the agent should behave]
- [What tools to use]
- [Output format]

**Constraints**:
- [What the agent should NOT do]
```

## Frontmatter 字段

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `name` | string | 否* | 代理标识符。默认为文件名。 |
| `description` | string | 是 | 在 `/agents` 列表中显示的简短描述。 |
| `role` | string | 否 | 面向编排器的角色提示。 |
| `temperature` | number | 否 | LLM 温度（0-2）。默认值：0.2。有效范围：0.0 到 2.0。 |
| `readonly` | boolean | 否 | 如果为 true，代理不能修改文件。默认值：false |
| `tags` | string[] | 否 | 用于搜索和过滤的标签。参见下方[标签](#标签设计)。 |
| `order` | number | 否 | 显示顺序（数值越小优先级越高）。默认值：100 |
| `aliases` | string[] | 否 | 代理的替代名称。 |
| `recommendedMode` | string | 否 | 推荐的委派模式：`quick`、`normal` 或 `deep`。默认值：`normal` |

*文件名优先于 `name` 字段。

## 提示词编写指南

### 组织你的提示词

1. **身份**："You are [Name] — [role description]."
2. **角色**：代理做什么以及何时使用。
3. **行为**：代理应如何行动，使用什么工具。
4. **输出格式**：预期的响应结构。
5. **约束**：代理不应该做什么。

### 要具体

清晰、详细的提示词产生更好的结果：

```markdown
**Role**: Review code for security risks — input validation, auth bypass, sensitive data exposure.

**Behavior**:
- Focus on high-severity issues first
- Reference specific files/lines when found
- Do NOT run automated scanners unless asked
```

### 定义边界

告诉代理不应该做什么：

```markdown
**Constraints**:
- READ-ONLY: Review and advise only
- Do NOT modify files
- Do NOT claim to have made changes you didn't
```

### 示例：最简自定义代理

```markdown
---
name: my-reviewer
description: Code review specialist focusing on correctness and best practices
role: reviewer
temperature: 0.1
readonly: true
order: 35
tags:
  - review
aliases:
  - review-code
---

You are My Reviewer — a code quality specialist.

**Role**: Review code for correctness, readability, and maintainability.

**Behavior**:
- Focus on substantive issues, not style
- Provide specific feedback with file:line references
- Suggest improvements with examples

**Output Format**:
```
<issues>
- [severity] file.ts:42 — Description
</issues>

<summary>
Overall assessment
</summary>
```

**Constraints**:
- READ-ONLY: Review and advise only
- Be constructive, not critical
```

### 示例：C++ 代码审查代理

对于 C/C++ 项目，配合 `pi-lsp` 获取 clangd 诊断：

```markdown
---
name: cpp-reviewer
description: C/C++ code reviewer for memory safety, CMake, and clangd diagnostics
role: cpp-reviewer
temperature: 0.1
readonly: true
order: 38
tags:
  - cpp
  - cmake
aliases:
  - cpp
---

You are C++ Reviewer — a specialist for C/C++ code review.

**Role**: Review C/C++ code for memory safety, correctness, and CMake configuration.

**Behavior**:
- Check for null pointers, buffer overflow, use-after-free patterns
- Review CMake/CONFIGURE lists usage
- When `lsp_diagnostics` is available, use it to supplement your review

**Output Format**:
```
<summary>
Overall assessment
</summary>

<issues>
- [severity] [file:line] — Issue and fix
</issues>
```

**Constraints**:
- READ-ONLY: Review and advise only
- Prioritize correctness over style
- Do NOT run compiler builds unless asked
```

## 标签设计

标签是用于搜索和过滤的元数据标签。它们**不用于委派** — 代理仍然通过名称或别名调用。

### 字段

```yaml
tags:
  - review
  - security
  - readonly
```

### 规则

1. **全部小写** — 标签必须仅使用小写字母、数字、连字符（`-`）和下划线（`_`）
2. **非空** — 不允许空字符串
3. **无重复** — 重复的标签会产生校验警告
4. **建议 ≤ 8 个** — 超过 8 个标签会产生警告
5. **缺少标签** — 没有任何标签的代理会产生校验警告

有效示例：

```yaml
tags:
  - review
  - cpp
  - cmake
  - readonly
```

无效示例：

```yaml
# ❌ 包含空格 — 无效
tags:
  - "code review"

# ❌ 大写 — 无效
tags:
  - Review

# ❌ 空标签 — 无效
tags:
  - review
  - ""
```

### 常用标签

| 标签 | 含义 |
|------|------|
| `readonly` | 代理提供咨询，不修改文件 |
| `writable` | 代理可以修改文件（使用此标签而非否定 `readonly`） |
| `review` | 代理执行代码/设计审查 |
| `docs` | 代理处理文档工作 |
| `security` | 代理专注于安全相关 |
| `test` | 代理处理测试工作 |
| `cpp` | 代理专注于 C/C++ |
| `ui` | 代理处理 UI/UX 工作 |
| `planning` | 代理进行规划或分析 |
| `debug` | 代理专注于调试 |
| `meta` | 代理处理路由或编排 |
| `codebase` | 代理搜索本地代码库 |
| `research` | 代理进行外部调研 |

### 标签与别名

| | 别名（Alias） | 标签（Tag） |
|--|---------------|-------------|
| 用途 | 调用代理（`/agent search`） | 过滤代理（`/agents --tag docs`） |
| 格式 | 小写字母数字 + 连字符/下划线 | 同上 |
| 必需 | 否 | 否（但建议添加） |
| 推荐上限 | 无限制 | ≤ 8 |
| 示例 | `search`、`find` | `codebase`、`readonly`、`docs` |

### 何时不要添加标签

不要为以下情况添加标签：
- 与代理相关的每个关键词（标签不是全文索引）
- 匹配大多数代理的模糊概念（如 `helpful`）
- 与代理名称重复的标签（如名为 `oracle` 的代理不需要标签 `oracle`）

好的示例：安全审查代理使用 `security`、`review`、`readonly`
不好的示例：`security`、`sec`、`security-reviewer`、`sec-reviewer`（冗余）

### 校验

运行 `/agents validate` 检查你的标签：

```text
/agents validate
```

检查项：
- 每个标签是否有效（小写字母、数字、连字符、下划线）
- 无重复标签
- 至少有一个标签（警告）
- 不超过 8 个标签（警告）

## 别名设计规则

别名让用户可以通过替代名称调用代理：

```markdown
aliases:
  - search
  - find
  - locate
```

规则：
- 仅限小写字母、数字、连字符、下划线
- 在所有代理中必须唯一（内置 + 自定义）
- 不能与其他代理的名称匹配
- 越短越好：`fix` 优于 `fix-it-now`

常见模式：
- `search`、`find`、`locate` → explorer
- `docs`、`research`、`library` → librarian
- `arch`、`review`、`judge` → oracle
- `fix`、`implement`、`patch` → fixer

## readonly=false 指南

`readonly: false` 的代理可以修改文件。编写提示词时应：

1. **明确说明何时授权修改**

```markdown
**Constraints**:
- ONLY modify files when explicitly authorized by the user
- Do NOT claim to have modified files if you only proposed changes
```

2. **定义修改范围**

```markdown
**Scope**:
- Small, bounded changes (null checks, typo fixes, simple refactors)
- Test files when explicitly authorized
- Do NOT make architectural changes without user confirmation
```

## 校验

运行 `/agents validate` 检查你的代理是否有问题：

```text
/agents validate
```

检查项：
- Frontmatter 解析错误
- 缺少必需字段（description）
- 空的提示词正文
- 无效的别名名称
- 别名与其他代理冲突
- **标签有效性** — 每个标签必须为小写字母数字加连字符/下划线
- **标签重复** — 重复的标签会产生警告
- **标签存在性** — 没有任何标签的代理会产生警告
- **标签数量** — 超过 8 个标签会产生警告
- readonly=false 但没有修改边界约束

## 常见错误

### 别名冲突

```
❌ Alias "arch" of agent "my-agent" conflicts with alias of agent "oracle"
```

**修复**：选择一个不同的别名或删除冲突的别名。

### 无效的代理名称

代理名称必须仅包含小写字母、数字、连字符和下划线。

**修复**：将文件从 `My Agent.md` 重命名为 `my-agent.md`。

### 空的提示词正文

**修复**：在 frontmatter 的 `---` 之后添加内容：

```markdown
---
name: my-agent
description: My agent
---

You are My Agent — a specialist in [domain].
```

### readonly=false 但没有边界约束

可以修改文件的代理应明确说明何时授权修改。

**修复**：添加约束文本，如：
```markdown
**Constraints**:
- ONLY modify files when explicitly authorized by the user
- Do NOT claim to have modified files if you only proposed changes
```

### 角色过于模糊

"你的代理应该擅长一切"对委派提示词没有帮助。

**修复**：聚焦于一个狭窄的领域：
- ✅ "专注于安全漏洞的代码审查员"
- ❌ "通用的有帮助的助手"

## 覆盖内置代理

要自定义内置代理，在更高优先级的位置创建同名文件：

```bash
# 为此项目覆盖 oracle 代理
cat > .pi/slim-agents/agents/oracle.md << 'EOF'
---
description: Security-focused architecture advisor
temperature: 0.3
---
You are Oracle — a security-focused architecture advisor.

**Role**: Provide architectural guidance with security as the first priority.
...
EOF
```

你也可以使用配置覆盖：

```json
// .pi/slim-agents.json
{
  "agents": {
    "oracle": {
      "description": "Security-focused advisor",
      "temperature": 0.3,
      "appendPrompt": "Always consider security implications first."
    }
  }
}
```

## 禁用代理

通过配置禁用代理：

```json
{
  "agents": {
    "fixer": {
      "disabled": true
    }
  }
}
```

或全局禁用：

```json
{
  "disabled": ["fixer", "designer"]
}
```

## 最佳实践

1. **要具体**：清晰、详细的提示词产生更好的结果。
2. **定义约束**：告诉代理不应该做什么，而不仅仅是应该做什么。
3. **设置温度**：一致性任务用较低值（0.1），创造性任务用较高值（0.3）。
4. **使用 readonly**：将咨询类代理标记为 readonly 以防止意外修改。
5. **保持提示词精简**：代理会收到委派上下文；详细指令应放在提示词中。
6. **缩小职责范围**：专注于 "SQL 查询优化"的专家胜过"数据库专家"。

## 与 pi-lsp 的集成

对于 C/C++ 项目，`cpp-reviewer` 模板提到使用 pi-lsp 的 `lsp_diagnostics`：

```markdown
**Behavior**:
- When `lsp_diagnostics` is available, use it to supplement your review
- Reference clangd diagnostics alongside your analysis
```

这让代理可以将静态分析（你的审查）与实时编译器诊断相结合。

## 模板参考

| 模板 | readonly | 适用场景 |
|------|----------|----------|
| security-reviewer | yes | 输入验证、认证、依赖风险 |
| test-writer | no | 测试计划、测试用例 |
| doc-generator | no | README、API 文档、变更日志 |
| refactor-planner | yes | 清理计划 |
| bug-triager | yes | Bug 来源缩小 |
| release-checker | yes | 版本升级、试运行 |
| cpp-reviewer | yes | C/C++ 内存安全、CMake |

运行 `/agents templates` 查看完整的带描述列表。

### 模板命名约定

模板文件名可以以 `-template` 结尾（如 `security-reviewer.md` 或 `security-reviewer-template.md`）。
`-template` 后缀在显示时会自动剥离。

例如：
- 名为 `security-reviewer.md` 的文件变为模板 `security-reviewer`
- 名为 `cpp-reviewer-template.md` 的文件也变为模板 `cpp-reviewer`

模板文件中的 frontmatter `name` 字段按原样使用（不剥离），但如果文件名有 `-template` 后缀，frontmatter 的 name 中的 `-template` 后缀也会被剥离以匹配预期约定。
