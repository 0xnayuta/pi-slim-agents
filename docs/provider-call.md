# 提供商调用（Provider-Call）调研 — pi-slim-agents

## 当前状态（v0.1.0）

提供商调用（provider-call）运行器在**架构上已完成**，但在大多数环境中**无法进行实际的模型调用**。

### v0.1.0 限制

对于 v0.1.0 发布，**提供商调用标记为"仅架构设计"**：
- 运行器架构已就绪并可用于回退
- 实际的模型调用需要 pi-mono ExtensionAPI 或验证可用的 pi-ai 导入
- 提示词-only 委派是稳定的默认值

**不要在 v0.1.0 中将提供商调用宣传为可用功能。**

### 可工作的部分

- 提供商调用运行器适配器（`src/provider-runner.ts`）已完全实现
- 系统提示词组装（代理正文 + 边界约束）
- 用户消息组装（任务 + 上下文 + 文件 + 模式）
- 温度和模型解析及优先级级联
- 当 pi-ai 无法导入时优雅回退为提示词-only
- 每种失败模式的清晰错误消息
- `/agents status` 显示提供商调用可用性和原因

### 不可工作的部分（v0.1.0）

通过 `@mariozechner/pi-ai` 的 `complete()` 函数进行实际模型调用。由于 pnpm 严格模块解析，导入在运行时失败。

## 为什么提供商调用无法进行实际模型调用

### 根本原因：pnpm 严格模块解析

`@mariozechner/pi-ai` 是 `@mariozechner/pi-coding-agent` 的传递依赖。在 pnpm 的默认（严格）模式下，传递依赖**不能**从未将其声明为直接依赖的包中直接导入。

```
pi-coding-agent → pi-ai (transitive)
pi-slim-agents → pi-coding-agent (peer)
pi-slim-agents → pi-ai (NOT directly accessible)
```

当 `src/provider-runner.ts` 尝试 `import('@mariozechner/pi-ai')` 时，会失败并报错：
```
ERR_MODULE_NOT_FOUND: Cannot find package '@mariozechner/pi-ai'
```

### 为什么不将 pi-ai 添加为直接依赖？

1. `pi-ai` 未作为独立包发布到 npm
2. 它是 `pi-coding-agent` 的内部依赖
3. 将其添加为依赖需要它能从扩展的模块上下文中解析
4. 即使添加了，版本也可能与 pi-coding-agent 使用的版本产生漂移

## 未来版本的提供商调用路线图

提供商调用运行器架构将在未来里程碑中完成，当：

1. **pi-mono ExtensionAPI 暴露直接的模型调用**（首选方案）
   - 在 ExtensionAPI 上提供 `complete()` 或 `generateText()`
   - 完全消除 pi-ai 依赖
   - 保证版本兼容性

2. **或者 `@mariozechner/pi-ai` 变为可导入**，通过：
   - 作为独立 npm 包发布
   - 或 ExtensionAPI 暴露 pi-ai 导入路径

**v0.1.0 现状**：提供商调用运行器保持在"回退模式"。提示词-only 是稳定的默认值。

### 候选方案（已记录，未实现）

#### 1. 等待 pi-mono ExtensionAPI 暴露模型调用

**状态：** 尚不可用（截至 pi-coding-agent v0.73.0）

理想方案是 pi-mono Extension API 直接暴露 `complete()` 或 `generateText()` 方法。这将：
- 消除导入 pi-ai 的需求
- 保证版本兼容性
- 无论包管理器配置如何都能工作

**风险：** API 可能不会被添加，或者形状可能与预期不同。

#### 2. @mariozechner/pi-ai 的可选 peerDependency

在 package.json 中将 `@mariozechner/pi-ai` 添加为可选的 peerDependency：

```json
{
  "peerDependencies": {
    "@mariozechner/pi-ai": "*"
  },
  "peerDependenciesMeta": {
    "@mariozechner/pi-ai": { "optional": true }
  }
}
```

