# 离线评测

`evaluation/` 用来提供一个最小可运行、可复现的离线评测框架，目标是让后续算法和规则迭代能被量化对比，而不是靠手工回忆。

当前约束：

- 正式动作范围已收敛为 `clear-only`
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
      clear-boundary-analyzable.pose.json
      clear-boundary-rejected.pose.json
```

## Fixture 格式

`evaluation/fixtures/index.json` 维护 case 列表。每个 case 使用以下最小结构：

```json
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
  "notes": "专项 body-preparation 回归样例",
  "reviewerNotes": "当前主要观察转体不足是否仍能稳定命中"
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

- `actionType` 当前只允许 `clear`
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

默认运行会把 current 与 baseline 对比并输出摘要；只有显式加 `--update-baseline` 才会刷新文件。

## 运行方式

推荐入口：

```bash
make evaluate
```

等价脚本：

```bash
./scripts/evaluate.sh
./scripts/evaluate.sh --json
./scripts/evaluate.sh --update-baseline
```

默认输出包括：

- 分析成功率
- `analysisDisposition` 分布
- `rejectionReasons` 分布
- `lowConfidenceReasons` 分布
- `majorIssueLabels` 命中率与 miss case
- `scoreVariance` / `temporalConsistency` / `motionContinuity` 聚合统计
- baseline vs current 差异摘要

## 新增样本

1. 决定输入类型：优先 `poseResultPath`，其次 `preprocessDir`，最后才是 `videoPath`
2. 把 artifact 放进 `evaluation/fixtures/`
3. 在 `evaluation/fixtures/index.json` 新增 case
4. 先运行一次：

```bash
./scripts/evaluate.sh --json
```

5. 确认结果后刷新 baseline：

```bash
./scripts/evaluate.sh --update-baseline
```

6. 提交时附带说明这个 case 主要守护什么回归

## 当前局限

- 仍然没有真正的动作阶段切分
- 仍然没有球拍、羽球、击球点检测
- `viewProfile` 仍是轻量几何推断，不是时序分类器
- 当前报告仍以 summary 聚合证据为主
- `repeatability` 仍依赖 `contactPreparationScore + scoreVariance + temporalConsistency + motionContinuity`
- `camera quality` 仍依赖 `camera_suitability + invalid_camera_angle + view stability`
- 某些专项特征不可观测时，仍会回退到旧 turn/lift 兼容特征；baseline 会记录 `fallbacksUsed`
