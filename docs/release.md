# 发布指南

本文档介绍 pi-slim-agents 的发布流程。

## 发布前检查清单

在发布到 npm 之前，请按照此检查清单逐项检查：

### 1. 清理 git 状态

```bash
git status
```

确认：
- 无未提交的更改（或已暂存的预期更改）
- 无本地历史文件已提交（`.pi/slim-agents/history.jsonl`）
- 工作区中无敏感数据

### 2. 运行完整的发布检查

```bash
pnpm release:check
```

这将依次运行：
1. `pnpm typecheck` — TypeScript 类型检查
2. `pnpm build` — 编译 TypeScript 到 dist/
3. `pnpm test:agents` — 单元测试（362 个测试）
4. `pnpm test:prompts` — 提示词评估静态检查（7 项检查）
5. `pnpm check:package` — 包内容验证（13 项检查）
6. `pnpm pack:dry` — npm pack 试运行

### 3. 验证 npm 登录

```bash
npm whoami
```

必须以 `@0xnayuta` 身份登录。

### 4. 检查包内容（试运行）

```bash
pnpm pack:dry
```

确认以下内容已包含：
- `dist/` — 编译后的 TypeScript
- `agents/` — 6 个内置代理文件
- `templates/` — 7 个模板文件
- `skills/` — 技能定义
- `docs/` — 文档
- `examples/prompt-evals/` — 评估示例
- `README.md`、`LICENSE`、`CHANGELOG.md`、`package.json`

确认以下内容已排除：
- `tests/`
- `src/`
- `.github/`
- `.pi/`
- `history.jsonl`
- `.env`

### 5. 审查 CHANGELOG.md

确认：
- 所有 M13 变更已记录
- 版本已设为发布日期（`[0.1.0] - YYYY-MM-DD`）
- 没有将未来功能记录为已完成

### 6. 验证 dist/ 内容

```bash
ls dist/
```

应包含：
- `index.js`（主入口）
- `index.d.ts`（类型声明）
- 所有源模块的 `.js` 和 `.d.ts` 文件

## 版本更新

### 更新 package.json 中的版本

```json
{
  "version": "0.1.0"
}
```

### 更新 CHANGELOG.md

从：
```markdown
## [0.1.0] - Unreleased
```

改为：
```markdown
## [0.1.0] - 2026-05-06
```

添加发布日期。

## 发布

### npm 登录验证

```bash
npm whoami
```

如果未登录：
```bash
npm login
```

### 发布到 npm

对于作用域包，必须设置访问级别：

```bash
npm publish --access public
```

这将发布到：
- https://www.npmjs.com/package/@0xnayuta/pi-slim-agents

### 验证发布

```bash
npm view @0xnayuta/pi-slim-agents
```

应显示：
- 包名
- 最新版本
- 描述
- 仓库 URL

## 发布后验证

### 从 npm 安装

```bash
pi install npm:@0xnayuta/pi-slim-agents
```

### 测试基本功能

```text
/agents
```

应显示 6 个内置代理。

### 冒烟测试命令

```text
/agent explorer find where agents are loaded
/agents validate
/agents status
/agents templates
/agents history
/agents metrics
```

### 测试委派

```text
/agent oracle review this design
```

应显示委派结果（提示词-only 模式）。

### 校验代理

```text
/agents validate
```

应通过所有校验检查。

### JSON 输出测试

```text
/agents --format json
/agent --format json explorer test task
/agents status --format json
```

## GitHub 发布

### 创建 git 标签

```bash
git tag v0.1.0
```

### 推送标签到远程

```bash
git push origin v0.1.0
```

### 创建 GitHub 发布

1. 前往 https://github.com/0xnayuta/pi-slim-agents/releases/new
2. 选择 `v0.1.0` 标签
3. 标题：`v0.1.0`
4. 复制 CHANGELOG.md 中此版本的内容

### 发布说明模板

