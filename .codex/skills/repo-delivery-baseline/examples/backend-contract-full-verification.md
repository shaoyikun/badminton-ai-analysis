# Task

修改了 `backend/src/server.ts`、`backend/src/types/task.ts` 和 `shared/contracts.d.ts`，为任务状态接口新增字段。

# Before

- 这类改动会同时影响 backend、frontend provider、Playwright mock
- 共享契约变更属于高风险交付面
- `make test` 不能替代 `make build`，`make verify-local` 也不能替代 `make verify`

# Goal

给出 backend/contracts 改动后的完整验证路径，而不是只跑单个模块命令。

# Recommended structure

- 先做定向检查：必要的 backend test 与前端消费点检查
- 再跑 `make build`
- 有 Docker daemon 时跑 `make verify`
- 如果对象语义或评分输出变了，再补 `make evaluate`

# Key implementation notes

- `shared/contracts.d.ts` 改动默认提高验证等级
- 只跑 `backend` 单测不足以说明前端和构建路径没回归
- 如果只跑了 `make verify-local`，结论必须写成“本地校验通过，未完成 handoff gate”
- 如果状态对象影响处理中页或报告页，还要检查 Playwright mock 是否同步

# Optional code sketch

```bash
make build
make verify
# 若结果语义也变了
make evaluate
```
