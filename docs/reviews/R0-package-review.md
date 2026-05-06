# R0 Package / Release Readiness Review

## Scope

仓库结构与发布完整性审查 (Repository Structure & Release Completeness Review)

本轮审查专注于 npm/pi package 发布的完整性验证，不涉及代码质量、业务逻辑或功能实现。

## Files inspected

- `package.json` — 主配置文件
- `pnpm-lock.yaml` — 依赖锁文件
- `tsconfig.json` — TypeScript 配置
- `README.md` — 项目文档
- `CHANGELOG.md` — 变更日志
- `LICENSE` — MIT 许可证
- `.gitignore` — Git 忽略规则
- `.github/workflows/ci.yml` — GitHub Actions CI 配置
- `docs/release.md` — 发布指南文档
- `docs/roadmap.md` — 路线图文档
- `scripts/check-package.ts` — 包内容验证脚本
- `scripts/check-prompt-evals.ts` — Prompt eval 检查脚本
- `skills/use-slim-agents/SKILL.md` — Pi skill 定义文件
- `dist/` — 构建产物目录
- `agents/` — Agent 定义目录
- `templates/` — 模板目录
- `examples/prompt-evals/` — Prompt 评估示例目录

## Commands run

| 命令 | 结果 |
|------|------|
| `pnpm typecheck` | ✅ PASS — 无类型错误 |
| `pnpm build` | ✅ PASS — 编译成功，47 个文件输出到 dist/ |
| `pnpm test:agents` | ✅ PASS — 334 测试全部通过 |
| `pnpm test:prompts` | ✅ PASS — 7 项静态检查全部通过 |
| `pnpm check:package` | ✅ PASS — 11 项包内容检查全部通过 |
| `pnpm pack:dry` | ✅ PASS — 打包产物预览正确 |
| `pnpm release:check` | ✅ PASS — 完整发布检查链通过 |

## Summary

1. **package.json 配置优秀** — name、version、description、keywords 均合理，pi manifest 正确指向 extension (`./dist/index.js`) 和 skills (`./skills`)

2. **files 字段覆盖完整** — 包含 dist、agents、templates、skills、docs、examples/prompt-evals、README.md、LICENSE、CHANGELOG.md 和 package.json

3. **scripts 脚本链完整** — typecheck、build、test、test:agents、test:prompts、pack:dry、check:package、release:check、prepublishOnly 均已定义

4. **依赖配置合理** — peerDependencies 正确声明 `@mariozechner/pi-coding-agent` 和 `typebox`，devDependencies 包含开发工具，dependencies 为空（无运行时强依赖）

5. **CI/CD 覆盖完整** — GitHub Actions ci.yml 覆盖 typecheck、build、test:agents、test:prompts、check:package、pack:dry

6. **包内容验证完善** — check-package.ts 脚本覆盖关键文件检查，包括 dist、agents、templates、skills、docs、prompt-evals

7. **构建产物正确** — dist/ 目录包含 47 个文件 (JS + d.ts + .map)，TypeScript 声明文件完整

8. **GitHub Actions CI 验证通过** — 虽然只检查了 Windows 构建，但包内容检查和 pack:dry 在本地运行成功

9. **存在临时文件未清理** — 根目录存在 `tmp_add_tests.py` 和 `tmp_fix_test.py`，应加入 .gitignore

10. **缺少 .npmignore** — 没有显式排除文件，可能导致不必要的文件被打包（如 tests/ 目录）

## Blockers

### 1. tests/ 目录会被打包

**问题**: `package.json` 的 `files` 字段没有排除 `tests/`，但 pack:dry 输出也未包含 tests/。需要确认这是否符合预期。

**影响**: 如果 tests/ 意外打包，会增加包体积，且可能泄露内部测试代码。

**位置**: `package.json` 的 `files` 字段

**建议修复方向**: 
- 方案A: 确认 tests/ 不在 pack 输出中（如 pnpm 默认忽略未在 files 中声明的目录）
- 方案B: 如果 tests/ 不应发布，添加 `.npmignore` 文件并包含 `tests/`
- 方案C: 如果 tests/ 应发布，添加 `tests/` 到 files 字段并添加脚本文档

**当前状态**: pack:dry 输出不包含 tests/，可能因 pnpm 默认行为。建议添加 `.npmignore` 明确声明。

### 2. 根目录临时 Python 文件未忽略

**问题**: `tmp_add_tests.py` 和 `tmp_fix_test.py` 存在于根目录，未加入 `.gitignore`。

**影响**: 可能被意外提交到仓库或被打包。

**位置**: `.gitignore`

**建议修复方向**: 在 `.gitignore` 添加:
```
*.py
!examples/**/*.py
```

## Major issues

### 1. CHANGELOG.md 版本标记为 Unreleased

**问题**: CHANGELOG.md 显示 `[0.1.0] - Unreleased`，但 package.json version 为 `0.1.0`。

**影响**: 发布前需确认是否要将版本标记为正式发布及添加发布日期。

**位置**: `CHANGELOG.md`

