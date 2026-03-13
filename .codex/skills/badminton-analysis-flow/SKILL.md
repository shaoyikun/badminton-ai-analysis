---
name: badminton-analysis-flow
description: Use when changing the upload-to-analysis task flow, especially candidate clip coarse scan, user segment selection, task state transitions, polling, retry behavior, and frontend/backend coordination for badminton analysis.
---

# 何时使用这个 skill

当任务涉及分析主链路的状态流转时使用：

- 上传页流程重构
- 候选片段粗扫与选择
- `create -> upload -> start -> poll -> report/error` 链路调整
- 分析进度、错误恢复、重试策略
- mock/fallback 和真实接口并存的阶段性实现

# 仓库背景与上下文

当前真实链路已经不是最早的“一键上传即分析”，而是：

1. 前端创建任务
2. 上传完整视频
3. backend 做视频校验与粗扫候选片段
4. 前端展示 `SegmentScanSummary`
5. 用户确认 `selectedSegmentId`
6. backend 仅对选中片段做抽帧与精分析
7. 前端轮询任务状态并跳转报告或错误页

先读：

- `shared/contracts.d.ts`
- `docs/algorithm-baseline.md`
- `frontend/src/app/AnalysisSessionProvider.tsx`
- `frontend/src/features/upload/UploadPage.tsx`
- `frontend/src/features/processing/ProcessingPage.tsx`
- `backend/src/services/taskService.ts`

# 核心规则

1. 显式建模状态，避免散落 boolean。
2. 至少区分两层状态：
   - 候选片段状态：`未选文件 / 粗扫中 / 粗扫完成 / 粗扫失败 / 已选片段`
   - 分析状态：`idle / starting / analyzing / success / error`
3. 任务协议继续以 `TaskStatusResponse.status + stage + error` 为主，不要重新发明另一套前后端不一致的状态名。
4. 候选片段契约优先复用：
   - `SegmentScanSummary`
   - `SwingSegmentCandidate`
   - `selectedSegmentId`
5. 错误恢复要明确区分：
   - 可在上传页页内重试
   - 需要跳错误页
   - 只能重新上传新任务
6. 真实接口缺失时可以做 mock/fallback，但要满足两条：
   - 字段名和真实 contracts 一致
   - 页面逻辑不要依赖 mock 才成立
7. 前端页面跳转与任务状态要对齐当前实现：
   - `/upload`
   - `/processing`
   - `/report`
   - `/error`
8. 若更改了任务阶段、错误码、候选片段对象或启动入参，必须联动 `backend-api-contracts` 和 `shared-contracts-and-adapters`。

# 推荐代码组织方式

- 前端状态汇总继续收口在 `AnalysisSessionProvider`
- 页面只消费 provider 或 adapter 后的 UI 状态
- backend 任务推进继续收口在 `taskService`
- 候选片段相关的共享结构优先放 `shared/contracts.d.ts`
- 不要把粗扫逻辑、任务跳转、轮询、副作用同时塞进页面 JSX

# 与其他 skills 的协作边界

- 与 `backend-api-contracts` 联动：当 `start` 入参、任务状态、错误结构变化时
- 与 `analysis-service-integration` 联动：当粗扫、抽帧、pose 执行边界变化时
- 与 `shared-contracts-and-adapters` 联动：当需要新的前端 view model 时
- 与 `badminton-playwright-mobile-qa` 联动：当主流程交互变化时
- 与 `docs-spec-sync` 联动：当上传/处理主流程语义变化时

# 任务完成后的输出要求

最终交付说明至少要写清：

- 改动后的状态机长什么样
- 是否变更了候选片段或任务状态对象
- 成功、失败、重试分别怎么走
- 跑了哪些联调或 E2E 验证；如果没覆盖异常流，要明确风险
