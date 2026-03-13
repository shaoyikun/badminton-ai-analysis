# Task

修改 backend API、任务链路或 handler 行为，同时避免破坏 shared 契约和前端消费方式。

# What to inspect first

- `backend/README.md`
- `backend/src/server.ts`
- 相关 `backend/src/services/`、`domain/`、`types/`
- `shared/contracts.d.ts`
- `frontend/src/app/AnalysisSessionProvider.tsx`
- `frontend/e2e/support/mockApi.ts`
- backend tests 与相关 scripts

# What likely exists already

- 稳定公开路由和响应对象
- thin-handler + service 分层约束
- shared contract 作为跨模块真源
- 前端对状态对象、错误对象、结果结构的既有依赖
- 覆盖当前行为的测试或 mock

# Startup conclusion

当前 backend 不是孤立模块，公开接口已经被 shared contracts、frontend provider 和 Playwright mock 消费。先确认消费者和共享结构，再决定是加字段、补兼容，还是真正调整契约；不要只改 backend 一侧。

# Implementation direction

- 先定位生产者和消费者
- 优先扩展共享对象和既有 mapper/service
- 若接口语义变化，联动 `backend-api-contracts`、`shared-contracts-and-adapters`、`docs-spec-sync`

# Common mistakes to avoid

- 只改 `server.ts` 不看 frontend 消费
- 改响应结构却不更新 shared contracts 和 mock
- 把新逻辑继续堆进超大的 handler
- 用新的返回格式破坏现有错误恢复路径