```markdown
## What's Changed

<!-- 从 CHANGELOG.md [0.1.0] 部分复制 -->

## v0.1.0 Supported Features

- 6 个内置轻量代理：explorer、librarian、oracle、fixer、designer、orchestrator
- `/agent` 快捷命令，带 `--mode` 标志（quick、normal、deep）
- 代理别名（search→explorer、arch→oracle 等）
- 7 个模板：security-reviewer、test-writer、doc-generator、refactor-planner、bug-triager、release-checker、cpp-reviewer
- 标签、过滤器、正则、查询搜索
- 所有命令支持 JSON 输出
- 历史记录、指标、重放
- 启用/禁用配置
- 持久化历史记录（可选）

## ⚠️ Known Limitations

- 提供商调用（Provider-call）**仅为架构设计** — 回退为提示词-only
- 实际模型调用等待 pi-mono ExtensionAPI

## Installation

```bash
pi install npm:@0xnayuta/pi-slim-agents
```

**Full Changelog**: https://github.com/0xnayuta/pi-slim-agents/compare/v0.0.1...v0.1.0
```

## 回滚 / 热修复

### 如果出现问题

1. 不要删除 npm 发布（npm 不允许立即取消发布）

2. 如果是严重 bug：发布补丁版本

```bash
# 修复 bug
git checkout -b fix/<issue>

# 更新版本为补丁版本
# 编辑 package.json: "version": "0.1.1"

# 更新 CHANGELOG.md
git add CHANGELOG.md package.json
git commit -m "fix: <description>"

# 发布
npm publish --access public
```

3. 在 CHANGELOG.md 中记录问题

### 如果 npm 发布失败

检查错误消息：
- `E403` — 未授权，检查 npm 登录
- `E409` — 版本已存在，递增版本号
- `E401` — 认证失败，重新运行 `npm login`

## 重要注意事项

### 不要

- 在 npm 包中发布 API 密钥或密钥
- 提交本地历史记录（`.pi/slim-agents/history.jsonl`）
- 将开发中标记为稳定的功能发布
- 将提供商调用标记为稳定（它仍然仅作为回退）
- 在 git 状态不干净时发布（有未提交的更改）

### 要

- 保持提示词-only 作为稳定的默认值
- 清楚记录提供商调用的限制
- 正确使用 semver（major.minor.patch）
- 每次发布前更新 CHANGELOG.md
- 发布前在本地测试

## CI/CD

本项目使用 GitHub Actions 进行 CI。参见 [.github/workflows/ci.yml](.github/workflows/ci.yml)。

CI 在以下情况下运行：
- 每次推送到 main/master
- 每次到 main/master 的拉取请求

CI 配置：
- **Node.js**：24（GitHub Actions 运行时）
- **pnpm**：10.32.0（通过 `pnpm/action-setup@v4` 的 `version` 和 `package.json` 的 `packageManager` 锁定）
- **pnpm 缓存**：通过 `actions/cache@v4` 手动缓存 pnpm store
- **Lockfile**：CI 中使用 `--no-frozen-lockfile`（允许 PR 中更新 lockfile）

### pnpm 版本要求

本项目要求 **pnpm >= 10.26.0**，因为 `pnpm pack --dry-run` 在 pnpm 10.26.0 中引入。

推荐的 pnpm 版本是 **10.32.0**，与 `package.json` 的 `packageManager` 字段匹配。

CI 在设置期间打印 `pnpm --version` 以验证使用了正确的版本。

CI 步骤：
1. 设置 Node.js 24
2. 启用 corepack
3. 设置 pnpm（不自动安装）
4. 获取并缓存 pnpm store 路径
5. 安装依赖
6. TypeScript 类型检查
7. 构建
8. 运行测试（agents + prompts）
9. 检查包内容
10. 试运行打包（`pnpm pack --dry-run`）

CI 不会自动发布到 npm。需要手动发布。
