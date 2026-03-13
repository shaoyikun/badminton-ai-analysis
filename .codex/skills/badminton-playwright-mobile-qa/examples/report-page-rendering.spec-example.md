# Task

为报告页补一条移动端 E2E，确认分析完成后报告 hero、核心问题和继续动作区都能渲染。

# Before

- 报告页路由是 `/report`
- provider 会在没有本地 report 时尝试 `ensureLatestReportLoaded()`
- mock API 已能返回 `reportResponse` 和 comparison 数据

# Goal

验证用户从完成分析进入报告页后，能看到最关键的结果层级，而不是只断言一个 JSON 字段存在。

# Recommended structure

- mock 任务状态与报告结果
- 直接进入 `/report` 或从 `/processing` 跳转到 `/report`
- 断言 hero、核心问题、复测摘要或底部 CTA

# Key implementation notes

- 优先断言标题、结论文案、按钮
- 如果 comparison 是可选，断言时要区分“有基线”和“无基线”两种行为
- 不要把 score 数字的每个细节都写死成脆弱断言
- 页面产品化改动后，这条测试能帮助防止层级回退成调试页

# Optional code sketch

```ts
await mockApi(page)
await page.goto('/report')
await expect(page.getByRole('button', { name: '再次测试' })).toBeVisible()
await expect(page.getByRole('link', { name: '查看历史' })).toBeVisible()
```
