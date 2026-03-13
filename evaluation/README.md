# 离线评测

`evaluation/` 用来提供一个最小可运行、可复现的离线评测框架，目标是让后续算法和规则迭代能被量化对比，而不是靠手工回忆。

当前约束：

- 正式动作范围已开放为 `clear + smash`
- `smash` 既有公开 runtime 能力，也保留独立离线回归基线
- 仓库内 fixture 以轻量 artifact 为主，不假装拥有大规模真实标签
- 当前 checked-in 回归集默认使用 artifact fixture，避免依赖本机必须安装 `ffprobe` / `ffmpeg`
- CLI 仍支持 `videoPath`，本地环境装好相关依赖后可额外添加视频 smoke case
- 其他回归样例优先使用 `poseResult` snapshot，避免把仓库变成素材仓

## 目录结构

```text
evaluation/
  README.md
  baseline.json
  fixtures/
    index.json
    pose/
      clear-under-rotation.pose.json
      clear-racket-arm-prep-gap.pose.json
      clear-bad-camera.pose.json
      clear-subject-too-small.pose.json
      clear-poor-lighting-or-occlusion.pose.json
      clear-boundary-analyzable.pose.json
      clear-boundary-rejected.pose.json
      smash-normal.pose.json
      smash-weak-loading.pose.json
      smash-arm-prep-gap.pose.json
      smash-bad-camera.pose.json
      smash-subject-too-small.pose.json
```

## Fixture 格式

`evaluation/fixtures/index.json` 维护 case 列表。每个 case 使用以下最小结构：

```json
{
  "requiredCoverageTagsByAction": {
    "clear": [
      "bad_camera",
      "subject_too_small",
      "poor_lighting_or_occlusion",
      "weak_preparation",
      "stable_preparation"
    ],
    "smash": [
      "bad_camera",
      "subject_too_small",
      "weak_loading",
      "stable_loading"
    ]
  },
  "fixtures": [
    {
      "id": "clear-under-rotation",
      "actionType": "clear",
      "input": {
        "poseResultPath": "./pose/clear-under-rotation.pose.json"
      },
      "expected": {
        "cameraQuality": "good",
        "majorIssueLabels": ["body_preparation_gap"],
        "analysisDisposition": "analyzable"
      },
      "coverageTags": ["weak_preparation"],
      "notes": "专项 body-preparation 回归样例",
      "reviewerNotes": "当前主要观察转体不足是否仍能稳定命中"
    }
  ]
}
```

支持的输入源：

- `input.videoPath`
  - 直接从视频走 `ffprobe` + `ffmpeg` + pose + report，适合本地 smoke case
- `input.preprocessDir`
  - 直接回放 preprocess 目录，适合复现抽帧后问题
- `input.poseResultPath`
  - 直接复用 pose snapshot 跑 report scoring，最轻量

约定：

- `actionType`
  - checked-in baseline suite 当前允许：
    - `clear`
    - `smash`
  - 其中 `smash` 只用于离线 shadow mode，不代表公开 runtime 已开放
- `requiredCoverageTagsByAction`
  - checked-in baseline suite 必须按动作声明并覆盖：
    - `clear`：`bad_camera`、`subject_too_small`、`poor_lighting_or_occlusion`、`weak_preparation`、`stable_preparation`
    - `smash`：`bad_camera`、`subject_too_small`、`weak_loading`、`stable_loading`
  - 自定义 ad hoc suite 仍可继续使用旧的 `requiredCoverageTags`
  - 一旦声明，就会强制校验覆盖完整性
- `coverageTags`
  - 每个 fixture 都必须至少标记一个 tag
  - 用来说明这个样本守护的是哪一类最小回归场景
- `expected.cameraQuality` 取值：
  - `good`
  - `limited`
  - `poor`
- `expected.majorIssueLabels` 使用稳定标签，优先复用 report `issueCategory`
- `expected.analysisDisposition` 取值：
  - `analyzable`
  - `low_confidence`
  - `rejected`

## Baseline

`evaluation/baseline.json` 是 checked-in golden baseline，按 case 记录：

- `analysisDisposition`
- `rejectionReasons`
- `lowConfidenceReasons`
- `topIssueLabels`
- `totalScore`
- `confidenceScore`
- `scoreVariance`
- `temporalConsistency`
- `motionContinuity`
- `fallbacksUsed`
- `recommendedSegmentAvailable`
- `selectedSegmentAvailable`
- `analyzedSegmentConsistent`
- `samplingStrategyVersion`
- `sampledFrameCount`
- `motionBoostedFrameCount`
- `sampledFrameDiversity`
- `motionWindowCount`
- `phaseCoverage`
- `insufficientEvidenceRatio`
- `inputQualityRejectRatio`
- `lowConfidenceRatio`

默认运行会把 current 与 baseline 对比并输出摘要；只有显式加 `--update-baseline` 才会刷新文件。

## 运行方式

推荐入口：

