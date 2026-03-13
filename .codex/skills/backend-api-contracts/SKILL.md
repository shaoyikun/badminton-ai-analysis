---
name: backend-api-contracts
description: Use when evolving Fastify routes, request/response shapes, task status payloads, history/comparison/report APIs, or error responses without breaking the current frontend and shared contracts.
---

# 何时使用这个 skill

当任务涉及 backend API 演进时使用：

- `backend/src/server.ts` 路由增删改
- 请求/响应结构调整
- 错误对象、状态对象、上传与启动接口变更
- 历史、复测对比、报告查询结构变化
- 需要保证前后端兼容

# 仓库背景与上下文

当前公开 API 以 Fastify 提供，真实入口在 `backend/src/server.ts`。共享契约真源不只在 backend，也在：

- `shared/contracts.d.ts`
- `backend/src/types/task.ts`
- `spec/DATA-SPEC.md`

真实公开接口包括：

- `POST /api/tasks`
- `POST /api/tasks/:taskId/upload`
- `POST /api/tasks/:taskId/start`
- `GET /api/tasks/:taskId`
- `GET /api/tasks/:taskId/result`
- `GET /api/history`
- `GET /api/history/:taskId`
- `GET /api/tasks/:taskId/comparison`

# 核心规则

1. 先找谁在消费这个字段：
   - `frontend/src/app/AnalysisSessionProvider.tsx`
   - 对应页面与 result views
   - Playwright mock fixtures
2. 契约变更优先先改共享类型，再改 backend 与 frontend 实现。
3. 不要随意破坏现有前端依赖；若必须变更，优先加字段、兼容旧字段、补 adapter。
4. 错误返回统一保持 `{ error: { code, message, retryable, ... } }` 可读结构，不要回退成松散字符串。
5. 任务状态接口必须稳定表达：
   - `status`
   - `stage`
   - `progressPercent`
   - `error`
   - 必要时的 `segmentScan`
6. 上传、启动、结果、历史、对比接口的对象边界要清楚：
   - 上传返回任务资源与必要的上传/粗扫结果
   - 状态接口返回轮询所需最小集合
   - 结果接口只返回报告
7. 任何契约改动都要同步检查：
   - `shared/contracts.d.ts`
   - `frontend/e2e/support/mockApi.ts`
   - `spec/DATA-SPEC.md` 或相关文档

# 推荐代码组织方式

- HTTP 层继续收口在 `backend/src/server.ts`
- 领域状态推进放在 `backend/src/services/taskService.ts`
- 类型与资源映射放在 `backend/src/types/task.ts`
- 稳定对象结构优先复用 `shared/contracts.d.ts`
- 不要把路由处理器写成字段拼装的第二真源

# 与其他 skills 的协作边界

- 与 `shared-contracts-and-adapters` 联动：当共享类型和前端 view model 需要一起演进时
- 与 `badminton-analysis-flow` 联动：当 API 变化来自上传/处理主流程
- 与 `analysis-service-integration` 联动：当错误码或状态来自 Python 集成边界
- 与 `docs-spec-sync` 联动：当公开协议含义发生变化时
- 与 `repo-delivery-baseline` 联动：当改动触及共享契约、构建或跨模块联调时

# 任务完成后的输出要求

最终交付说明至少要写清：

- 改了哪些接口或对象
- 是否保持向后兼容；若没有，前端如何同步
- 错误模型是否有变化
- 更新了哪些共享类型、mock、文档和验证
