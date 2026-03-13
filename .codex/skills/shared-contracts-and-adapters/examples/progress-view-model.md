# Task

把 `TaskStatusResponse` 转成处理中页可直接渲染的步骤模型，减少页面内分支判断。

# Before

- 处理中页当前用 `stage` 推导 4 步流程
- provider 已经能拿到 `status`、`stage`、`progressPercent`
- 页面还需要把这些状态翻译成用户可见的标题和说明

# Goal

建立稳定的进度 view model，让任务状态和 UI 步骤之间有单一映射点。

# Recommended structure

- 输入：`TaskStatusResponse`
- 输出：步骤数组、当前摘要、状态徽标文案
- 页面只渲染 view model，不在 JSX 里散落条件判断

# Key implementation notes

- view model 命名要面向页面，不要复用 backend 术语直接暴露
- 新增 `stage` 时只需要改一处映射
- 如果错误码会影响步骤表现，可在 adapter 层统一处理
- 让 mock 场景和真实 provider 都走同一套映射

# Optional code sketch

```ts
type ProgressStepModel = {
  title: string
  state: 'idle' | 'active' | 'done'
  description: string
}
```
