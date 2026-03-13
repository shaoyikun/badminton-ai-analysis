---
name: evaluation-and-regression
description: Use when changing scoring, thresholds, pose summaries, fixtures, baselines, or any behavior that should be defended by evaluation/ offline regression checks and baseline drift review.
---

# Evaluation And Regression

## 何时使用

当任务可能改变算法或报告输出行为时使用：

- 评分、阈值、fallback、`analysisDisposition`
- pose summary / rejection reason
- `evaluation/fixtures`、`baseline.json`
- `backend/src/dev/evaluateFixtures.ts` 或 `scripts/evaluate.sh`

## 先读什么

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

## 工作顺序/决策顺序

1. 先判断这次变化是否会影响评测输出；如果会，默认准备补跑 `make evaluate`。
2. 先看 baseline 和 fixture 是如何表达当前行为的，再决定是预期 drift 还是实现回归。
3. 修改评分或摘要逻辑时，优先把新增职责拆到聚焦 helper，而不是继续把分支堆回超大评分文件。
4. baseline 只有在行为预期变化时才更新；先解释变化，再决定是否刷新 golden。
5. 交付时必须同时说明“跑没跑 evaluate”“看到了什么 drift”“为什么接受或不接受”。

## 核心规则

1. 先判断这次改动是否会影响评测输出；如果会，默认补跑 `make evaluate`。
2. 以下改动几乎总是需要评测：
   - 评分维度或阈值
   - `rejectionReasons` / `lowConfidenceReasons`
   - `analysisDisposition`
   - fixture / baseline / summary 逻辑
3. baseline 不是快照垃圾桶；只有明确接受新行为时才更新。
4. 解读结果不要只看总通过或失败，要一起看：
   - disposition drift
   - top issue hit rate
   - `primaryErrorCode` 分布
   - coverage tags 缺失
5. 新样本优先使用轻量输入：
   - 先 `poseResultPath`
   - 再 `preprocessDir`
   - 最后才是 `videoPath`
6. 复用优先：优先扩展现有 evaluation 脚本、fixture 元数据、summary 逻辑和基线对比口径，不要新增平行评测入口。
7. 模块拆分优先：评分计算、summary 归一化、drift 判读、fixture 构造应按职责拆开，避免单个文件吞掉全部评测逻辑。
8. 文件体量控制：
   - backend route/service/adapter 通常接近 300 行就要考虑拆分
   - shared adapter/formatter/helper 超过约 200 行应按职责拆分
9. `backend/src/services/reportScoringService.ts`、`backend/src/services/shadowReportScoringService.ts` 和 `analysis-service/services/pose_estimator.py` 已是待拆债务。新增逻辑优先向外抽 helper；若未拆分，交付说明必须说明原因。
10. 如果输出变化是预期的，也要在交付说明里解释原因，而不是直接刷新 baseline。

## 何时联动其他 skills

- `analysis-service-integration`：pose 输出或分析边界变化
- `backend-api-contracts`：结果对象或错误语义变化会影响公开协议
- `badminton-analysis-flow`：状态流转会改变任务结果分布
- `repo-delivery-baseline`：需要决定是否把 `make evaluate` 提升为必跑项
- `docs-spec-sync`：能力边界或评测口径变化

## 何时读取 examples/

确认变化会影响评测后，再读最贴近的 example：

- `examples/algorithm-change-evaluation.md`：算法或评分逻辑变化时读
- `examples/baseline-update-rule.md`：判断是否应更新 baseline 时读
- `examples/regression-triage.md`：出现 drift 需要归因和分级时读

## 任务完成后的输出要求

最终交付说明至少要写清：

- 为什么需要或不需要跑 `make evaluate`
- 评测里看到了什么 drift 或没有看到什么 drift
- 是否更新 baseline；如果更新了，为什么是预期变化
- 剩余未覆盖的样本风险是什么
