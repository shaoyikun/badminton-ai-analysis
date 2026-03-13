---
name: docs-spec-sync
description: Use when code changes risk drifting away from docs/, spec/, README, or subsystem READMEs, and you need to keep product intent, technical contracts, and implementation status aligned in this badminton analysis repo.
---

# 何时使用这个 skill

当任务可能让文档与实现脱节时使用：

- 页面流程、状态流转、公开动作范围变化
- API 契约、错误模型、共享类型变化
- 交付命令、验证规则、运行方式变化
- 需要判断“这次代码改动是否应该同步 spec/docs”

# 仓库背景与上下文

这个仓库的文档不是装饰品，已经分层存在：

- `README.md`：仓库级运行/验证/交付真源
- `docs/engineering/DELIVERY-BASELINE.md`：工程交付真源
- `docs/design/`：交互与页面结构
- `docs/algorithm-baseline.md`：当前算法实现边界
- `spec/`：摘要型产品/交互/数据/架构 spec

当前已知需要警惕的偏差包括：

- spec 里的部分路由是目标态，不完全等于当前前端路由
- 交互文档仍有旧的“一键开始分析”表述，未完整反映候选片段选择流

# 核心规则

1. 代码改动前先找对应真源文档，不要改完再猜应该同步哪份。
2. 判断文档层级：
   - 仓库命令/门禁：`README.md`、`DELIVERY-BASELINE`
   - 产品目标/页面集合：`PRD`、`PRODUCT-SPEC`
   - 页面结构/交互：`docs/design/*`、`spec/INTERACTION-SPEC.md`
   - 数据/协议：`spec/DATA-SPEC.md`
   - 当前算法实现：`docs/algorithm-baseline.md`
3. 不要把 target-state 文档误当 current-state；若保留目标态，必须标明。
4. 不允许代码已变、文档仍保留明显失真的旧流程或旧字段。
5. 如果一份内容更像执行方法，应考虑沉淀到 skill，而不是继续塞进 spec/docs。
6. 若发现重复文档，优先给出合并或降级建议，不要继续复制维护。

# 推荐代码组织方式

- 规则真源继续留在 `README.md`、`docs/`、`spec/`
- skill 只承载执行模式，不承载产品规则正文
- 小范围实现变化优先精准更新对应文档，不做整库大改写
- 若改动横跨前后端与文档，优先先确认实现真相，再同步摘要 spec

# 与其他 skills 的协作边界

- 与所有功能型 skill 联动：它们负责改功能，这个 skill 负责同步文档
- 与 `repo-delivery-baseline` 联动：当命令、验证或交付门禁变化时
- 与 `backend-api-contracts`、`shared-contracts-and-adapters` 联动：当协议变化时
- 与 `badminton-h5-product-ui`、`badminton-analysis-flow` 联动：当页面流程和交互变化时

# 任务完成后的输出要求

最终交付说明至少要写清：

- 本次改动对应更新了哪些文档，或为什么没有更新
- 哪些文档仍然是目标态、哪些已经同步到当前实现
- 是否发现旧内容过时、重复或应该迁到 skill
- 若暂未同步的文档存在风险，要显式列出
