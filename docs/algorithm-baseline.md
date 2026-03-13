# 当前算法基线

这份文档描述 2026-03-13 当前仓库里的动作分析基线实现，目标是帮助开发联调、问题排查和后续算法迭代。它描述的是“现在代码实际上怎么做”，不是下一版方案。

## 调用链

1. 前端创建任务并上传视频。
2. backend 用 `ffprobe` 读取视频元数据，再用 `ffmpeg` 按均匀时间点抽帧。
3. backend 通过子进程调用 `analysis-service/app.py <preprocess-task-dir>`。
4. Python `pose_estimator.py` 优先走 MediaPipe Tasks `VIDEO` mode，对抽帧序列做时序姿态估计与 EMA smoothing，生成 keypoints、per-frame metrics、summary。
5. backend 读取 pose result，若 `summary.rejectionReasons` 非空则直接按首个拒绝原因失败。
6. 若 pose 通过门槛，backend `reportScoringService.ts` 用规则分数生成 report 和 `scoringEvidence`。

## 当前使用的指标

### 单帧指标

每帧同时保留三层指标：

- `rawMetrics`
  - 基于原始 keypoints 直接计算。
- `smoothedMetrics`
  - 基于 EMA 平滑后的 keypoints 计算。
- `finalMetrics`
  - 以 `smoothedMetrics` 为基础，再叠加轻量证据门控。
- `metrics`
  - 为兼容旧消费保留，等于 `finalMetrics`。

- `stabilityScore`
  - 由肩、髋、手腕、鼻子的 visibility 平均值得到。
- `shoulderSpan`
  - 左右肩横向间距。
- `hipSpan`
  - 左右髋横向间距。
- `bodyTurnScore`
  - raw 层仍以肩宽为主；final 层会叠加肩髋深度差与可见性门控，压制“肩变窄但深度证据不足”的假侧身高分。
- `racketArmLiftScore`
  - raw 层仍以肩腕高度差为主；final 层会叠加肘部支撑门控，压制腕点瞬时抖动造成的虚高。
- `subjectScale`
  - `max(shoulderSpan, hipSpan, torsoHeight)`。
- `compositeScore`
  - `stability * 0.45 + turn * 0.3 + lift * 0.25`。

### Summary 指标

- `usableFrameCount`
  - 达到 usable 条件的帧数。
- `coverageRatio`
  - `usableFrameCount / frameCount`。
- `medianStabilityScore`
  - usable 帧的稳定度中位数。
- `medianBodyTurnScore`
  - usable 帧的侧身中位数。
- `medianRacketArmLiftScore`
  - usable 帧的挥拍臂上举中位数。
- `scoreVariance`
  - usable 帧 `finalMetrics.compositeScore` 的总体方差。
- `rawScoreVariance`
  - usable 帧 raw `compositeScore` 的总体方差，用于 A/B 对照。
- `temporalConsistency`
  - `clamp(1 - scoreVariance / 0.04)`。
- `motionContinuity`
  - 基于相邻 usable 帧 `finalMetrics.compositeScore` 平均绝对差的连续性分数。
- `viewProfile`
  - 基于 smoothed keypoints 推断；低 `viewConfidence` 或视角频繁跳变的帧在汇总时按 `unknown` 处理。
- `dominantRacketSide`
  - 基于 smoothed/final 帧证据加权汇总的主挥拍侧。

### Report 评分指标

- `stability`
  - `coverageRatio * 40 + medianStabilityScore * 60`
- `turn`
  - `20 + medianBodyTurnScore * 80`
- `lift`
  - `20 + medianRacketArmLiftScore * 80`
- `repeatability`
  - `usableRatio * 45 + max(0, 1 - scoreVariance / 0.04) * 55`
  - backend 公式未改，但输入的 `scoreVariance` 已换成 final/smoothed 语义。
- `totalScore`
  - `stability * 0.28 + turn * 0.28 + lift * 0.24 + repeatability * 0.2`

## 当前阈值

### Pose 可用性阈值

