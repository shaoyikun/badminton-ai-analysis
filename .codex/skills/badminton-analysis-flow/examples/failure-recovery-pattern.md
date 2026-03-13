# Task

为上传或分析失败设计恢复路径，避免任务卡死、页面跳不出去或错误语义混乱。

# Before

- 当前错误页会根据错误码决定主/次 CTA
- provider 会保存错误状态与上次失败摘要
- 失败后通常要求重新上传新任务，而不是复用旧失败任务

# Goal

让失败恢复模式对用户可理解、对前后端可维护。

# Recommended structure

- 页内可恢复错误留在 `/upload`
- 明确服务端错误码时跳 `/error`
- 失败任务进入终态，不再在原任务上重启分析
- 返回上传页后保留动作与失败摘要，但不保留真实文件

# Key implementation notes

- 不要让失败状态仍停留在 `/processing`
- `retryable` 应和错误页 CTA 保持一致
- 候选片段粗扫失败与精分析失败要区分恢复策略
- 如果服务重启导致处理中任务无法恢复，要映射到 `task_recovery_failed`

# Optional code sketch

```ts
if (error.code === 'invalid_duration') return navigate('/error')
if (error.code === 'upload_failed') return showInlineBanner()
```
