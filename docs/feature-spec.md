# 羽毛球专项特征规范

本文档描述当前 `analysis-service` 已实现的专项特征定义。目标是用 MediaPipe 33 关键点，在无训练数据、无球拍/羽球检测的前提下，为后续评分层和 debug 提供更有解释力的动作证据。

## 设计约束

- 当前所有特征都是规则式、可解释的几何特征。
- 每个特征都输出 `number | null`。
  - `null` 表示当前帧不可观测，不等价于低分。
- `specializedFeatureSummary` 只统计 `usable` 帧。
- 所有阈值集中维护在 [`analysis-service/services/pose_estimator.py`](/Users/bytedance/coding/badminton-ai-analysis/analysis-service/services/pose_estimator.py)。
- 旧字段 `bodyTurnScore` 与 `racketArmLiftScore` 继续保留，供当前 report 兼容使用。

## 特征总表

| 特征 | 关键点 | 数学定义 | 范围 | 可观测性限制 | 对应问题 |
| --- | --- | --- | --- | --- | --- |
| `shoulderHipRotationScore` | `left/right_shoulder`, `left/right_hip` | `abs(yaw_shoulders - yaw_hips) / ROTATION_DIFFERENCE_TARGET_DEGREES`，其中 `yaw = atan2(abs(z_gap), abs(x_gap))` | `0-1` | 躯干四点都要可见；主体太小、深度证据过弱时为 `null` | 转体不足 |
| `sideOnReadinessScore` | 双肩、双髋 | `mean(yaw_shoulders, yaw_hips) / TORSO_YAW_TARGET_DEGREES * alignment_penalty` | `0-1` | 机位过正、主体太小、肩髋中心不稳定时为 `null` | 侧身准备不足 |
| `trunkCoilScore` | 双肩、双髋 | `0.6 * shoulderHipRotationScore + 0.4 * sideOnReadinessScore` | `0-1` | 继承 torso 特征限制 | 躯干蓄力不足 |
| `chestOpeningScore` | 挥拍侧肩肘腕、对侧肩、肩中点 | 挥拍侧肘/腕相对肩中点向挥拍侧外展距离，按肩宽归一化，再乘可见性 | `0-1` | 挥拍侧未知或上肢遮挡时为 `null` | 身体打开不够、引拍空间不足 |
| `elbowExtensionScore` | 挥拍侧肩肘腕 | `angle(shoulder-elbow-wrist)` 归一化到准备态目标区间 | `0-1` | 挥拍侧关键点缺失或 visibility 不足时为 `null` | 肘角准备不足 |
| `racketSideElbowHeightScore` | 挥拍侧肩肘、对侧肩 | `(shoulder_line_y - elbow_y) / torso_height` 归一化 | `0-1` | 肘点或肩线不稳定时为 `null` | 挥拍肘抬高不足 |
| `wristAboveShoulderConfidence` | 挥拍侧肩腕 | `(shoulder_y - wrist_y) / torso_height` 归一化并乘可见性 | `0-1` | 只是“抬高证据”，不代表完整引拍；腕点不稳时为 `null` | 挥拍手准备高度不足 |
| `hittingArmPreparationScore` | 挥拍侧肩肘腕、肩中点 | `0.35*elbowExtension + 0.3*elbowHeight + 0.2*wristAboveShoulder + 0.15*chestOpening`，对可见项重归一 | `0-1` | 挥拍侧优先用 frame inference；未知时 fallback 到 arm chain 更强的一侧 | 挥拍臂准备不足 |
| `headStabilityScore` | `nose`, `left/right_ear` 或 `left/right_eye`, 双肩 | 头部中心相对肩中点横向偏移惩罚 + 头部左右倾斜惩罚 + 可见性 | `0-1` | 头部关键点缺失、强遮挡、头部姿态不稳时为 `null` | 主体稳定度、准备一致性不足 |
| `nonRacketArmBalanceScore` | 非挥拍侧肩肘腕、肩中点 | 非挥拍肘高 + 非挥拍手离身体中线展开距离 + 可见性 | `0-1` | 仅在挥拍侧可判定且非挥拍侧可见时计算，否则为 `null` | 对侧平衡不足 |
| `contactPreparationScore` | `trunkCoil`, `hittingArmPreparation`, `chestOpening`, `headStability`, `nonRacketArmBalance` | 对可见准备项求均值；若核心准备项缺失则为 `null` | `0-1` | 这是“准备态证据”，不是击球瞬间定位；缺少完整准备证据时为 `null` | 准备态不足、后续阶段切分基础 |

## 实现细节

### 挥拍侧选择

- 优先复用当前帧 `dominantRacketSide` 推断。
- 若当前帧为 `unknown`，则分别计算左右两侧 arm chain，选择 `hittingArmPreparationScore` 更高且可观测的一侧。
- debug 中会记录：
  - `selectedRacketSide`
  - `selectedRacketSideSource`
    - `frame_inference`
    - `fallback_arm_chain`
    - `unavailable`

### 可观测性输出

每个特征的 debug 都会记录：

- `observability[feature].observable`
- `observability[feature].reasons`

当前常见原因：

- `missing_*`
- `low_visibility_*`
- `weak_depth_evidence`
- `subject_scale_too_small`
- `torso_reference_too_small`
- `racket_side_unknown`
- `insufficient_preparation_evidence`

### Summary 聚合

`summary.specializedFeatureSummary[feature]` 包含：

- `median`
- `peak`
- `observableFrameCount`
- `observableCoverage`
- `peakFrameIndex`

额外输出：

- `summary.bestPreparationFrameIndex`
  - 取 `contactPreparationScore` 的峰值帧，作为下一阶段动作阶段切分的锚点

## 与当前 report 的关系

本阶段新特征只进入：

- per-frame `rawMetrics / smoothedMetrics / finalMetrics`
- `summary.specializedFeatureSummary`
- debug markdown / pose result

本阶段不替换当前 report 主评分输入。后续评分层建议：

- 用 `sideOnReadinessScore + shoulderHipRotationScore + trunkCoilScore` 逐步替代 `bodyTurnScore`
- 用 `wristAboveShoulderConfidence + racketSideElbowHeightScore + elbowExtensionScore + hittingArmPreparationScore` 逐步替代 `racketArmLiftScore`
- 在完成阶段切分后，让 `repeatability` 从全局 `scoreVariance` 升级为“分阶段稳定性”
