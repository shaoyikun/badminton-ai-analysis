---
name: shared-contracts-and-adapters
description: Use when evolving shared/contracts.d.ts, building frontend adapters or view models, or mapping backend response shapes into stable UI-facing models for report, progress, history, and candidate clip flows.
---

# Shared Contracts And Adapters

## 何时使用

当任务需要处理“共享结构”与“前端可渲染模型”之间的边界时使用：

- 新增或修改 `shared/contracts.d.ts`
- 从 backend 响应映射前端展示对象
- 报告、进度、候选片段、历史、对比的 adapter 设计
- 避免前端直接裸渲染原始后端字段

## 先读什么

当前仓库已经有共享契约，但前端仍需要把它变成页面可用模型。先读：

- `shared/contracts.d.ts`
- `backend/src/types/task.ts`
- `frontend/src/app/AnalysisSessionProvider.tsx`
- `frontend/src/features/upload/uploadFlow.ts`
- `frontend/src/components/result-views/`

真实例子包括：

- `TaskStatusResponse` 到处理中页步骤文案
- `SegmentScanSummary` 到候选片段卡片
- `ReportResult` 到 `ReportView`
- 错误码到上传页 banner / 错误页文案

## 工作顺序/决策顺序

1. 先判断新增信息属于跨模块稳定语义，还是只属于前端页面展示层。
2. 共享契约变化先从 `shared/contracts.d.ts` 设计，再回到 backend 资源映射与 frontend adapter。
3. 如果页面开始重复状态判断、label map、文案拼装，优先抽 adapter 或 formatter，而不是继续复制条件分支。
4. 当 adapter 同时承担多类 view model 时，应按报告、进度、候选片段、历史等边界拆开。
5. 交付时清楚说明“共享字段改了什么”“页面渲染因此少耦合了什么”。

## 核心规则

1. `shared/contracts.d.ts` 是共享语义层，不是页面文案层。
2. 前端不要直接把 backend 原始字段名当 UI 文案；需要 adapter、formatter、label map 时要显式封装。
3. 新对象优先先判断属于哪一层：
   - 跨模块稳定数据：放 `shared/contracts.d.ts`
   - backend 内部行存储或资源转换：放 `backend/src/types/task.ts`
   - 页面展示拼装：放 frontend adapter 或 feature helper
4. 为以下场景优先建立 adapter：
   - 报告 hero 与问题摘要
   - 分析进度步骤
   - 候选片段卡片与推荐标记
   - 历史记录摘要与当前基线状态
5. 复用优先：优先扩展现有 adapter、label map、formatter 与 mapper，不要在多个页面各自维护一套拼装逻辑。
6. 模块拆分优先：共享契约、backend 资源映射、frontend view model、文案映射应按职责分层，不要混进单个 provider 或组件。
7. 文件体量控制：
   - shared adapter/formatter/helper 超过约 200 行应按职责拆分
   - frontend page/provider/component 通常接近 250 行就要考虑拆分
8. `AnalysisSessionProvider` 和 `frontend/src/components/result-views/utils.ts` 这类承接映射逻辑的文件不是无限增长模板；新增映射优先外抽。
9. 共享契约变更必须联动：
   - backend 资源映射
   - frontend provider / adapter
   - Playwright mock 数据
10. 不要在多个页面重复写同一组 label map、状态判断、文案拼装。

## 何时联动其他 skills

- `backend-api-contracts`：共享类型来自接口调整
- `badminton-h5-product-ui`：adapter 直接服务页面改造
- `badminton-analysis-flow`：候选片段、进度状态需要 UI 映射
- `docs-spec-sync`：共享结构语义发生公开变化

## 何时读取 examples/

当你已经确认变化属于哪类 view model 后，再读对应 example：

- `examples/report-adapter-pattern.md`：报告页展示模型变化时读
- `examples/progress-view-model.md`：处理中步骤和进度映射变化时读
- `examples/candidate-clip-contract-shape.md`：候选片段共享结构与卡片映射变化时读

## 任务完成后的输出要求

最终交付说明至少要写清：

- 改了哪些共享类型
- 新增了哪些 adapter 或 view model
- 前端哪些页面因此变得更稳定或更少耦合
- mock、文档、消费方是否已同步