**风险：** pi-ai 未作为独立包发布，因此这在标准 npm/pnpm 解析中不会生效。

#### 3. pnpm public-hoist-pattern / shamefully-hoist

配置 pnpm 以提升 `@mariozechner/pi-ai` 使其可访问：

```json
// .npmrc
public-hoist-pattern[]=*@mariozechner*
```

或：
```json
// .npmrc
shamefully-hoist=true
```

**风险：**
- 破坏 pnpm 的严格隔离保证
- 不同安装方式之间行为不同（pnpm vs npm vs yarn）
- 不可移植 — 用户需要配置自己的 .npmrc
- 可能在 monorepo 中导致版本冲突

#### 4. 子进程运行器

在可访问 pi-coding-agent 模块图的子进程中运行提供商调用：

```typescript
const result = await execSync('node -e "require(\'@mariozechner/pi-ai\').complete(...)"', ...);
```

**风险：**
- 传递模型上下文、API 密钥和结果需要复杂的 IPC
- 生成进程的性能开销
- 通过环境变量/stdin 传递 API 密钥的安全问题
- 难以调试

#### 5. 动态路径解析

通过遍历 node_modules 树来尝试找到 pi-ai：

```typescript
const piAiPath = require.resolve('@mariozechner/pi-ai', {
  paths: [path.dirname(require.resolve('@mariozechner/pi-coding-agent'))]
});
```

**风险：**
- 脆弱 — 取决于 node_modules 布局
- 不同包管理器之间行为不同
- 更新时可能中断

## 当前建议（v0.1.0）

1. **保持提供商调用适配器架构不变** — 设计良好，等待导入问题解决
2. **始终保留提示词-only 回退** — 它可靠地工作并产生良好结果
3. **关注 pi-mono 发布**中的 ExtensionAPI 模型调用支持
4. **不要绕过 pnpm 解析做 hack** — 这会产生脆弱、不可移植的代码
5. **`/agents status` 显示当前提供商调用状态** — 用户随时可以检查可用性
6. **清楚记录限制** — README 和 CHANGELOG 应解释提供商调用状态

## 决策日志

| 日期 | 决策 | 理由 |
|------|------|------|
| M4 | 实现提供商调用适配器 | 架构应提前就绪，等待导入可工作 |
| M4 | 优雅回退为提示词-only | 用户不应看到提供商调用不可用的错误 |
| M5 | 记录调研结果 | 清晰记录提供商调用为何尚不可工作 |
| M5 | 不强制修复可导入性 | Hack 会脆弱且不可移植 |
| M11 | 本里程碑不尝试真实集成 | 避免绑定到不稳定的内部 API；避免破坏包的可移植性 |
| M11 | 关注 pi-mono ExtensionAPI 的直接模型调用 | ExtensionAPI 上的 complete/generateText 将消除 pi-ai 依赖 |
| M11 | pi-ai 的可选 peerDependency 候选 | 仅在 pi-ai 作为独立包发布时才可行 |
| M11 | 不推荐 pnpm public-hoist-pattern | 破坏模块隔离；在不同环境间不可移植 |
| M13 | v0.1.0 保持提供商调用为"仅架构设计" | 回退为提示词-only 工作良好；真实集成等待 pi-mono API |
| M13 | 不强制将 pi-ai 纳入依赖 | 会破坏包的可移植性；未验证为可工作 |
| M13 | 在 README 和 CHANGELOG 中记录限制 | 用户应了解提供商调用状态 |

## 后续步骤

对于未来版本（如 v0.2.0 或 v1.0.0）：

1. 关注 pi-mono 发布中的 ExtensionAPI 新增
2. 当 pi-ai 可导入时测试提供商调用
3. 更新 `/agents status` 以反映新的可用性
4. 验证可工作后考虑将提供商调用标记为"稳定"

不要在 v0.1.x 版本中急于集成提供商调用。等待稳定的 API 表面。
