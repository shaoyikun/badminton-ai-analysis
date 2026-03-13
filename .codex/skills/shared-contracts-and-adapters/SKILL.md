---
name: shared-contracts-and-adapters
description: Use when evolving shared/contracts.d.ts, building frontend adapters or view models, or mapping backend response shapes into stable UI-facing models for report, progress, history, and candidate clip flows.
---

# 何时使用这个 skill

当任务需要处理“共享结构”与“前端可渲染模型”之间的边界时使用：

- 新增或修改 `shared/contracts.d.ts`
- 从 backend 响应映射前端展示对象
- 报告、进度、候选片段、历史、对比的 adapter 设计
- 避免前端直接裸渲染原始后端字段

# 仓库背景与上下文

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

# 核心规则

1. `shared/contracts.d.ts` 是共享语义层，不是页面文案层。
2. 前端不要直接把 backend 原始字段名当 UI 文案；需要 adapter / formatter / label map 时要显式封装。
3. 新对象优先先判断属于哪一层：
   - 跨模块稳定数据：放 `shared/contracts.d.ts`
   - backend 内部行存储或资源转换：放 `backend/src/types/task.ts`
   - 页面展示拼装：放 frontend adapter / feature helper
4. 为以下场景优先建立 adapter：
   - 报告 hero 与问题摘要
   - 分析进度步骤
   - 候选片段卡片与推荐标记
   - 历史记录摘要与当前基线状态
5. 共享契约变更必须联动：
   - backend 资源映射
   - frontend provider / adapter
   - Playwright mock 数据
6. 不要在多个页面重复写同一组 label map、状态判断、文案拼装。

# 推荐代码组织方式

- 共享类型继续收口在 `shared/contracts.d.ts`
- backend 资源转换继续集中在 `backend/src/types/task.ts`
- 前端特定 adapter 可放在 feature 目录或 `components/result-views/utils.ts`
- 用户可见 label / 文案映射可放在 feature helper，例如 `uploadFlow.ts`

# 与其他 skills 的协作边界

- 与 `backend-api-contracts` 联动：当共享类型来自接口调整时
- 与 `badminton-h5-product-ui` 联动：当 adapter 直接服务页面改造时
- 与 `badminton-analysis-flow` 联动：当候选片段、进度状态需要 UI 映射时
- 与 `docs-spec-sync` 联动：当共享结构语义发生公开变化时

# 任务完成后的输出要求

最终交付说明至少要写清：

- 改了哪些共享类型
- 新增了哪些 adapter / view model
- 前端哪些页面因此变得更稳定或更少耦合
- mock、文档、消费方是否已同步
