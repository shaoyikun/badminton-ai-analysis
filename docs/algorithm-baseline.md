# 当前算法基线

这份文档描述 2026-03-13 当前仓库里的动作分析基线实现，目标是帮助开发联调、问题排查和后续算法迭代。它描述的是“现在代码实际上怎么做”，不是下一版方案。

## 调用链

1. 前端创建任务并上传完整视频。
2. backend 用 `ffprobe` 读取视频元数据。
3. backend 先调用 `analysis-service/app.py detect-segments <video-path>` 做一次轻量整段粗扫描，输出多个 `swingSegments` 候选、`recommendedSegmentId` 和基础质量标记。
4. 前端先展示候选片段，并默认高亮 `recommendedSegmentId`；用户确认 `selectedSegmentId` 后，再调用最终分析启动接口。
5. backend 只对 `selectedSegmentId` 对应窗口执行 `ffmpeg` 均匀抽帧，并把这个选择写进 preprocess manifest。
6. backend 通过子进程调用 `analysis-service/app.py <preprocess-task-dir>`。
7. Python `pose_estimator.py` 优先走 MediaPipe Tasks `VIDEO` mode，对选中片段抽帧序列做时序姿态估计与 EMA smoothing，生成 keypoints、per-frame metrics、summary。
8. backend 读取 pose result，先把 `summary.rejectionReasons` 分成“硬拒绝”与“低置信提示”两类。
9. 若命中硬拒绝，任务失败；若仅命中低置信提示，backend 仍生成 report，并把低置信原因写入 `confidenceScore`、`evidenceNotes` 和 `scoringEvidence`。

## 新增的粗粒度片段检测

### 为什么先做这一步

- 当前系统本质上还是“抽帧姿态分析 + 规则评分”，默认把整段视频视为一次动作会直接放大精度和可解释性问题。
- 真实用户视频经常包含多次挥拍，且早期挥拍可能不完整、被遮挡，或者没有覆盖到最清晰的一次。
- 因此本阶段先解决“系统到底分析哪一次挥拍”，而不是一次性把所有片段都做精分析。

### 当前检测逻辑

- `analysis-service/services/swing_segment_detector.py` 使用低分辨率、低帧率灰度视频做粗扫描。
- 每个扫描帧计算灰度帧差，得到 `motionScore` 序列，并做短窗口平滑。
- 阈值使用 `max(percentile75, median + 2.2 * MAD, minPeak)`。
- 超过阈值的连续活跃区间会被合并成候选片段，再追加前后 padding。
- 每个候选片段都会输出：
  - `segmentId`
  - `startTimeMs / endTimeMs`
  - `startFrame / endFrame`
  - `durationMs`
  - `motionScore`
  - `confidence`
  - `rankingScore`
  - `coarseQualityFlags`
- 若没有稳定区间：
  - 先回退成围绕最强运动峰的单窗口
  - 仍无可靠峰值时，再回退整段视频窗口，保证旧链路不被卡死

### 当前推荐逻辑

- 推荐分 `rankingScore` 由以下启发式组合得到：
  - 更清晰的运动峰值
  - 更高的窗口内部运动密度
  - 更接近完整挥拍经验时长的 `durationFitness`
  - 更少的质量 penalty
- 质量 penalty 当前主要来自：
  - `motion_too_weak`
  - `too_short`
  - `too_long`
  - `edge_clipped_start`
  - `edge_clipped_end`
  - `subject_maybe_small`
  - `motion_maybe_occluded`
- 若多个片段 `rankingScore` 接近：
  - 优先 flags 更少的片段
  - 再优先时间更靠后的片段
  - 用来更稳地覆盖“前几次不完整，后一次才完整”的场景

### 与当前 report / 前端的关系

- 当前默认只精分析一个片段，不会一次性精分析全部候选。
- 上传页现在已经支持“两步式”交互：
  - 第一步上传完整视频并拿到粗扫候选
  - 第二步由用户确认 `selectedSegmentId` 后再启动最终分析
- `ReportResult` 和 preprocess manifest 会同时回显：
  - `swingSegments`
  - `recommendedSegmentId`
  - `segmentDetectionVersion`
  - `segmentSelectionMode`
  - `selectedSegmentId`
- 这意味着用户现在已经能明确知道“系统将要分析哪一段”和“这份报告实际分析了哪一段”。
- 后续若要支持“结果页直接切换片段并重新分析”，推荐做法仍然是：
  - 先复用已有候选列表和默认推荐标签
  - 用户切换片段后再触发该片段的重新抽帧与精分析
  - 不建议在当前架构里对所有片段并行跑完整 pose + report

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
- `specialized`
  - 当前已新增 11 个专项指标：
    - `shoulderHipRotationScore`
    - `trunkCoilScore`
    - `sideOnReadinessScore`
    - `chestOpeningScore`
    - `elbowExtensionScore`
    - `hittingArmPreparationScore`
    - `racketSideElbowHeightScore`
    - `wristAboveShoulderConfidence`
    - `headStabilityScore`
    - `contactPreparationScore`
    - `nonRacketArmBalanceScore`
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
- `specializedFeatureSummary`
  - 每个专项特征都会输出 `median / peak / observableFrameCount / observableCoverage / peakFrameIndex`。
