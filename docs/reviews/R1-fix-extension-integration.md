# R1 Fix - Extension Integration

## Scope

本轮修复 R1 审查发现的 Blockers 和 Major Issues：
1. delegate_agent execute 未捕获异常 (Blocker 1)
2. sourcePath metadata 泄露完整路径 (Blocker 2)
3. Routing hint 不考虑 disabled agents (Major 3)
4. provider-call 错误消息脱敏 (Major 4)
5. createAgentFromTemplate 目录创建错误处理 (Major 5)
6. Persistent history warning 可见性 (Major 6)

## Issues addressed

### 1. delegate_agent execute exception handling (Blocker 1)

**修复内容**:
- 在 `src/index.ts` 的 `delegate_agent.execute` 方法周围添加了完整的 try/catch
- 捕获所有异常并转为结构化错误响应
- 错误消息经过 `sanitizeErrorMessage()` 脱敏处理
- 即使发生异常，也会尝试记录 history（status='error'）
- 不再暴露 stack trace 给用户

**关键代码变更**:
```typescript
async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
  try {
    // ... delegation logic ...
  } catch (err) {
    const sanitizedError = sanitizeErrorMessage(err);
    // 记录 history 并返回安全错误
    return {
      content: [{ type: 'text', text: `❌ Delegation error: ${sanitizedError}` }],
      details: { error: sanitizedError, code: 'DELEGATION_EXECUTION_ERROR' },
    };
  }
}
```

### 2. sourcePath metadata privacy (Blocker 2)

**修复内容**:
- 在 `src/security.ts` 新增 `safeDisplayPath()` 函数
- 在 `src/metadata.ts` 中：
  - 新增 `FileMetadata.sourcePathKind` 字段：`builtin | project | user | external`
  - `collectFileMetadata()` 改为 `collectFileMetadataWithContext()`
  - 自动检测路径类型并返回安全显示路径
  - builtin: 包内相对路径（如 `agents/oracle.md`）
  - project: 相对于 cwd 的路径（如 `.pi/slim-agents/agents/foo.md`）
  - user: 使用 `~` 缩写（如 `~/.pi/agent/...`）
  - external: 仅 basename

**关键变更**:
```typescript
export interface FileMetadata {
  sourcePath: string;  // Safe display path (never absolute user paths)
  sourcePathKind: 'builtin' | 'project' | 'user' | 'external';
  createdAt: string | null;
  lastModified: string | null;
  sizeBytes: number | null;
}
```

### 3. Routing hint enabled-only (Major 3)

**修复内容**:
- 修改 `src/index.ts` 中的 `before_agent_start` hook
- 改为动态生成 routing hint，基于当前 enabled agents
- 只包含启用的 agents，disabled agents 不出现在 hint 中
- templates 不会出现在默认 routing hint 中
- reload 后自动更新

**关键代码变更**:
```typescript
function buildRoutingHint(): string {
  try {
    const agents = loadAgents(cwd, config);
    const enabledAgents = agents.filter(a => a.enabled);
    if (enabledAgents.length === 0) return '';
    const hints = enabledAgents.map(a => `${a.name}=${a.role}`);
    return `\n\nSlim agents routing hints: ${hints.join('; ')}.`;
  } catch {
    return ''; // 静默失败，不中断 hook
  }
}

pi.on('before_agent_start', async event => ({
  systemPrompt: `${event.systemPrompt}${buildRoutingHint()}`,
}));
```

### 4. provider-call error sanitization (Major 4)

**修复内容**:
- 在 `src/security.ts` 新增 `sanitizeErrorMessage()` 和 `getProviderUnavailableReason()`
- 在 `src/provider-runner.ts` 中：
  - `_piAiLoadError` 改为 `_piAiLoadErrorType`（仅存储类型）
  - 使用 `getProviderUnavailableReason()` 返回用户友好的安全消息
  - 所有 error 输出经过 `sanitizeErrorMessage()` 脱敏
  - 不再暴露完整模块路径、API keys、stack traces

**关键变更**:
```typescript
// 错误类型常量
type _piAiLoadErrorType = 'PI_AI_IMPORT_FAILED' | 'PI_AI_NO_COMPLETE' | ...

export function getProviderUnavailableReason(errorType?: string): string {
  switch (errorType) {
    case 'PI_AI_IMPORT_FAILED':
      return 'Provider-call unavailable: pi-ai module not importable';
    case 'PI_AI_NO_COMPLETE':
      return 'Provider-call unavailable: pi-ai does not export complete()';
    // ...
  }
}
```

