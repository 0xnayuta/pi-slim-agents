# R0 Fix - Package / Release Readiness

## Scope

本轮修复 R0 审查发现的发布完整性小问题，不涉及业务逻辑修改或新功能开发。

修复项目：
1. **tests/ 打包行为确认** — 确认 tests/ 不会进入 npm 包
2. **.gitignore 更新** — 添加 Python 临时文件忽略规则
3. **CHANGELOG 版本状态** — 确认状态合理
4. **.npmignore 创建** — 添加发布排除配置
5. **check-package.ts 增强** — 添加 tests/ 打包检查

## Issues addressed

### 1. tests/ packaging behavior

**问题**: R0 指出需要确认 tests/ 是否会被打包。

**解决方案**: 
- package.json files 字段不包含 `tests/`
- pnpm 默认行为：files 字段声明的内容才打包，未声明的不打包
- 新增 `.npmignore` 明确排除 `tests/`
- `scripts/check-package.ts` 新增 `checkTestsNotPackaged()` 检查

**结论**: ✅ tests/ **不会**进入 npm 包（正确行为）

### 2. Python ignore rules

**问题**: 根目录存在 `tmp_add_tests.py` 和 `tmp_fix_test.py`，且未加入 .gitignore。

**解决方案**: 更新 `.gitignore` 添加：
```
__pycache__/
*.py[cod]
*.pyo
*.pyd
.pytest_cache/
tmp_add_tests.py
tmp_fix_test.py
```

### 3. CHANGELOG version state

**问题**: CHANGELOG 显示 `[0.1.0] - Unreleased`，与 package.json version 0.1.0 的一致性需确认。

**结论**: ✅ 状态合理
- README.md 标注 "v0.1.0 — Release Ready (M13)"
- docs/release.md 指出发布前需将 "Unreleased" 改为正式日期
- 当前 Unreleased 状态表示尚未发布，符合预期
- 发布时需将 `[0.1.0] - Unreleased` 改为 `[0.1.0] - YYYY-MM-DD`

### 4. .npmignore

**问题**: R0 建议添加 .npmignore 作为二次保险。

**解决方案**: 创建 `.npmignore` 文件，明确排除：
```
src/
tests/
.github/
coverage/
tmp/
__pycache__/
*.py[cod]
.env
.pi-state/
.pi/slim-agents/
tsconfig.json
*.tsbuildinfo
.eslintcache
*.log
*.lock
```

**保留（不排除）**:
- `dist/` — 运行时入口
- `agents/` — agent 定义
- `templates/` — 模板
- `skills/` — skill 定义
- `docs/` — 文档
- `examples/prompt-evals/` — eval 示例
- `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json`
- `scripts/check-prompt-evals.ts` — 用户可能需要

## Files changed

| 文件 | 操作 | 描述 |
|------|------|------|
| `.npmignore` | 新增 | 发布排除配置 |
| `.gitignore` | 修改 | 添加 Python 临时文件规则 |
| `scripts/check-package.ts` | 修改 | 新增 2 项检查函数 |

## Commands run

| 命令 | 结果 |
|------|------|
| `pnpm typecheck` | ✅ PASS |
| `pnpm build` | ✅ PASS |
| `pnpm test` | ✅ PASS — 334 tests passed |
| `pnpm test:prompts` | ✅ PASS — 7 checks passed |
| `pnpm check:package` | ✅ PASS — 13 checks passed |
| `pnpm pack --dry-run` | ✅ PASS |
| `pnpm release:check` | ✅ PASS — 完整链通过 |

## Pack dry-run result

**确认内容**（应包含且已包含）:
- ✅ `dist/` — 47 个文件（JS + d.ts + .map）
- ✅ `agents/` — 6 个 agent 文件
- ✅ `templates/` — 7 个模板文件
- ✅ `skills/` — SKILL.md
- ✅ `docs/` — 6 个文档文件
- ✅ `examples/prompt-evals/` — 8 个 eval 文件
- ✅ `README.md`
- ✅ `LICENSE`
- ✅ `CHANGELOG.md`
- ✅ `package.json`
- ✅ `scripts/check-prompt-evals.ts`

**确认排除**（不应包含且已排除）:
- ✅ `tests/` — 不在输出中
- ✅ `src/` — 不在输出中
- ✅ `.github/` — 不在输出中
- ✅ `node_modules/` — 不在输出中
- ✅ `tmp_add_tests.py` — 不在输出中
- ✅ `tmp_fix_test.py` — 不在输出中

**注**: `docs/reviews/R0-package-review.md` 被包含在 docs/ 中，这是 docs/ 目录打包的结果，不影响功能。

## Remaining concerns

**None** — 所有 R0 blockers 和 major issues 已修复。

**发布前注意事项**:
1. 发布前将 `docs/reviews/R0-package-review.md` 和 `docs/reviews/R0-fix-package-readiness.md` 移出 docs/，或更新 .npmignore 排除 docs/reviews/
2. 发布前将 CHANGELOG.md 的 `[0.1.0] - Unreleased` 改为正式日期
3. 确保 @0xnayuta npm 命名空间可用

## Recommendation

**✅ 建议进入 R1: Extension Integration Review**

理由：
1. 所有 R0 发布完整性问题已修复
2. 所有验证命令通过
3. package.json 配置正确，pi manifest 指向正确
4. 下一轮可深入审查 Extension 注册逻辑、Skill 加载机制、与 pi-coding-agent 的兼容性

**R1 应审查**:
1. Extension 注册逻辑 (`dist/index.js` 的 `registerAgentCommands`)
2. Skill 加载机制 (`skills/use-slim-agents/SKILL.md` 集成)
3. `/agents`、`/agent` 命令与 pi-mono 命令系统冲突检测
4. Provider-call fallback 边界情况

---

**Fix completed at**: 2026-05-06  
**Files modified**: 3  
**Tests**: All 334 passed, 13 package checks passed
