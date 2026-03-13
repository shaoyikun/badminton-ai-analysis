# Task

处理 Python 分析失败，让前端能拿到可恢复、可行动的错误，而不是底层异常原文。

# Before

- Python 由 backend 调用
- 前端最终只认 `FlowErrorCode` 和错误页文案
- 当前错误页会根据错误码决定回上传还是拍摄指引

# Goal

把 Python 执行失败安全地映射成上游可消费错误，不污染前端协议。

# Recommended structure

- Python stderr 写入日志或内部 message
- backend 根据失败阶段映射稳定错误码
- 返回 `{ error: { code, message, retryable } }`
- 前端继续通过错误码映射用户文案和 CTA

# Key implementation notes

- 不要把 traceback 直接作为用户可见 `message`
- 如果失败发生在抽帧前后，区分 `preprocess_failed` 与 `pose_failed`
- 若错误可通过重新上传恢复，`retryable` 应保持可读语义
- 如果失败语义变化会影响 disposition 或结果分布，要补 `make evaluate`

# Optional code sketch

```ts
catch (error) {
  throw buildErrorSnapshot('pose_failed', error instanceof Error ? error.message : 'pose analysis failed')
}
```
