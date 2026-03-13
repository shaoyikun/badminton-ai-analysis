# 当前算法基线

这份文档描述 2026-03-13 当前仓库里的动作分析基线实现，目标是帮助开发联调、问题排查和后续算法迭代。它描述的是“现在代码实际上怎么做”，不是下一版方案。

## 调用链

1. 前端创建任务并上传视频。
2. backend 用 `ffprobe` 读取视频元数据，再用 `ffmpeg` 按均匀时间点抽帧。
3. backend 通过子进程调用 `analysis-service/app.py <preprocess-task-dir>`。
4. Python `pose_estimator.py` 对每张抽帧做单帧 MediaPipe 姿态估计，生成 keypoints、per-frame metrics、summary。
5. backend 读取 pose result，若 `summary.rejectionReasons` 非空则直接按首个拒绝原因失败。
6. 若 pose 通过门槛，backend `reportScoringService.ts` 用规则分数生成 report 和 `scoringEvidence`。

## 当前使用的指标

### 单帧指标

- `stabilityScore`
  - 由肩、髋、手腕、鼻子的 visibility 平均值得到。
- `shoulderSpan`
  - 左右肩横向间距。
- `hipSpan`
  - 左右髋横向间距。
- `bodyTurnScore`
  - `1 - shoulderSpan` 的裁剪值，肩越窄越倾向被解释为更侧身。
- `racketArmLiftScore`
  - 左右手各自根据肩腕高度差和可见性算出 lift，再取更高一侧。
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
  - usable 帧 `compositeScore` 的总体方差。
- `viewProfile`
  - 基于肩宽、身体深度差、人脸关键点可见性推断的视角类别。
- `dominantRacketSide`
  - 基于左右手上举分数累积推断的主挥拍侧。

### Report 评分指标

- `stability`
  - `coverageRatio * 40 + medianStabilityScore * 60`
- `turn`
  - `20 + medianBodyTurnScore * 80`
- `lift`
  - `20 + medianRacketArmLiftScore * 80`
- `repeatability`
  - `usableRatio * 45 + max(0, 1 - scoreVariance / 0.04) * 55`
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
- `invalid_camera_angle`
  - 覆盖率达标后 `unknownViewCount >= max(4, usableFrameCount - 1)`

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
- `viewProfile` 主要依赖单帧几何关系
  - 当前没有跨帧稳定器，镜头轻微晃动或肢体遮挡就可能让视角判断跳动。
- `invalid_camera_angle` 在真实数据里偏难触发
  - 因为只要关键点足够完整，当前视角推断通常会给出某个非 `unknown` 标签，所以这个拒绝条件更多是在边缘样本或人为构造样本里暴露出来。
- `repeatability` 只看 composite 方差
  - 它不知道动作阶段，只知道多帧分数是否接近，因此可能把“重复出现的错误姿态”也当作稳定复现。
- 当前 report 只取 summary 中位数
  - 不关心最佳帧前后关系，也不关心峰值出现在哪个动作阶段。

## 当前缺少的时序与专项特征

- 缺少挥拍时序
  - 当前没有准备、引拍、击球、随挥阶段切分。
- 缺少专项几何特征
  - 没有肘角、肩肘腕夹角、躯干与骨盆相对旋转、重心移动、跨步与蹬转信号。
- 缺少球拍和球的信息
  - 当前完全没有持拍物体检测，也没有击球点和来球关系。
- 缺少多帧稳定器
  - 视角、挥拍侧、最佳帧判断都主要依赖单帧或简单聚合。
- 缺少动作上下文
  - 不知道这段视频里动作是否完整，也不知道抽到的帧是否覆盖了真正关键瞬间。

## 调试建议

- 看 pose 原始结果时，先看 `summary.rejectionReasonDetails` 和 `summary.debugCounts`，确认是覆盖率、主体尺寸、稳定度还是视角问题。
- 看单帧时，优先对比 `metrics.debug.statusReasons`、`subjectScaleSource`、`frameInference`。
- 看 report 时，优先对比 `scoringEvidence.dimensionEvidence[].inputs` 和 `scoringEvidence.totalScoreBreakdown`，确认是原始输入变了，还是只是 issue 弱判断调整在生效。
- 本地开发可直接运行：

```bash
./scripts/debug-algorithm-baseline.sh backend/artifacts/tasks/<taskId>/preprocess
./scripts/debug-algorithm-baseline.sh backend/artifacts/tasks/<taskId>/preprocess --format json
```
