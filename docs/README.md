# 文档导航

pi-slim-agents 项目文档索引。

> **[English](../README.md)** | 中文

---

## 核心文档

| 文档 | 说明 |
|------|------|
| [project-state.md](project-state.md) | 当前项目状态、稳定功能、已知问题 |
| [next-actions.md](next-actions.md) | 当前任务看板（待办 / 推迟 / 已完成） |
| [roadmap.md](roadmap.md) | 功能路线图和里程碑历史（M2–M13 + 未来计划） |
| [decisions.md](decisions.md) | 关键设计决策记录（D001–D012） |

## 架构与设计

| 文档 | 说明 |
|------|------|
| [design.md](design.md) | 架构设计、委派模型、JSON 输出、格式化层 |
| [provider-call.md](provider-call.md) | 提供商调用（provider-call）调研、阻塞原因、候选方案 |

## 使用指南

| 文档 | 说明 |
|------|------|
| [dogfood.md](dogfood.md) | 自用验证（dogfood）指南、两步模式、直接搜索模式 |
| [agent-authoring.md](agent-authoring.md) | 代理创作指南、模板、标签、别名、校验 |
| [prompt-tuning.md](prompt-tuning.md) | 提示词调优原则、质量检查清单、各代理失败模式 |

## 发布

| 文档 | 说明 |
|------|------|
| [release.md](release.md) | 发布流程、发布前检查清单、CI/CD、回滚 |

## 审查报告

审查报告（英文原文，暂未翻译）位于 [reviews/](reviews/) 目录：

| 文档 | 说明 |
|------|------|
| [reviews/index.md](reviews/index.md) | 审查轮次摘要索引 |
| R0–R7 | 从包审查到最终发布就绪的各轮审查 |
| D1 | ESM require 修复、提示词-only 用户体验修复 |
| CI | Node.js 24 + pnpm 缓存修复 |

---

## 按角色推荐阅读顺序

### 新用户

1. [project-state.md](project-state.md) — 了解项目现状
2. [dogfood.md](dogfood.md) — 学习如何使用
3. [agent-authoring.md](agent-authoring.md) — 创建自定义代理

### 贡献者 / 维护者

1. [design.md](design.md) — 理解架构
2. [decisions.md](decisions.md) — 理解设计决策
3. [roadmap.md](roadmap.md) — 了解里程碑和未来计划
4. [next-actions.md](next-actions.md) — 查看当前待办
5. [prompt-tuning.md](prompt-tuning.md) — 改进代理提示词

### 发布维护

1. [release.md](release.md) — 发布流程
2. [provider-call.md](provider-call.md) — 提供商调用状态跟踪
3. [reviews/](reviews/) — 历史审查记录
