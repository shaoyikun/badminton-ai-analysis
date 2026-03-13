# Task

修改了任务状态或错误响应契约，想同步文档，但不确定应该改 `README`、`spec` 还是只改 skill。

# Before

- API 结构真源在 `shared/contracts.d.ts` 与 backend 实现
- `spec/DATA-SPEC.md` 承载摘要型协议说明
- skill 只应该说明“遇到契约变化时怎么同步”

# Goal

让 API 契约变化后，代码、摘要 spec 和执行指导保持一致分层。

# Recommended structure

- 共享字段与实现先改代码
- 协议摘要更新到 `spec/DATA-SPEC.md`
- 若影响错误恢复或交互流程，再同步 `spec/INTERACTION-SPEC.md` / design docs
- skill 中只补“同步步骤和判断规则”

# Key implementation notes

- `README.md` 不需要承载细颗粒 API 字段清单，除非改动影响仓库级使用方式
- 如果只是新增可选字段，spec 可做摘要更新，不必复制完整类型定义
- 若错误码含义变化，会影响错误页路径，需要同步交互文档
- 若发现旧 spec 已明显落后，应在最终说明中指出而不是默默略过

# Optional code sketch

```text
契约变化优先级：
code/shared -> spec/DATA-SPEC -> interaction/design（若影响页面） -> skill workflow
```