- `USABLE_STABILITY_THRESHOLD = 0.6`
- `LOW_STABILITY_THRESHOLD = 0.45`
- `SUBJECT_SCALE_THRESHOLD = 0.12`
- `MIN_USABLE_FRAME_COUNT = 6`
- `MIN_COVERAGE_RATIO = 0.6`
- `MAX_SCORE_VARIANCE = 0.04`

### rejectionReasons 触发条件

- `body_not_detected`
  - `detectedFrameCount == 0`
- `subject_too_small_or_cropped`
  - `tooSmallCount >= max(3, frameCount // 3)`
- `poor_lighting_or_occlusion`
  - `lowStabilityCount >= max(3, frameCount // 3)`
- `insufficient_pose_coverage`
  - `usableFrameCount < 6`
  - 或 `coverageRatio < 0.6`
  - 或在覆盖率已达标时 `medianStabilityScore < 0.6`
- `insufficient_action_evidence`
  - 覆盖率达标后 `scoreVariance > 0.04`
  - 且 `motionContinuity < 0.55`
- `invalid_camera_angle`
  - 覆盖率达标后 `unknownViewCount >= max(4, usableFrameCount - 1)`
  - `unknownViewCount` 会把低 `viewConfidence` 与频繁视角跳变一并算入证据

### 报告 issue 阈值

- `turn < 72` 触发“侧身展开不足”
- `lift < 72` 触发“挥拍臂上举不足”
- `repeatability < 74` 触发“动作复现稳定性不足”
- `stability < 76` 触发“样本可见性边缘，仅建议重拍”

## 当前最容易误判的地方

- `bodyTurnScore` 只看肩宽
  - 它把“肩横向看起来更窄”直接近似成“侧身更充分”，容易把裁切、透视、耸肩、单臂遮挡误判成转体。
- `racketArmLiftScore` 只看肩腕高度差
  - 没有区分真实引拍、随意抬手、击球后残留姿态，也没有识别持拍手或拍面。
- `viewProfile` 仍然是轻量几何推断
  - 现在有跨帧平滑和保守汇总，但还没有真正的时序视角分类器。
- `invalid_camera_angle` 的证据更保守了
  - 低置信度和跳变现在更容易累计到 `unknown`，但本质上仍是规则门控，不是完整机位识别。
- `repeatability` 仍未做动作阶段切分
  - 现在多了 `temporalConsistency` 和 `motionContinuity`，但还不知道准备、引拍、击球、随挥这些阶段。
- 当前 report 只取 summary 中位数
  - 不关心最佳帧前后关系，也不关心峰值出现在哪个动作阶段。

## 当前缺少的时序与专项特征

- 缺少挥拍时序
  - 当前没有准备、引拍、击球、随挥阶段切分。
- 缺少专项几何特征
  - 没有肘角、肩肘腕夹角、躯干与骨盆相对旋转、重心移动、跨步与蹬转信号。
- 缺少球拍和球的信息
  - 当前完全没有持拍物体检测，也没有击球点和来球关系。
- 缺少动作阶段理解
  - 现在已有多帧稳定器，但还没有阶段切分或关键瞬间定位。
- 缺少动作上下文
  - 不知道这段视频里动作是否完整，也不知道抽到的帧是否覆盖了真正关键瞬间。

## 调试建议

- 看 pose 原始结果时，先看 `summary.rejectionReasonDetails` 和 `summary.debugCounts`，确认是覆盖率、主体尺寸、稳定度还是视角问题。
- 看单帧时，优先对比 `rawMetrics`、`smoothedMetrics`、`finalMetrics`，再看 `metrics.debug.statusReasons`、`subjectScaleSource`、`frameInference`。
- 看 report 时，优先对比 `scoringEvidence.dimensionEvidence[].inputs` 和 `scoringEvidence.totalScoreBreakdown`，确认是原始输入变了，还是只是 issue 弱判断调整在生效。
- 本地开发可直接运行：

```bash
./scripts/debug-algorithm-baseline.sh backend/artifacts/tasks/<taskId>/preprocess
./scripts/debug-algorithm-baseline.sh backend/artifacts/tasks/<taskId>/preprocess --format json
```