### 5. createAgentFromTemplate mkdir/write error handling (Major 5)

**修复内容**:
- 在 `src/templates.ts` 中：
  - mkdir 操作错误有清晰的错误消息
  - 写入文件错误使用 `sanitizeErrorMessage()` 脱敏
  - 目录创建失败时不再继续写文件
  - 返回 `displayPath`（安全显示路径）和 `filePath`（绝对路径）
  - 用户面向输出使用 `displayPath`

**关键变更**:
```typescript
export interface CreateResult {
  ok: boolean;
  filePath?: string;  // Absolute path for testing
  displayPath?: string;  // Safe path for user-facing output
  error?: string;
  warnings?: string[];
}

// 在错误消息中使用 safe display path
const fileSafePath = safeDisplayPath(targetPath, cwd);
return {
  error: `Failed to write agent file "${fileSafePath}": ${sanitizedError}`,
};
```

### 6. Persistent history warning visibility (Major 6)

**修复内容**:
- 在 `src/history.ts` 中：
  - 新增 `lastWarning` 私有字段存储最后一次警告
  - 新增 `getLastWarning()` 方法
  - 新增 `getPersistentStatus()` 方法
  - `appendToDisk()` 和 `rewriteDisk()` 失败时记录 warning
- 在 `src/status.ts` 中：
  - `StatusReport` 新增 `persistentHistory` 字段
  - `formatStatusReport()` 显示 persistent history 状态和最后警告

**关键变更**:
```typescript
// history.ts
class HistoryStore {
  private lastWarning: { message: string; timestamp: number } | null = null;
  
  getPersistentStatus() {
    return {
      enabled: this.persistent,
      path: this.persistent ? this.persistentPath : undefined,
      lastWarning: this.lastWarning?.message,
    };
  }
}

// status.ts
export interface StatusReport {
  // ...
  persistentHistory: {
    enabled: boolean;
    lastWarning: string | null;
  };
}
```

## Files changed

| 文件 | 操作 | 描述 |
|------|------|------|
| `src/security.ts` | 新增 | 安全工具函数模块 |
| `src/metadata.ts` | 修改 | sourcePathKind 字段、安全路径处理 |
| `src/provider-runner.ts` | 修改 | 错误消息脱敏 |
| `src/templates.ts` | 修改 | CreateResult 接口、错误处理、displayPath |
| `src/history.ts` | 修改 | persistent history warning 可见性 |
| `src/status.ts` | 修改 | StatusReport 包含 persistentHistory |
| `src/index.ts` | 修改 | delegate_agent try/catch、routing hint enabled-only |

## Tests added or updated

- 所有现有测试继续通过（334 tests passed）
- 无需修改现有测试

## Commands run

| 命令 | 结果 |
|------|------|
| `pnpm typecheck` | ✅ PASS |
| `pnpm build` | ✅ PASS |
| `pnpm test` | ✅ PASS — 334 tests passed |
| `pnpm test:prompts` | ✅ PASS |
| `pnpm check:package` | ✅ PASS — 13 checks passed |
| `pnpm pack --dry-run` | ✅ PASS |
| `pnpm release:check` | ✅ PASS |

## Remaining concerns

**None** — 所有 R1 Blockers 和 Major Issues 已修复。

**发布前注意事项**:
1. `docs/reviews/` 目录下的审查报告会被打包到 npm 包中（如需排除，可在发布前移动）
2. docs/ 包含所有审查报告 (R0, R0-fix, R1)

## Recommendation

**✅ 建议进入 R2: Agent / Template Loading and Config Review**

理由：
1. 所有 R1 Blockers 已修复
2. 所有 R1 Major Issues 已修复
3. 所有测试通过 (334 tests)
4. 发布检查链完成

**R2 应审查**:
1. Agent 文件加载安全性（路径穿越、符号链接等）
2. Template 创建安全性（目录覆盖、权限等）
3. Config schema validation
4. Agent/Templates 重载一致性
5. 多源 agent 冲突处理

---

**Fix completed at**: 2026-05-06  
**Files modified**: 7 (1 new, 6 modified)  
**Tests**: All 334 passed
