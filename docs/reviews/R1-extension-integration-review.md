# R1 Extension Integration Review

## Scope

Extension 集成审查，重点关注：
1. Extension 入口和初始化
2. 命令注册和冲突检测
3. 工具注册 (delegate_agent)
4. Hook / routing hint 注入
5. 状态管理生命周期
6. 错误隔离和边界处理
7. pi-mono 集成一致性
8. 安全和隐私

## Files inspected

- `src/index.ts` — Extension 入口，注册命令和工具
- `src/types.ts` — 核心类型定义
- `src/config.ts` — 配置加载和合并
- `src/runner.ts` — Delegation runner (prompt-only 和 provider-call)
- `src/agents.ts` — Agent 加载和解析
- `src/commands.ts` — 命令参数解析和 replay
- `src/templates.ts` — 模板加载和创建
- `src/history.ts` — History store 和 metrics
- `src/status.ts` — Status 报告和 reload
- `src/provider-runner.ts` — Provider-call runner
- `src/format.ts` — JSON 格式化层
- `src/output-template.ts` — Output template 生成
- `src/utils.ts` — 工具函数
- `package.json` — pi manifest 配置
- `skills/use-slim-agents/SKILL.md` — Skill 定义
- `docs/design.md` — 架构设计文档

## Commands run

| 命令 | 结果 |
|------|------|
| `pnpm typecheck` | ✅ PASS — 无类型错误 |
| `pnpm test` | ✅ PASS — 334 tests passed |

## Summary

1. **Extension 入口设计合理** — 使用 `slimAgentsExtension(pi: ExtensionAPI)` 工厂函数，session_start 初始化清晰，配置和 agents 在会话启动时加载。

2. **命令注册结构良好** — 主命令 `/agents` 带子命令分发，10 个 standalone fallback 命令，参数解析集中到 `parseFlags`。

3. **工具注册 (delegate_agent) 完整** — Typebox schema 定义准确，参数校验完善，unknown/disabled agent 处理正确。

4. **Routing hint 注入简洁** — before_agent_start hook 注入简短 routing hints，不包含完整 agent prompt。

5. **状态管理可接受** — History/metrics 记录在内存，persistent 可选配置，reload 返回新状态供调用者应用。

6. **存在未捕获异常风险** — delegate_agent execute 方法缺少 try/catch，provider-runner 某些路径可能抛出未处理异常。

7. **sourcePath metadata 泄露绝对路径** — JSON 输出包含完整文件系统路径。

8. **Routing hint 不考虑 disabled agents** — 即使 agent 被禁用，routing hint 仍列出其功能。

9. **provider-call 架构正确但不稳定** — pi-ai 动态导入有 fallback，但 error handling 可以更健壮。

10. **整体安全性良好** — API key sanitization 完善，没有记录完整 prompt，但路径泄露需要注意。

## Blockers

### 1. delegate_agent execute 方法缺少异常处理

**问题**: `src/index.ts` 中 `delegate_agent` 工具的 `execute` 方法直接调用 `runAndRecordDelegation`，没有 try/catch 包裹。

**影响**: 如果 `runAndRecordDelegation` 抛出未捕获异常，会导致整个 extension 处理链中断，可能影响 pi-mono 会话稳定性。

**位置**: `src/index.ts` - `delegate_agent.execute` 函数

**建议修复方向**:
```typescript
async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
  try {
    const result = await runAndRecordDelegation(...);
    // ...
  } catch (err) {
    return {
      content: [{ type: 'text', text: `❌ Delegation error: ${err instanceof Error ? err.message : String(err)}` }],
      details: { error: 'Internal error during delegation' },
    };
  }
}
```

### 2. sourcePath metadata 泄露用户项目路径

**问题**: JSON 输出 (agents list, templates, status) 包含 `metadata.sourcePath`，这是完整文件系统路径。

**影响**: 在多租户或敏感项目环境中，绝对路径泄露可能造成安全隐患。

**位置**: `src/agents.ts` 的 `collectFileMetadata` 调用，`src/metadata.ts` 的 `collectFileMetadata` 函数

**建议修复方向**:
- 方案A: 在 JSON 输出中不包含 sourcePath (breaking change for consumers)
- 方案B: 使用相对路径代替绝对路径 (更安全但可能影响调试)
- 方案C: 在 JSON 响应中明确标记 sourcePath 为敏感信息，让消费者自行处理

