---
name: badminton-analysis-flow
description: Use when changing the upload-to-analysis task flow, especially candidate clip coarse scan, user segment selection, task state transitions, polling, retry behavior, and frontend/backend coordination for badminton analysis.
---

# Badminton Analysis Flow

## 何时使用

当任务涉及分析主链路的状态流转时使用：

- 上传页流程重构
- 候选片段粗扫与选择
- `create -> upload -> start -> poll -> report/error` 链路调整
- 分析进度、错误恢复、重试策略
- mock/fallback 和真实接口并存的阶段性实现

## 先读什么

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

## 工作顺序/决策顺序

1. 先确认变化落在上传前、粗扫候选片段、用户选片、启动分析、处理中轮询还是错误恢复阶段。
2. 先保证 `TaskStatusResponse`、`SegmentScanSummary`、`selectedSegmentId` 的语义稳定，再去改页面跳转和 UI 文案。
3. state mapping、轮询、副作用和页面渲染要按层拆开，不要因为流程复杂就把所有逻辑塞回页面或 provider。
4. backend 侧先改任务推进和状态来源，再让 frontend provider/adapter 消费新的稳定对象。
5. 如果流程变化来自契约或 Python 边界，及时联动对应 skill，而不是在页面里硬补兼容逻辑。

## 核心规则

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
   - `/analyses/new`
   - `/analyses/:taskId/processing`
   - `/analyses/:taskId/report`
   - `/error`
8. 复用优先：优先扩展现有 provider、task service、upload helper、progress mapping 和 mock builder，不要新增第二套状态机。
9. 模块拆分优先：上传准备、候选片段选择、轮询、状态映射、跳转副作用应拆成聚焦模块，不要让单个页面或 provider 同时承担所有职责。
10. 文件体量控制：
   - frontend page/provider/component 通常接近 250 行就要考虑拆分
   - backend route/service/adapter 通常接近 300 行就要考虑拆分
   - shared adapter/formatter/helper 超过约 200 行应按职责拆分
11. `AnalysisSessionProvider` 和 `UploadPage` 已是待拆大文件。新增流程逻辑优先抽成 helper、section component 或 flow module；若未拆分，交付说明必须说明原因。
12. 若更改了任务阶段、错误码、候选片段对象或启动入参，必须联动 `backend-api-contracts` 和 `shared-contracts-and-adapters`。

## 常见错误 / Anti-patterns

- 不要把“上传完整视频 -> 候选片段确认 -> 微调 -> 启动分析”长期压在上传页里。
- 不要把候选片段选择区做成默认常驻的大型工作台；优先使用独立步骤页、全屏弹层或轻量二级承接。
- 不要把微调能力做成参数控制台式的主内容；默认应是可选高级能力。
- 不要让流程页继续显示会打断任务的全局导航，尤其是处理中、错误恢复、选片确认这类单任务页面。

## 新增执行规则

- 当 `segmentScan` 已经形成稳定阶段时，前端默认应该给它单独的页面或独立承接面，而不是继续塞回上传准备页。
- 进入 `startSelectedSegmentFlow` 前，页面应先明确告诉用户“当前在第几步、下一步会发生什么”。
- 若页面上同时出现候选片段、详细指标和微调控件，先判断是否应拆页；不要默认继续压在一个组件里。

## 何时联动其他 skills

- `backend-api-contracts`：`start` 入参、任务状态、错误结构变化
- `analysis-service-integration`：粗扫、抽帧、pose 执行边界变化
- `shared-contracts-and-adapters`：需要新的前端 view model
- `badminton-playwright-mobile-qa`：主流程交互变化
- `docs-spec-sync`：上传/处理主流程语义变化
- `repo-delivery-baseline`：需要决定 build/test/verify/evaluate 跑法

## 何时读取 examples/

在确认你改的是哪一段流程之后，再读对应 example：

- `examples/candidate-clip-flow.md`：候选片段粗扫与选择变化时读
- `examples/async-analysis-progress.md`：处理中轮询、进度反馈变化时读
- `examples/failure-recovery-pattern.md`：错误恢复与重试策略变化时读
- `examples/upload-vs-segment-boundary.md`：需要明确上传准备页与片段确认页边界时读

## 任务完成后的输出要求

最终交付说明至少要写清：

- 改了哪一段流程，状态如何变化
- 前后端如何协调，是否新增或调整共享字段
- 错误恢复、重试或跳转逻辑如何变化
- 哪些页面、测试、mock 或文档需要同步
