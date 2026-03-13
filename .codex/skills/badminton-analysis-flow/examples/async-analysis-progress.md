# Task

调整处理中页，让前端能更稳定地根据任务状态轮询并展示分步骤反馈。

# Before

- 当前处理中页消费 `status`、`stage`、`progressPercent`
- provider 会轮询 `GET /api/tasks/:taskId`
- 页面文案依赖 `stage` 推导

# Goal

让“启动中 / 分析中 / 成功 / 错误”与 backend `status + stage` 保持一致，不出现页面卡死或提前跳转。

# Recommended structure

- provider 负责轮询与状态归一
- 页面只消费步骤列表和当前摘要
- `completed` 自动跳 `/analyses/:taskId/report`
- `failed` 或 error 自动跳 `/error`

# Key implementation notes

- 不要在页面里直接写 `setInterval` 和复杂分支
- `progressPercent` 只做辅助展示，不要当严格业务判断
- 如果新增 `stage`，先更新步骤映射函数
- mock API 要能模拟 `created -> uploaded -> processing -> completed` 或失败链路

# Optional code sketch

```ts
if (status === 'completed') navigate(`/analyses/${taskId}/report`, { replace: true })
if (status === 'failed' || errorState) navigate('/error', { replace: true })
```