## Major issues

### 3. Routing hint 不考虑 disabled agents

**问题**: `before_agent_start` hook 注入的 routing hint 总是列出所有 agent 的职责，没有检查 agent 是否被禁用。

**影响**: 用户可能尝试使用被禁用的 agent，导致不必要的错误。

**位置**: `src/index.ts` - `pi.on('before_agent_start', ...)`

**建议修复方向**:
- 在 routing hint 中只列出 `enabled` 的 agents
- 或者在注入前检查当前配置的 agents 启用状态

### 4. provider-runner 中 pi-ai 导入错误处理不完整

**问题**: `provider-runner.ts` 使用动态 import 尝试加载 `@mariozechner/pi-ai`，错误处理捕获了异常但 `_piAiLoadError` 可能包含敏感信息。

**影响**: 如果 import 失败，错误消息可能包含模块路径或版本信息。

**位置**: `src/provider-runner.ts` - `getPiAiComplete()` 函数

**建议修复方向**:
```typescript
catch (err) {
  _piAiLoadError = 'pi-ai module not available'; // 不包含具体错误
}
```

### 5. createAgentFromTemplate 目录创建错误处理不完整

**问题**: `templates.ts` 中 `fs.mkdirSync` 调用缺少错误处理，如果权限不足会抛出未捕获异常。

**影响**: 可能导致 extension 会话中断。

**位置**: `src/templates.ts` - `createAgentFromTemplate` 函数

**建议修复方向**: 包裹 try/catch

### 6. Persistent history 错误静默失败

**问题**: `history.ts` 中 persistent history 操作的错误被静默捕获 (console.warn)，但可能需要更明显的错误指示。

**影响**: 用户可能不知道 persistent history 写入失败，导致数据丢失。

**位置**: `src/history.ts` - `appendToDisk`, `loadFromDisk`, `rewriteDisk`

**建议修复方向**: 考虑在 status 中显示 persistent history 状态

## Minor issues

### 7. README npm 发布说明过期

**问题**: README.md 中 npm 安装说明包含 "> **Note**: npm publication is pending."，需要更新。

**影响**: 用户可能认为包未发布而跳过 npm 安装。

**位置**: `README.md` - "npm (after release)" 部分

**建议**: 在正式发布时移除 "pending" 标注

### 8. docs/release.md 包含硬编码日期

**问题**: docs/release.md 中包含示例日期 "2026-05-06"，用户在发布时需要替换。

**影响**: 如果用户直接复制文档可能使用错误日期。

**位置**: `docs/release.md` - "Update CHANGELOG.md" 部分

**建议**: 将硬编码日期改为 YYYY-MM-DD 占位符

### 9. Standalone fallback 命令与子命令可能冲突

**问题**: 同时注册 `/agents-status` 和 `/agents status`，以及类似的命令对。

**影响**: 如果 pi-mono 命令解析有歧义，可能导致意外行为。

**位置**: `src/index.ts` - 命令注册部分

**建议**: 考虑只保留一种风格（推荐只保留子命令风格，移除 standalone）

### 10. provider-call fallback 消息可能误导用户

**问题**: 当 provider-call fallback 时，输出消息说 "fallback to prompt-only"，但没有明确说明这是架构限制还是配置问题。

**影响**: 用户可能认为配置错误或应该启用 provider-call。

**位置**: `src/provider-runner.ts` - `buildFallbackResult`

**建议**: 明确标注 "Provider-call not available in current environment (pi-ai dependency not importable)"

## Integration risks

### 1. pi-mono ExtensionAPI 版本兼容性

**风险**: `ExtensionAPI` 类型来自 `@mariozechner/pi-coding-agent` 的 peer dependency。

**说明**: 当前声明 `"@mariozechner/pi-coding-agent": "*"` 作为 peer dependency，如果 pi-coding-agent API 变更，可能导致兼容性问题。

**缓解**: 建议在 peerDependencies 中锁定主版本号 `^0.73.0` 或更明确的兼容性范围

### 2. provider-call 依赖未声明的内部 API

**风险**: `provider-runner.ts` 依赖 `ctx.modelRegistry.getApiKeyAndHeaders()`，这是 pi-coding-agent 的内部 API。

