---
name: docs-spec-sync
description: Use when code changes risk drifting away from docs/, spec/, README, or subsystem READMEs, and you need to keep product intent, technical contracts, and implementation status aligned in this badminton analysis repo.
---

# Docs Spec Sync

## 何时使用

当任务可能让文档与实现脱节时使用：

- 页面流程、状态流转、公开动作范围变化
- API 契约、错误模型、共享类型变化
- 交付命令、验证规则、运行方式变化
- 需要判断“这次代码改动是否应该同步 spec/docs”

## 先读什么

这个仓库的文档不是装饰品，已经分层存在：

- `README.md`：仓库级运行/验证/交付真源
- `docs/engineering/DELIVERY-BASELINE.md`：工程交付真源
- `docs/design/`：交互与页面结构
- `docs/algorithm-baseline.md`：当前算法实现边界
- `spec/`：摘要型产品、交互、数据、架构 spec

当前已知需要警惕的偏差包括：

- 交互文档仍有旧的“一键开始分析”表述，未完整反映候选片段选择流
- 技术栈事实一旦稳定，例如 `*.module.scss`、选择性 `antd-mobile`、`taskId` 语义化路由、route-level code splitting，就不能只停留在代码里，必须写回 spec/README/skill

## 工作顺序/决策顺序

1. 先找本次变化对应的真源文档层级，再决定要改 README、docs 还是 spec。
2. 先确认当前实现真相，再回头校正文档；不要拿旧文档当实现依据继续扩大偏差。
3. 如果某段内容更像执行模式而非产品或工程真源，优先把它沉淀到 skill；如果它已经是稳定技术栈约束，再同步写回 spec/README。
4. 只更新真正失真的文档，不做无意义的大范围重写。
5. 最终说明里明确哪些文档已同步、哪些仍是目标态、哪些故意没改。

## 核心规则

1. 代码改动前先找对应真源文档，不要改完再猜应该同步哪份。
2. 判断文档层级：
   - 仓库命令或门禁：`README.md`、`docs/engineering/DELIVERY-BASELINE.md`
   - 产品目标或页面集合：`PRD`、`PRODUCT-SPEC`
   - 页面结构或交互：`docs/design/*`、`spec/INTERACTION-SPEC.md`
   - 数据或协议：`spec/DATA-SPEC.md`
   - 当前算法实现：`docs/algorithm-baseline.md`
3. 不要把 target-state 文档误当 current-state；若保留目标态，必须标明。
4. 不允许代码已变、文档仍保留明显失真的旧流程或旧字段。
5. 若本次变更确定了稳定技术栈真相，例如样式方案、组件库边界、路由模型、验证命令，应同步检查 `README.md`、子系统 README、相关 spec 和对应 skill。
6. 如果一份内容更像执行方法，应考虑沉淀到 skill，而不是继续塞进 spec/docs。
7. 若发现重复文档，优先给出合并或降级建议，不要继续复制维护。

## 何时联动其他 skills

- 所有功能型 skill：它们负责改功能，这个 skill 负责同步文档
- `repo-delivery-baseline`：命令、验证或交付门禁变化
- `backend-api-contracts`、`shared-contracts-and-adapters`：协议变化
- `badminton-h5-product-ui`、`badminton-analysis-flow`：页面流程和交互变化

## 何时读取 examples/

当你已经判断出失真属于哪一层文档后，再读对应 example：

- `examples/feature-change-doc-sync.md`：功能变化影响 README、docs、spec 其中一层时读
- `examples/interaction-upgrade-spec-sync.md`：页面流程和交互层级变化时读
- `examples/api-contract-doc-sync.md`：接口、错误模型、共享字段变化时读

## 任务完成后的输出要求

最终交付说明至少要写清：

- 本次改动对应更新了哪些文档，或为什么没有更新
- 哪些文档仍然是目标态、哪些已经同步到当前实现
- 是否发现旧内容过时、重复或应该迁到 skill
- 若暂未同步的文档存在风险，要显式列出