- `bestPreparationFrameIndex`
  - 取 `contactPreparationScore` 的峰值帧，等价于 `summary.phaseCandidates.preparation.anchorFrameIndex`。
- `phaseCandidates`
  - 当前固定输出 `preparation / backswing / contactCandidate / followThrough` 四个阶段候选。
  - 每个候选都包含 `anchorFrameIndex / windowStartFrameIndex / windowEndFrameIndex / score / sourceMetric / detectionStatus`，缺失时额外输出 `missingReason`。
  - `contactCandidate` 是“击球候选”，不是精确击球点。
- `viewProfile`
  - 基于 smoothed keypoints 推断；低 `viewConfidence` 或视角频繁跳变的帧在汇总时按 `unknown` 处理。
- `dominantRacketSide`
  - 基于 smoothed/final 帧证据加权汇总的主挥拍侧。

### Report 评分指标

当前 report 已拆成“动作质量”和“证据置信度”两条线：

- `totalScore`
  - 只表达动作质量，不直接惩罚机位。
  - `body_preparation * 0.38 + racket_arm_preparation * 0.37 + swing_repeatability * 0.25`
- `confidenceScore`
  - 表达当前报告可信度。
  - `evidence_quality * 0.55 + camera_suitability * 0.3 + observabilityScore * 0.15 - fallbackPenalty`

当前四个公开维度：

- `evidence_quality`
  - `coverageRatio * 40 + medianStabilityScore * 35 + coreObservableCoverage * 25`
  - 只表达“证据是否足够稳定可读”，不直接代表动作好坏。
- `body_preparation`
  - 优先使用 `sideOnReadinessScore + shoulderHipRotationScore + trunkCoilScore`
  - 全部不可观测时 fallback 到 `medianBodyTurnScore`
- `racket_arm_preparation`
  - 优先使用 `hittingArmPreparationScore + wristAboveShoulderConfidence + racketSideElbowHeightScore + elbowExtensionScore`
  - 全部不可观测时 fallback 到 `medianRacketArmLiftScore`
- `swing_repeatability`
  - `contactPreparationScore.median * 45 + contactPreparationScore.observableCoverage * 30 + usableRatio * 15 + varianceComponent * 10`
  - 其中 `varianceComponent = max(0, 1 - scoreVariance / 0.04)`
  - 当前仍把 `scoreVariance` 当作阶段稳定性的粗粒度代理，不再作为主导项
- `camera_suitability`
  - 由 `viewProfile`、`viewConfidence`、`viewStability`、`unknownViewRatio` 计算
  - 只进入 `confidenceScore` 和 `evidenceNotes`，不进入 `totalScore`

## 当前阈值

### Pose 可用性阈值

- `USABLE_STABILITY_THRESHOLD = 0.6`
- `LOW_STABILITY_THRESHOLD = 0.45`
- `SUBJECT_SCALE_THRESHOLD = 0.12`
- `MIN_USABLE_FRAME_COUNT = 6`
- `MIN_COVERAGE_RATIO = 0.6`
- `MAX_SCORE_VARIANCE = 0.04`

### rejectionReasons 与 disposition

当前 backend 会把 pose 输出分成三类结果：

- `hard reject`
  - 任务失败，继续沿用错误态
- `low confidence`
  - 任务完成，但报告标记 `analysisDisposition=low_confidence`
- `analyzable`
  - 正常完成

#### 保留为硬拒绝的条件

- `body_not_detected`
  - `detectedFrameCount == 0`
- `subject_too_small_or_cropped`
  - `tooSmallCount >= max(3, frameCount // 3)`
- `poor_lighting_or_occlusion`
  - `lowStabilityCount >= max(3, frameCount // 3)`
- `insufficient_pose_coverage`
  - 只有“明显不足”的覆盖样本继续硬拒绝
  - 当前保守门槛是：
    - `usableFrameCount < 5`
    - 或 `coverageRatio < 0.5`
    - 或 `medianStabilityScore < 0.6`
  - 命中上述任一条件时，仍进入失败态

#### 降级为低置信完成的条件

- `invalid_camera_angle`
  - 正面、前斜、`unknown` 机位
  - 或 `viewConfidence` 偏低
  - 或 `unknownViewCount / usableFrameCount` 偏高
- `insufficient_action_evidence`
  - 覆盖率已过最低门槛，但 `scoreVariance` 仍偏高
  - 当前更像“证据偏散”，不再直接作为硬失败
- `insufficient_pose_coverage`
  - 当前会先保留在 pose 层 `rejectionReasons`
  - 但若样本仅接近门槛，同时仍满足：
    - `usableFrameCount >= 5`
    - `coverageRatio >= 0.5`
    - `medianStabilityScore >= 0.6`
  - backend 会把它下沉为 `low_confidence`，并写入 `rejectionDecision.lowConfidenceReasons`

#### 原始 rejectionReasons 与最终 disposition 的关系

