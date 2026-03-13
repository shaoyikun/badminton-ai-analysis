---
name: backend-api-contracts
description: Use when evolving Fastify routes, request/response shapes, task status payloads, history/comparison/report APIs, or error responses without breaking the current frontend and shared contracts.
---

# Backend API Contracts

## 何时使用

当任务涉及 backend API 演进时使用：

- `backend/src/server.ts` 路由增删改
- 请求/响应结构调整
- 错误对象、状态对象、上传与启动接口变更
- 历史、复测对比、报告查询结构变化
- 需要保证前后端兼容

## 先读什么

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

## 工作顺序/决策顺序

1. 先确认这次变化属于新增字段、字段重命名、资源结构调整、错误模型变化，还是路由行为变化。
2. 先找到全部消费方：frontend provider、feature 页面、mock API、fixtures、spec/docs。
3. 契约变化优先从共享类型和稳定对象语义出发，再回到 backend 资源映射与 frontend adapter。
4. 如果 handler 开始承担校验、映射、状态推进、错误翻译等多项职责，先拆层再改协议。
5. 交付时明确兼容性：是保持向后兼容、阶段性双写，还是必须同步消费者。

## 核心规则

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
7. 复用优先：优先扩展 `shared/contracts.d.ts`、backend 资源映射与前端 adapter，不要在多个 handler、页面或 mock 里散落另一份协议定义。
8. 模块拆分优先：route handler 应保持薄，字段拼装、错误翻译、资源映射、状态推进应拆到聚焦 service 或 mapper。
9. 文件体量控制：
   - backend route/service/adapter 通常接近 300 行就要考虑拆分
   - shared adapter/formatter/helper 超过约 200 行应按职责拆分
10. `backend/src/server.ts` 这类入口文件不是“大而全 handler”的模板；新增协议逻辑优先抽到可复用 mapper 或 service。
11. 任何契约改动都要同步检查：
   - `shared/contracts.d.ts`
   - `frontend/e2e/support/mockApi.ts`
   - `spec/DATA-SPEC.md` 或相关文档

## 何时联动其他 skills

- `shared-contracts-and-adapters`：共享类型和前端 view model 需要一起演进
- `badminton-analysis-flow`：API 变化来自上传/处理主流程
- `analysis-service-integration`：错误码或状态来自 Python 集成边界
- `docs-spec-sync`：公开协议含义发生变化
- `repo-delivery-baseline`：改动触及共享契约、构建或跨模块联调

## 何时读取 examples/

在完成消费者排查后再读最贴近的 example：

- `examples/task-status-response-shape.md`：任务状态对象或 stage 语义变化时读
- `examples/upload-api-evolution.md`：上传接口或启动入参需要演进时读
- `examples/backward-compatible-error-model.md`：错误对象要兼容扩展时读

## 任务完成后的输出要求

最终交付说明至少要写清：

- 改了哪些接口或对象
- 是否保持向后兼容；若没有，前端如何同步
