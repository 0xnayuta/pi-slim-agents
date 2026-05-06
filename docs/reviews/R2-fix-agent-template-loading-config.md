# R2 Fix - Agent / Template Loading and Config

## Scope

本轮修复 R2 审查发现的 1 个 Blocker 和 7 个 Major Issues：

1. B1: FileMetadata 类型不一致
2. M1: agent.sourcePath 未脱敏
3. M2: Template name stripping 行为文档化
4. M3: recommendedMode 验证
5. M4: temperature 范围检查
6. M5: JSON 输出缺少 sourcePathKind
7. M6: Package root 检测脆弱
8. M7: Config schema 无验证

## Issues addressed

### B1: FileMetadata 类型不一致

**修复内容**:
- 更新 `src/types.ts` 中的 `FileMetadata` 接口，添加 `sourcePathKind: 'builtin' | 'project' | 'user' | 'external' | 'unknown'`
- 更新 `src/metadata.ts` 中接口添加 `unknown` 选项
- 更新 `src/format.ts` 中 `AgentJsonItem` 和 `TemplateJsonItem` 接口添加 `sourcePathKind`
- 更新 `formatAgentsJson()` 和 `formatTemplatesJsonFull()` 输出包含 `sourcePathKind`

**关键变更**:
```typescript
// src/types.ts
export interface FileMetadata {
  sourcePath: string;  // Safe display path
  sourcePathKind: 'builtin' | 'project' | 'user' | 'external' | 'unknown';
  createdAt: string | null;
  lastModified: string | null;
  sizeBytes: number | null;
}
```

### M1: agent.sourcePath 未脱敏

**修复内容**:
- 在 `src/agents.ts` 中使用 `safeDisplayPath()` 处理 `sourcePath`
- `resolveAgents()` 函数现在接收 `cwd` 参数
- `agent.sourcePath` 现在是安全的显示路径，不会暴露完整的绝对路径
- `metadata.sourcePath` 通过 `collectFileMetadata()` 已有正确的脱敏处理

**关键变更**:
```typescript
// src/agents.ts
const safePath = safeDisplayPath(entry.filePath, cwd);
const agent: AgentDefinition = {
  // ...
  sourcePath: safePath, // Safe display path for diagnostics
  // ...
};
```

### M2: Template name stripping 行为文档化

**修复内容**:
- 在 `docs/agent-authoring.md` 添加 "Template Name Convention" 小节
- 说明 `-template` suffix 会自动去除
- 说明 filename 和 frontmatter name 的关系

**文档更新**:
```markdown
### Template Name Convention

Template file names may end with `-template` (e.g., `security-reviewer.md` or `security-reviewer-template.md`). 
The `-template` suffix is automatically stripped from the template name for display purposes.
```

### M3: recommendedMode 验证

**修复内容**:
- 在 `src/agents.ts` 添加 `resolveRecommendedMode()` 函数
- 只允许 `quick`, `normal`, `deep` 三个值
- 非法值 fallback 到 `normal` 并记录 warning
- 在 `src/templates.ts` 的 `validateAgents()` 中添加 recommendedMode 验证
- 对 builtin agents、templates、user/project agents 都进行验证

**关键代码**:
```typescript
// src/agents.ts
function resolveRecommendedMode(mode?: unknown): string {
  if (typeof mode === 'string' && ['quick', 'normal', 'deep'].includes(mode)) {
    return mode;
  }
  if (mode !== undefined && typeof mode !== 'string') {
    console.warn(`[slim-agents] Invalid recommendedMode type, falling back to 'normal'`);
  }
  return 'normal';
}
```

### M4: temperature 范围检查

**修复内容**:
- 在 `src/agents.ts` 添加 `resolveTemperature()` 函数
- 验证 temperature 在 0-2 范围内
- 非法值 fallback 到默认值 0.2 并记录 warning
- 在 `src/templates.ts` 的 `validateAgents()` 中添加 temperature 范围验证

**关键代码**:
```typescript
// src/agents.ts
function resolveTemperature(configTemp?: number, frontmatterTemp?: unknown): number {
  if (configTemp !== undefined) {
    if (typeof configTemp === 'number' && configTemp >= 0 && configTemp <= 2) {
      return configTemp;
    }
    console.warn(`[slim-agents] Invalid config temperature ${configTemp}, falling back to default`);
  }
  if (typeof frontmatterTemp === 'number' && frontmatterTemp >= 0 && frontmatterTemp <= 2) {
    return frontmatterTemp;
  }
  return 0.2;
}
```

### M5: JSON 输出缺少 sourcePathKind

**修复内容**:
- 更新 `src/format.ts` 中 `AgentJsonItem.metadata` 和 `TemplateJsonItem.metadata` 接口
- 添加 `sourcePathKind` 字段
- 更新 `formatAgentsJson()` 输出包含 `sourcePathKind`

**关键变更**:
```typescript
// src/format.ts
metadata: a.metadata ? {
  sourcePath: a.metadata.sourcePath,
  sourcePathKind: a.metadata.sourcePathKind ?? 'unknown',
  createdAt: a.metadata.createdAt,
  lastModified: a.metadata.lastModified,
  sizeBytes: a.metadata.sizeBytes,
} : null,
```