- `summary.rejectionReasons` 代表 pose 层原始触发信号
- backend 会再根据当前阈值把它们分成：
  - `rejectionDecision.hardRejectReasons`
  - `rejectionDecision.lowConfidenceReasons`
- 因此 `rejectionReasons` 中出现 `invalid_camera_angle` 或 `insufficient_pose_coverage`，并不自动代表任务失败；最终以 `analysisDisposition` 为准

#### confidenceScore 阈值

- `confidenceScore < 70`
  - `analysisDisposition=low_confidence`
- `confidenceScore >= 70`
  - `analysisDisposition=analyzable`

### Phase 4 评测校准结果

- Phase 3 checked-in baseline（8 fixtures）：
  - `successRate = 5/8 (0.625)`
  - `dispositionDistribution = analyzable=4, low_confidence=1, rejected=3`
- Phase 4 checked-in baseline（10 fixtures）：
  - `successRate = 7/10 (0.7)`
  - `dispositionDistribution = analyzable=4, low_confidence=3, rejected=3`
- 本次新增并固定了两类边界样本：
  - `clear-boundary-low-confidence`
    - 守护 coverage 接近门槛时的 `low_confidence`
  - `clear-temporal-noise-low-confidence`
    - 守护时序抖动/阶段证据不完整时的 `low_confidence`
- 同时保留 `clear-boundary-rejected` 作为“明显 coverage deficit 仍硬拒绝”的 guard rail

### 报告 issue 阈值

- `body_preparation < 72`
  - 触发“身体准备不足”
- `racket_arm_preparation < 72`
  - 触发“挥拍臂准备不足”
- `swing_repeatability < 74`
  - 触发“挥拍复现稳定性不足”
- `evidence_quality < 70` 或 `confidenceScore < 70`
  - 触发“当前样本证据置信度偏低”

## 当前最容易误判的地方

- `bodyTurnScore` 只看肩宽
  - 它把“肩横向看起来更窄”直接近似成“侧身更充分”，容易把裁切、透视、耸肩、单臂遮挡误判成转体。
- `racketArmLiftScore` 只看肩腕高度差
  - 没有区分真实引拍、随意抬手、击球后残留姿态，也没有识别持拍手或拍面。
- `viewProfile` 仍然是轻量几何推断
  - 现在有跨帧平滑和保守汇总，但还没有真正的时序视角分类器。
- `camera_suitability` 仍然是规则门控
  - 现在它不会直接把动作判差，但本质上仍是轻量机位适配估计，不是完整视角分类器。
- `repeatability` 仍未做真正的分阶段消费
  - 现在已经能输出 `phaseCandidates` 作为准备、引拍、击球候选、随挥的时序骨架，但评分层还没有正式消费这些阶段窗口。
- 当前 report 仍主要依赖 summary 聚合
  - 虽然已经把动作问题和证据问题拆开，但仍然不关心最佳帧前后关系，也不关心峰值出现在哪个动作阶段。

## 当前缺少的时序与专项特征

- 阶段锚点已落地，但仍停留在候选层
  - 现在有 `summary.phaseCandidates` 输出准备 / 引拍 / 击球候选 / 随挥候选，但还没有球拍、羽球或击球点证据来验证真实 contact。
- 球拍和来球证据仍缺失
  - 当前仍然没有球拍、羽球、击球点或来球检测。
- repeatability 仍然是全局稳定性
  - 现在还没有把 `repeatability` 升级成“明确消费阶段窗口的分阶段稳定性”。
- 动作上下文仍有限
  - 系统能给出时序候选，但仍不知道抽到的帧是否真的覆盖了准确击球瞬间。

## 调试建议

- 看 pose 原始结果时，先看 `summary.rejectionReasonDetails` 和 `summary.debugCounts`，确认是覆盖率、主体尺寸、稳定度还是视角问题。
- 看阶段锚点时，优先看 `summary.phaseCandidates`：
  - `preparation.anchorFrameIndex` 和 `bestPreparationFrameIndex` 应保持一致。
  - `contactCandidate.sourceMetric=bestFrameIndex` 代表当前还无法从准备态可靠分离出击球候选，只能回退到全局最佳帧。
  - `missingReason` 用来区分是准备证据缺失、contact 不可分离，还是没有 post-contact 帧。
- 看本地 debug markdown 时，直接查看 `## Phase Candidates` 段落。
- 看单帧时，优先对比 `rawMetrics`、`smoothedMetrics`、`finalMetrics`，再看 `metrics.debug.statusReasons`、`subjectScaleSource`、`frameInference`。
- 看 report 时，优先对比 `scoringEvidence.dimensionEvidence[].inputs`、`confidenceBreakdown` 和 `rejectionDecision`，确认是动作输入变了，还是只是证据置信度在下降。
- 本地开发可直接运行：

```bash
./scripts/debug-algorithm-baseline.sh backend/artifacts/tasks/<taskId>/preprocess
./scripts/debug-algorithm-baseline.sh backend/artifacts/tasks/<taskId>/preprocess --format json
```