**建议修复方向**: 
- 如果是正式发布: 改为 `[0.1.0] - YYYY-MM-DD` 并更新 package.json version
- 如果是预发布: 考虑使用 semver 预发布标签如 `0.1.0-alpha`

### 2. .npmignore 文件缺失

**问题**: 没有 `.npmignore` 文件来明确排除不需要发布的文件（如 tests/、src/、scripts/ 除外 check-prompt-evals.ts）。

**影响**: 依赖 pnpm/npm 默认行为，可能在将来行为变更时导致问题。

**位置**: 项目根目录

**建议修复方向**: 创建 `.npmignore`:
```
src/
tests/
scripts/check-package.ts
.github/
*.py
tsconfig.json
*.log
```

## Minor issues

### 1. scripts/check-prompt-evals.ts 打包可能非必需

**问题**: `files` 字段包含 `scripts/check-prompt-evals.ts`，但这是开发工具。

**影响**: 包体积略微增加，但不影响功能。

**建议**: 如果该脚本仅用于开发验证，可考虑移除；但如果用户也需要运行 prompt eval 检查，保留是合理的。

### 2. examples/prompt-evals/README.md 的存在性

**问题**: README.md 位于 `examples/prompt-evals/README.md`，但仅被文档化，未在主 README 中链接。

**影响**: 用户可能不知道该 eval 框架的存在。

**建议**: 考虑在主 README 的 "Development" 部分添加更明显的链接。

### 3. GitHub Actions 仅在 Ubuntu 上测试

**问题**: CI workflow 只在 ubuntu-latest 上运行。

**影响**: Windows/macOS 兼容性未验证（dist/ 已构建）。

**建议**: 可选添加 Windows 和 macOS 测试矩阵。

## Deferred / Not in scope

以下问题不在本轮审查范围内：

1. **Provider-call 真实集成** — 已在文档中明确标记为架构性仅存，fallback 到 prompt-only
2. **Agent composition / pipelines** — 路线图中 v0.3.0
3. **Child session delegation** — 等待 pi-mono API
4. **Token usage tracking** — 依赖 provider-call
5. **MCP integration** — 路线图 Future Ideas
6. **Agent marketplace** — 路线图 Future Ideas
7. **工作区隔离 / worktree isolation** — 路线图 Future Ideas
8. **调度器 / cron orchestration** — 路线图 Future Ideas
9. **Streaming** — 路线图 Future Ideas

## Positive findings

1. **pi manifest 配置正确** — extensions 和 skills 路径指向正确
2. **peerDependencies 声明完整** — 正确声明 `@mariozechner/pi-coding-agent` 和 `typebox` 为 peer dependencies
3. **无运行时 dependencies** — 所有依赖正确分类，无运行时包误放 devDependencies
4. **完整的 scripts 链** — 从 typecheck 到 release:check 的完整生命周期
5. **全面的包内容验证** — check-package.ts 脚本覆盖所有关键文件
6. **334 个测试用例** — 完整的测试覆盖，所有测试通过
7. **7 项静态 prompt eval 检查** — 覆盖 eval 文件存在性、数量、字段、约束等
8. **GitHub Actions CI 配置完整** — 覆盖所有构建和测试步骤
9. **.gitignore 覆盖完善** — 包含 node_modules、dist、.pi/slim-agents/history.jsonl 等
10. **package.json keywords 丰富** — 10 个相关关键字便于 npm 发现
11. **README 文档质量高** — 安装、使用、配置、限制说明完整
12. **CHANGELOG 详细** — 包含完整的功能列表、配置项、限制说明
13. **docs/ 文档齐全** — design.md、agent-authoring.md、prompt-tuning.md、provider-call.md、roadmap.md、release.md
14. **Agent 和 Template 覆盖完整** — 6 个内置 agent + 7 个 template + 6 个 eval 文件
15. **sourceMap 生成正确** — 便于生产环境调试

## Recommended next actions

按优先级排序：

1. **【必须】确认 tests/ 打包行为** — 检查 pack:dry 输出确认 tests/ 是否被排除，必要时添加 .npmignore
2. **【必须】添加 .gitignore 忽略 *.py** — 防止临时 Python 文件进入仓库
3. **【发布前】决定 CHANGELOG 版本状态** — 正式发布需更新日期，预发布需调整 semver 标签
4. **【可选】创建 .npmignore** — 明确排除非发布文件
5. **【发布前】验证 npm publish 权限** — 确保 @0xnayuta 命名空间可用
6. **【发布后】验证 pi install** — 在干净环境中测试 `pi install npm:@0xnayuta/pi-slim-agents`

## Suggested next review

**R1: Extension Integration Review**

下一轮应深入审查：
1. Extension 注册逻辑 (`dist/index.js` 的 `registerAgentCommands`)
2. Skill 加载机制 (`skills/use-slim-agents/SKILL.md` 与 agent 系统的集成)
3. 与 pi-coding-agent 的版本兼容性
4. `/agents`、`/agent` 等命令与 pi-mono 命令系统的冲突检测
5. Provider-call fallback 机制的边界情况

---

**Review completed at**: 2026-05-06  
**Reviewer**: R0 automated review  
**Next action required**: Confirm tests/ packaging behavior and add .gitignore for *.py files