```bash
make evaluate
./scripts/evaluate.sh --action-type clear
./scripts/evaluate.sh --action-type smash
```

等价脚本：

```bash
./scripts/evaluate.sh
./scripts/evaluate.sh --action-type smash
./scripts/evaluate.sh --json
./scripts/evaluate.sh --update-baseline
```

默认行为：

- `make evaluate` / `./scripts/evaluate.sh`
  - 评测通过时返回 `0`
  - 遇到以下任一情况返回非零：
    - fixture index 缺少 `requiredCoverageTagsByAction`
    - checked-in baseline 缺 case
    - current 与 baseline 有 drift
- `--action-type`
  - `all`：默认值，同时跑 `clear + smash`
  - `clear`：只跑公开 clear 基线
  - `smash`：只跑离线 shadow smash 基线
- `--update-baseline`
  - 只有在明确接受新行为时才使用
  - 会刷新 `evaluation/baseline.json`
  - 刷新后退出成功

默认输出包括：

- 分析成功率
- disposition 一致性命中率
- camera quality 一致性命中率
- `primaryErrorCode` 分布
- `analysisDisposition` 分布
- `rejectionReasons` 分布
- `lowConfidenceReasons` 分布
- `majorIssueLabels` 命中率与 miss case
- `requiredCoverageTagsByAction` 的 required / present / missing 状态
- 按动作分组的 fixture 数、disposition 分布、issue hit 和 baseline drift
- `scoreVariance` / `temporalConsistency` / `motionContinuity` 聚合统计
- `phaseCoverage` / `motionBoostedFrameCount` / `insufficientEvidenceRatio` / `lowConfidenceRatio` 聚合统计
- baseline vs current 差异摘要

口径说明：

- `successRate`
  - 定义为“非 `rejected` case / 全部 case”
  - `low_confidence` 仍视为任务成功完成，但会被单独计入 disposition 分布
- `primaryErrorCode`
  - `rejected`：首个 hard reject reason
  - `low_confidence`：首个 low-confidence reason
  - `analyzable`：`none`

## 什么算回归

默认把以下情况视为需要解释或处理的回归：

- baseline drift
- disposition match rate 下降
- top issue hit rate 下降
- `requiredCoverageTagsByAction` 缺失
- `primaryErrorCode` 分布出现未解释变化

如果只是预期内行为变化，也不要直接忽略；应先确认变化原因，再决定是否执行 `--update-baseline`。

## 真实视频 smoke validation

如果本地额外准备少量真实视频，建议每轮只看 3~5 条，并重点确认：

1. `recommendedSegmentId` 和最终 `selectedSegmentWindow` 是否合理地落在单次挥拍上。
2. manifest 里的 `samplingStrategyVersion`、`sampledFrames[].sourceType`、`motionWindows` 是否显示 motion boosted 帧确实补到了动作变化峰值。
3. `inputQualityCategory`、`evidenceQualityFlags`、`phaseCoverage`、`insufficientEvidenceReasons` 是否把“输入质量差 / 证据不足”从“动作问题”里分离出来。
4. `make evaluate` 的 drift 是否能由 segment 抽帧、phase coverage 或 input-quality gating 解释，而不是只在某个 fixture 上看起来更好。

## 新增样本

1. 决定输入类型：优先 `poseResultPath`，其次 `preprocessDir`，最后才是 `videoPath`
2. 把 artifact 放进 `evaluation/fixtures/`
3. 在 `evaluation/fixtures/index.json` 新增 case
4. 先运行一次：

```bash
./scripts/evaluate.sh --json
./scripts/evaluate.sh --action-type smash --json
```

5. 确认结果后刷新 baseline：

```bash
./scripts/evaluate.sh --update-baseline
```

6. 提交时附带说明这个 case 主要守护什么回归

## 什么时候必须补跑评测

以下改动默认都要补跑 `make evaluate`：

- `backend/src/services/reportScoringService.ts` 中的评分、阈值、fallback 逻辑
- pose summary / rejection reason / `debugCounts` 契约变动
- fixture / baseline / evaluation summary 逻辑变动
- 任何会影响 `analysisDisposition`、`issues`、`rejectionReasons`、`lowConfidenceReasons` 的改动

仅当你明确接受新的评测输出，才允许刷新 checked-in baseline。

## 当前局限

- 仍然没有真正的动作阶段切分
- 仍然没有球拍、羽球、击球点检测
- `viewProfile` 仍是轻量几何推断，不是时序分类器
- 当前报告仍以 summary 聚合证据为主
- `repeatability` 仍依赖 `contactPreparationScore + scoreVariance + temporalConsistency + motionContinuity`
- `camera quality` 仍依赖 `camera_suitability + invalid_camera_angle + view stability`
- 某些专项特征不可观测时，仍会回退到旧 turn/lift 兼容特征；baseline 会记录 `fallbacksUsed`
- `smash` shadow 当前只能判断身体加载、挥拍臂加载和击球前后连贯性，不能判断真实击球点、球速、落点或球拍/羽球质量
