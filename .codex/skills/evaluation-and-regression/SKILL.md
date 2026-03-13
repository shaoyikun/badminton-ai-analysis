---
name: evaluation-and-regression
description: Use when changing scoring, thresholds, pose summaries, fixtures, baselines, or any behavior that should be defended by evaluation/ offline regression checks and baseline drift review.
---

# 何时使用这个 skill

当任务可能改变算法或报告输出行为时使用：

- 评分、阈值、fallback、`analysisDisposition`
- pose summary / rejection reason
- `evaluation/fixtures`、`baseline.json`
- `backend/src/dev/evaluateFixtures.ts` 或 `scripts/evaluate.sh`

# 仓库背景与上下文

这个仓库已经有真实离线评测基线，不是空白约定。先读：

- `evaluation/README.md`
- `evaluation/baseline.json`
- `evaluation/fixtures/index.json`
- `backend/src/dev/evaluateFixtures.ts`
- `scripts/evaluate.sh`

当前约束包括：

- `make evaluate` 默认跑 `clear + smash`
- drift、缺 baseline case、缺 `requiredCoverageTagsByAction` 会返回非零
- `successRate`、`analysisDisposition`、`primaryErrorCode` 都是现有观测口径

# 核心规则

1. 先判断这次改动是否会影响评测输出；如果会，默认补跑 `make evaluate`。
2. 以下改动几乎总是需要评测：
   - 评分维度或阈值
   - `rejectionReasons` / `lowConfidenceReasons`
   - `analysisDisposition`
   - fixture / baseline / summary 逻辑
3. baseline 不是快照垃圾桶；只有明确接受新行为时才更新。
4. 解读结果不要只看总通过/失败，要一起看：
   - disposition drift
   - top issue hit rate
   - `primaryErrorCode` 分布
   - coverage tags 缺失
5. 新样本优先使用轻量输入：
   - 先 `poseResultPath`
   - 再 `preprocessDir`
   - 最后才是 `videoPath`
6. 如果输出变化是预期的，也要在交付说明里解释原因，而不是直接刷新 baseline。

# 推荐代码组织方式

- 评测入口继续保持在 `scripts/evaluate.sh` 与 `backend/src/dev/evaluateFixtures.ts`
- fixture 元数据继续集中在 `evaluation/fixtures/index.json`
- checked-in golden baseline 继续集中在 `evaluation/baseline.json`
- 不要把 ad hoc 调试样本混进正式 baseline 而不加 coverage 语义

# 与其他 skills 的协作边界

- 与 `analysis-service-integration` 联动：当 pose 输出或分析边界变化时
- 与 `backend-api-contracts` 联动：当结果对象或错误语义变化会影响公开协议时
- 与 `badminton-analysis-flow` 联动：当状态流转会改变任务结果分布时
- 与 `repo-delivery-baseline` 联动：当需要决定是否把 `make evaluate` 提升为必跑项时
- 与 `docs-spec-sync` 联动：当能力边界或评测口径变化时

# 任务完成后的输出要求

最终交付说明至少要写清：

- 为什么需要或不需要跑 `make evaluate`
- 评测里看到了什么 drift 或没有看到什么 drift
- 是否更新 baseline；如果更新了，为什么是预期变化
- 剩余未覆盖的样本风险是什么
