# Task

把报告页从“字段展示页”优化成更强产品叙事的移动端报告页。

# Before

- 路由是 `/analyses/:taskId/report`
- 当前页面已通过 `ReportView` 展示报告内容
- 报告对象里包含 summary、issues、comparison、standardComparison、dimensionScores

# Goal

让报告页先讲“这次先练什么”，再展开维度分数和标准动作对照。

# Recommended structure

- 顶部 hero：动作名、一句话结论、辅助总分、当前复测状态
- 第二屏突出核心问题、影响、下次关注点
- 有基线时插入最近一次复测结论
- 下方再展示标准动作对比、维度分数、其余问题和继续动作 CTA

# Key implementation notes

- 不要让总分抢主叙事
- `issues[0]` 和 `comparison?.coachReview` 适合做上层摘要，但先经 adapter 整理
- 底部 CTA 保持简单：再次测试、查看历史
- 如果报告页层级调整明显，补报告页渲染的 Playwright 场景

# Optional code sketch

```tsx
<ReportHero />
<PrimaryIssueCard />
{comparison ? <RetestSummaryCard /> : null}
<StandardComparisonCard />
<DimensionScoreGrid />
```
