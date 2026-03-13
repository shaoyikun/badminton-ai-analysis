# Task

为 API 新增更细的错误分类，但不希望破坏当前前端的错误页和上传页恢复逻辑。

# Before

- 前端通过错误码映射标题、解释、CTA
- backend 已统一返回 `{ error: ... }`
- 当前错误码体系包含上传、姿态、覆盖率、机位、恢复失败等场景

# Goal

演进错误模型时保持前端可消费、日志可读、兼容旧行为。

# Recommended structure

- 保持顶层结构不变：`{ error: { code, message, retryable } }`
- 需要更细分类时，可以在现有结构内加字段，而不是换壳
- 新错误码要先确认前端默认 fallback 能接住

# Key implementation notes

- 不要返回 `error: 'xxx'` 这种退化格式
- `message` 给日志和排障，不是最终产品文案
- 新错误码如果前端还没专门映射，要保证 fallback 文案合理
- 如果某错误影响主流程跳转，要同步 provider 和错误页策略

# Optional code sketch

```json
{
  "error": {
    "code": "pose_failed",
    "message": "analysis-service exited with non-zero status",
    "retryable": true
  }
}
```