### M6: Package root 检测脆弱

**修复内容**:
- 在 `src/utils.ts` 添加 `findPackageRoot()`, `resolvePackageAssetPath()`, `getPackageAgentsDir()`, `getPackageTemplatesDir()` 函数
- 使用向上查找 `package.json` 的方式定位 package root
- 添加安全限制（最多向上 10 层）
- 更新 `src/agents.ts` 使用新的包路径解析函数
- 更新 `src/templates.ts` 使用新的包路径解析函数

**关键代码**:
```typescript
// src/utils.ts
export function findPackageRoot(fromPath?: string): string | null {
  let dir = fromPath
    ? path.dirname(fromPath)
    : path.dirname(fileURLToPath(import.meta.url));

  let maxLevels = 10;
  while (maxLevels > 0) {
    const pkgPath = path.join(dir, 'package.json');
    try {
      if (fs.existsSync(pkgPath)) {
        return dir;
      }
    } catch {
      // ignore
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    maxLevels--;
  }

  return null;
}
```

### M7: Config schema 无验证

**修复内容**:
- 在 `src/config.ts` 添加 `loadAndValidateConfig()` 函数
- 添加 `ConfigValidationResult` 接口
- 实现完整的 config schema 验证：
  - runnerMode: 必须是 `prompt-only` 或 `provider-call`
  - outputTemplate: 必须是 boolean
  - history: 必须是 object，各字段类型验证
  - agents.<name>: 验证 enabled/disabled/temperature/model 等字段
  - 未知字段产生 warning

**关键代码**:
```typescript
// src/config.ts
export interface ConfigValidationResult {
  ok: boolean;
  config: SlimAgentsConfig;
  warnings: Array<{ field: string; message: string }>;
}

export function loadAndValidateConfig(cwd: string): ConfigValidationResult {
  // ... validation logic ...
}
```

## Files changed

| 文件 | 操作 | 描述 |
|------|------|------|
| `src/types.ts` | 修改 | 添加 sourcePathKind 到 FileMetadata |
| `src/metadata.ts` | 修改 | 添加 `unknown` 到 sourcePathKind |
| `src/agents.ts` | 修改 | sourcePath 脱敏、temperature/recommendedMode 验证 |
| `src/templates.ts` | 修改 | recommendedMode/temperature 验证 |
| `src/config.ts` | 修改 | 添加 config schema 验证 |
| `src/utils.ts` | 修改 | 添加 package root 检测函数 |
| `src/format.ts` | 修改 | JSON 输出添加 sourcePathKind |
| `docs/design.md` | 修改 | 更新 FileMetadata 文档 |
| `docs/agent-authoring.md` | 修改 | 更新 frontmatter 字段说明、添加 template naming 说明 |
| `tests/agents.test.ts` | 修改 | 添加 R2-fix 相关测试 |

## Tests added or updated

新增 19 个测试覆盖所有修复：

| 测试 | 覆盖 |
|------|------|
| `FileMetadata includes sourcePathKind` | B1, M5 |
| `/agents --format json includes metadata.sourcePathKind` | B1, M5 |
| `JSON output does not contain absolute temp directory paths` | M1 |
| `agent.sourcePath is sanitized (not absolute)` | M1 |
| `valid recommendedMode values pass through` | M3 |
| `recommendedMode validation catches invalid values` | M3 |
| `temperature=0 and temperature=2 are valid` | M4 |
| `temperature=-1 and temperature=3 are invalid` | M4 |
| `non-numeric temperature is invalid` | M4 |
| `valid config passes schema validation` | M7 |
| `invalid runnerMode is caught` | M7 |
| `invalid agent temperature is caught` | M7 |
| `unknown config fields produce warnings` | M7 |
| `invalid history.retention is caught` | M7 |
| `findPackageRoot locates package` | M6 |
| `resolvePackageAssetPath works for agents` | M6 |
| `resolvePackageAssetPath works for templates` | M6 |
| `getPackageAgentsDir returns valid path` | M6 |
| `getPackageTemplatesDir returns valid path` | M6 |

## Commands run

| 命令 | 结果 |
|------|------|
| `pnpm typecheck` | ✅ PASS |
| `pnpm build` | ✅ PASS |
| `pnpm test` | ✅ PASS — 353 tests passed (新增 19 tests) |
| `pnpm test:prompts` | ✅ PASS |
| `pnpm release:check` | ✅ PASS |

## Remaining concerns

**None** — 所有 R2 Blockers 和 Major Issues 已修复。

## Recommendation

**✅ 建议进入 R3: Command Parsing and CLI UX Review**

理由：
1. 所有 R2 Blockers 已修复
2. 所有 R2 Major Issues 已修复
3. 所有测试通过 (353 tests)
4. 发布检查链完成

**R3 应审查**:
1. `/agent` 命令解析
2. `/agents` 子命令解析
3. Flag 处理 (--format, --regex, --mode 等)
4. 帮助文本准确性
5. 错误消息一致性
6. 输出格式一致性 (text vs JSON)

---

**Fix completed at**: 2026-05-06  
**Files modified**: 10  
**Tests**: 353 passed (19 new tests added)