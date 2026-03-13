---
name: analysis-pipeline
description: Use when the task touches the badminton analysis pipeline across upload, preprocess, pose estimation, scoring, report generation, history, retest comparison, or the frontend analysis flow.
---

# Analysis Pipeline

## 何时使用

当任务跨越羽毛球分析主链路的多个边界时使用这个 umbrella skill：

- 一次改动同时触及 `frontend/`、`backend/`、`analysis-service/`、`shared/` 中两个以上子系统
- 需要先判断主问题落在上传、粗扫、姿态估计、评分、报告、历史或复测对比的哪一段
- 你还不确定应该优先调用哪个更窄的 specialized skill

## 先读什么

- `AGENTS.md`
- `shared/contracts.d.ts`
- `frontend/src/app/AnalysisSessionProvider.tsx`
- `backend/src/server.ts`
- `backend/src/services/taskService.ts`
- `analysis-service/app.py`

## 工作顺序/决策顺序

1. 先把真实链路按 `create -> upload -> segment scan -> start -> pose -> report -> history/compare` 过一遍，确认变更穿过了哪些边界。
2. 找出当前任务的主责任层，再决定是否联动 specialized skill，而不是用这个 skill 把所有细节都重写一遍。
3. 先沿着生产者到消费者 trace 一次：接口、存储、产物、前端 adapter、页面渲染。
4. 只在最窄的责任层落实现；若多个层都要改，再同步共享契约、测试与文档。
5. 最终交付时明确说明主链路哪一段变了、哪些子系统被联动、为什么这样拆分。

## 核心规则

1. 复用优先：优先扩展已有 service、adapter、component、fixture 和脚本，不新增平行流程或第二真源。
2. 模块拆分优先：新职责应拆到聚焦模块，例如 orchestration、mapping、error handling、UI section、formatter，而不是继续把混合职责堆回单个文件。
3. 文件体量控制：
   - frontend page/provider/component 通常接近 250 行就要考虑拆分，除非只是很薄的组合壳层
   - backend route/service/adapter 通常接近 300 行就要考虑拆分
   - shared adapter/formatter/helper 超过约 200 行或开始承载多个 view-model 家族时应拆分
4. 现有超大文件是待偿还债务，不是模板。`AnalysisSessionProvider`、`UploadPage`、评分服务、Python pose 逻辑都应优先向外抽新逻辑，而不是继续追加 inline 分支。
5. 如果任务确实无法避免继续改大文件，最终说明必须交代为什么这次没有抽模块，以及下次的拆分落点。
6. 这个 skill 负责全链路定位，不负责替代 specialized skill 的细分规则；遇到明确子域时应切到更窄的 skill。

## 何时联动其他 skills

- `backend-api-contracts`：接口、错误对象、状态对象、共享契约变化
- `badminton-analysis-flow`：上传、选片、轮询、跳转、重试主流程变化
- `analysis-service-integration`：`ffprobe` / `ffmpeg` / Python 输入输出边界变化
- `shared-contracts-and-adapters`：共享类型、前端 view model、adapter 变化
- `badminton-h5-product-ui`：移动端页面产品化和信息层级变化
- `badminton-playwright-mobile-qa`：主流程 E2E 需要补齐
- `evaluation-and-regression`：评分、阈值、姿态摘要、baseline 变化
- `repo-delivery-baseline`：需要判断 build/test/verify/evaluate 跑哪些
- `docs-spec-sync`：实现变化会导致文档失真

## 何时读取 examples/

当前这个 skill 没有 examples 目录。当你已经定位到更窄的责任层时，应切换到对应的 specialized skill，并按那个 skill 的 examples 指引读取具体模式。

## 任务完成后的输出要求

最终交付说明至少要写清：

- 主链路的哪一段变了，影响了哪些子系统
- 主实现落在哪个责任层，为什么没有把逻辑堆回已有大文件
- 联动了哪些 specialized skills，对应同步了哪些契约、测试或文档
- 这次跑了哪些验证，还剩哪些 end-to-end 风险
