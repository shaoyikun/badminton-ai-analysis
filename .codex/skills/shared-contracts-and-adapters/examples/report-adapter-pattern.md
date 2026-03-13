# Task

把 `ReportResult` 映射成更稳定的报告页展示模型，而不是在 `ReportView` 里直接散落条件判断。

# Before

- `ReportResult` 字段很多，包含分数、问题、建议、标准对照、comparison 等
- 报告页组件已经拆到 `frontend/src/components/result-views/`
- 前端仍需要把原始结果整理成更适合 UI 的块状数据

# Goal

让报告页渲染更稳定，减少“页面直接拼后端对象”的耦合。

# Recommended structure

- 保留 `ReportResult` 作为共享输入
- 在前端新增报告 adapter 或 formatter
- 输出 hero、核心问题、复测摘要、维度分数等页面块级数据

# Key implementation notes

- 不要在多个组件里重复找 `issues[0]`、`comparison?.coachReview`
- 先把“页面块”想清楚，再决定 adapter 产物长什么样
- adapter 可以放在 `result-views/utils.ts` 或 report feature 辅助文件
- 如果 adapter 发现共享字段不足，再回头改 contracts，而不是在页面里硬拼缺省逻辑

# Optional code sketch

```ts
type ReportHeroModel = {
  actionLabel: string
  summaryText: string
  totalScoreText: string
  retestStatusText?: string
}
```