**说明**: 这个 API 不是公开 API，如果 pi-coding-agent 重构可能导致 provider-call 功能失效。

**缓解**: 已实现 fallback 机制，当 API 不可用时回退到 prompt-only

### 3. Session 状态隔离

**风险**: 使用模块级 singleton `historyStore`，如果多个 pi-mono 会话运行在同一个进程，可能共享状态。

**说明**: 对于 pi 的使用模式，这可能是预期行为。

**缓解**: 需要确认 pi-mono 是否支持多会话/多项目隔离

## Security / privacy concerns

### 1. 路径泄露 (已作为 Blocker 报告)

### 2. history export 可能包含敏感上下文

**问题**: `history.exportJson` 只移除 `fullTask/fullContext/fullFiles`，但 `taskSummary` 可能包含敏感信息。

**缓解**: taskSummary 已截断到 80 字符，降低风险

### 3. Replay 可能重新执行敏感任务

**问题**: Replay 功能可以重新执行历史 delegation，包括原始 task。

**说明**: 这是预期功能，用户应该自己控制。

### 4. Agent 文件读取权限

**问题**: `loadAgents` 和相关函数使用 `fs.readFileSync` 读取任意 `.md` 文件。

**缓解**: 已通过 `isSafeAgentName` 验证文件名，阻止路径穿越

### 5. Regex DoS 风险

**问题**: `--regex` 功能接受用户输入的 regex pattern。

**缓解**: 
- 没有预编译的复杂 regex 限制
- 没有超时机制
- 建议在高流量环境中添加 regex 超时保护

## Deferred / Not in scope

以下问题不在本轮审查范围：

1. **Provider-call real integration** — 架构已就位，需要 pi-mono ExtensionAPI 支持
2. **Token usage tracking** — 需要真实 provider-call 集成
3. **Agent composition / pipelines** — 路线图 v0.3.0
4. **Child session delegation** — 等待 pi-mono API
5. **Prompt tuning** — 属于 R3 或单独审查
6. **CI/CD 增强 (Windows/macOS)** — R0 已提及
7. **pi install 验证** — 发布后验证

## Positive findings

1. **Extension 入口清晰** — `slimAgentsExtension` 工厂函数，session_start 初始化
2. **命令结构良好** — 主命令 + 子命令分发模式
3. **Typebox schema 准确** — delegate_agent 参数定义完整
4. **API key sanitization** — `sanitizeJsonText` 防止 key 泄露
5. **History privacy** — export/JSON 输出剥离敏感字段
6. **Agent name 安全性** — `isSafeAgentName` 验证文件名
7. **Error messages 清晰** — UNKNOWN_AGENT, AGENT_DISABLED 等错误码
8. **Fallback 机制完善** — provider-call 不可用时优雅降级
9. **Routing hint 简洁** — 不注入完整 prompt
10. **reload 原子化** — 返回新状态，调用者控制应用

## Recommended next actions

按优先级排序：

1. **【必须】添加 delegate_agent execute 异常处理** — 防止未捕获异常影响会话
2. **【必须】决定 sourcePath 在 JSON 中的策略** — 完全移除、相对路径或显式标记为敏感
3. **【必须】修复 mkdirSync 错误处理** — createAgentFromTemplate 需要 try/catch
4. **【强烈建议】修复 Routing hint disabled agents** — 只列出启用的 agents
5. **【强烈建议】清理 pi-ai 导入错误消息** — 移除敏感信息
6. **【建议】README npm 说明更新** — 移除 "pending" 标注
7. **【建议】考虑移除 standalone 命令** — 只保留子命令风格
8. **【可选】添加 regex 超时保护** — 防止 DoS

## Suggested next review

**R2: Agent / Template Loading and Config Review**

如果 Blocker 2 (sourcePath 泄露) 和 Blocker 3 (mkdirSync) 已修复，建议进入 R2。

R2 应审查：
1. Agent 文件加载安全性 (路径穿越、符号链接等)
2. Template 创建安全性 (目录覆盖、权限等)
3. Config schema validation
4. Agent/Templates 重载一致性
5. 多源 agent 冲突处理

---

**Review completed at**: 2026-05-06  
**Reviewer**: R1 Extension Integration Review  
**Next action required**: Fix Blocker 1 (delegate_agent exception handling) and Blocker 2 (sourcePath in JSON)
