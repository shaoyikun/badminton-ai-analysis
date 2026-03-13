# Task

为处理中页稳定输出任务状态对象，支持前端根据 `status`、`stage`、`progressPercent` 和 `error` 渲染步骤反馈。

# Before

- 轮询接口是 `GET /api/tasks/:taskId`
- 前端 provider 会从 `TaskStatusResponse` 推导处理中步骤
- 当前真实状态机包括 `created / uploaded / processing / completed / failed`

# Goal

让任务状态接口保持稳定、可扩展、可前端消费，不把内部实现细节直接暴露到页面。

# Recommended structure

- `status` 用于流程级判断
- `stage` 用于分步骤 UI 与排障
- `progressPercent` 只表达粗粒度阶段进度
- `error` 保持统一对象结构
- 候选片段相关信息只在需要时通过 `segmentScan` 返回

# Key implementation notes

- 不要让前端依赖 `preprocessStatus`、`poseStatus` 作为主状态机
- `failed` 是终态；不要通过特殊字符串把失败当 processing 分支的一种
- 如果新增阶段，先确认 `ProcessingPage` 和 provider 的步骤映射会不会断
- 若字段调整，要同步 `shared/contracts.d.ts` 与 `frontend/e2e/support/mockApi.ts`

# Optional code sketch

```ts
interface TaskStatusResponse {
  taskId: string
  actionType: 'clear' | 'smash'
  status: TaskStatus
  stage: TaskStage
  progressPercent: number
  error?: ErrorSnapshot
  segmentScan?: SegmentScanSummary
}
```
