# D1-runtime-fix: ESM require is not defined

## 问题现象

在 devpiano 项目中启动 pi 时，pi-slim-agents 输出以下日志：

```
[slim-agents] Failed to stat file "G:\source\repos\pi-slim-agents\agents\designer.md": require is not defined
[slim-agents] Failed to stat file "G:\source\repos\pi-slim-agents\agents\explorer.md": require is not defined
[slim-agents] Failed to stat file "G:\source\repos\pi-slim-agents\agents\fixer.md": require is not defined
[slim-agents] Failed to stat file "G:\source\repos\pi-slim-agents\agents\librarian.md": require is not defined
[slim-agents] Failed to stat file "G:\source\repos\pi-slim-agents\agents\oracle.md": require is not defined
[slim-agents] Failed to stat file "G:\source\repos\pi-slim-agents\agents\orchestrator.md": require is not defined
```

## 根因分析

项目使用 ESM (`"type": "module"`)，但 `src/metadata.ts` 中使用了 CommonJS 的 `require()`：

```typescript
// 错误代码 (src/metadata.ts:115)
const homeDir = require('os').homedir();
```

当代码在 ESM 运行时环境中执行时（例如 pi-mono Extension 上下文），`require` 未定义，导致：

1. `collectFileMetadataWithContext()` 函数执行失败
2. 所有文件元数据收集返回 null
3. 控制台输出 "require is not defined" 警告

## 修复文件

### `src/metadata.ts`

**修复前:**
```typescript
// Check if it's in the user's home directory
const homeDir = require('os').homedir();
```

**修复后:**
```typescript
// Check if it's in the user's home directory
const homeDir = os.homedir();
```

**说明:**
- 文件已导入 `import * as os from 'node:os'`
- 只需使用 `os.homedir()` 替代 `require('os').homedir()`

## 验证命令

### 1. TypeScript 类型检查
```bash
pnpm typecheck
```

### 2. 构建
```bash
pnpm build
```

### 3. 运行测试
```bash
pnpm test
```

### 4. 特定测试：ESM 兼容性
```bash
pnpm test:agents
```

### 5. 运行时验证
```bash
# 直接运行 ESM 测试
node --experimental-vm-modules -e "
import { collectFileMetadata } from './dist/metadata.js';
const meta = collectFileMetadata('./agents/oracle.md');
console.log('Metadata:', meta);
console.log('ESM require check passed!');
"
```

### 6. 检查构建产物无 require
```bash
# 搜索 dist 中的 require 用法
grep -r "require(" dist/ --include="*.js" | grep -v node_modules || echo "No require found in dist/"
```

## devpiano 中重新验证

1. **重新构建 pi-slim-agents:**
   ```bash
   cd G:/source/repos/pi-slim-agents
   pnpm build
   ```

2. **在 devpiano 中启动 pi:**
   ```bash
   cd G:/path/to/devpiano
   pnpm dev
   # 或
   pnpm start
   ```

3. **验证无警告:**
   - 启动时不应再看到 "require is not defined" 错误
   - 启动后 `/agents` 命令应正常工作
   - 可以通过 `/agents status` 查看运行时状态

4. **检查 agent 加载:**
   ```
   /agents status
   ```
   应该显示正确数量的 agents 和正常的元数据。

## 修复影响范围

- **受影响文件:** `src/metadata.ts` (1 行修改)
- **受影响测试:** `tests/agents.test.ts` (新增 ESM 兼容性测试)
- **无功能变更:** 仅修复 ESM 运行时兼容性
- **向后兼容:** 是，ESM 和 CommonJS 环境均可正常工作

## 相关文件

- `src/metadata.ts` - 包含 `collectFileMetadata` 和 `collectFileMetadataWithContext` 函数
- `src/utils.ts` - 包含 `findPackageRoot`、`getPackageAgentsDir`、`getPackageTemplatesDir` 等
- `src/agents.ts` - 使用 `collectFileMetadata` 加载 agent 元数据
- `src/templates.ts` - 使用 `collectFileMetadata` 加载 template 元数据
- `tests/agents.test.ts` - 包含 ESM 兼容性测试

## 额外测试覆盖

新增了以下测试确保 ESM 兼容性：

1. `collectFileMetadata does not use require (ESM compatible)` - 验证基本元数据收集
2. `collectFileMetadata correctly identifies home directory paths` - 验证 home 目录路径识别
3. `collectFileMetadata correctly identifies package builtin paths` - 验证 package 内置路径识别
4. `collectFileMetadata correctly identifies project paths` - 验证项目路径识别
5. `collectFileMetadata handles stat failure gracefully` - 验证失败处理
6. `loadAgents works in ESM context without require errors` - 验证 agent 加载
7. `loadTemplates works in ESM context without require errors` - 验证 template 加载
8. `built-in agents are loaded with correct sourcePathKind` - 验证内置 agent 源类型

## 相关文档

- [ESM 与 CommonJS 兼容性](https://nodejs.org/api/esm.html)
- [pi-mono Extension 文档](docs/)
