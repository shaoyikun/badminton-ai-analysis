# DATA-SPEC

说明：
- 当前公开动作范围以 `docs/action-scope.md` 为准；截至 2026-03-13，runtime 已支持 `clear + smash`
- `smash` 已进入正式 runtime，并继续沿用独立评分版本与标准对照
- 离线评测仍保留按动作单独执行的能力，用于 clear / smash 回归

## 1. 分析结果结构
### report
- taskId
- actionType
- totalScore
- confidenceScore（可选）
- summaryText（可选）
- dimensionScores
- issues
- suggestions（短期语义收口为复测关注点 / 后续观察建议）
- compareSummary（可选）
- retestAdvice
- evidenceNotes（可选）
- createdAt（可选）
- poseBased（可选）
- swingSegments（可选，粗粒度候选片段列表）
- recommendedSegmentId（可选，系统默认推荐的候选片段）
- selectedSegmentId（可选，最终进入精分析的候选片段 id）
- selectedSegmentWindow（可选，最终实际抽帧与分析的时间窗）
- analyzedSegmentId（可选，最终实际进入 pose 分析的 segment id）
- segmentDetectionVersion（可选，当前候选片段检测版本）
- segmentSelectionMode（可选，自动推荐或整段回退）
- samplingStrategyVersion（可选，当前片段抽帧策略版本）
- recognitionContext（可选，识别出的拍摄视角 / 挥拍侧等上下文）
- phaseBreakdown（可选，正式报告使用的 4 段阶段结果）
- visualEvidence（可选，最佳帧与全部抽帧骨架叠加图）
- history（可选，同动作历史样本摘要列表）
- comparison（默认对比上一条同动作样本的复测结果）
- standardComparison（可选，标准动作参考区）
- scoringEvidence（可选，当前评分依据摘要）
- preprocess（可选，预处理元数据和关键帧产物摘要）

说明：
- 当前实现中的报告主结构以 `ReportResult` 为准，定义见 `backend/src/types/task.ts`
- `smash` 会通过公开 API 返回正式报告，结构与 `clear` 保持同形
- `issues` 已替代旧文档中的 `top_issues`
- `history`、`comparison` 会在结果读取和复测对比场景中按需补充，不保证每次都有
- `totalScore` 只作为辅助摘要信息，不作为产品主叙事
- `confidenceScore` 用于表达“当前报告有多可信”，不直接代表动作质量
- `dimensionScores` 当前展示的是 `证据质量 / 身体准备 / 挥拍臂准备 / 挥拍复现稳定性`
- `issues` 与 `suggestions` 会同时保留旧版 `title / description / impact` 兼容字段，并补充教练式结构化字段
- `poseSummary.rejectionReasons` / `scoringEvidence.rejectionReasons` 保留 pose 层原始触发信号，不直接等价于任务失败
- `poseSummary.inputQualityCategory` / `evidenceQualityFlags` / `visibilitySummary` / `phaseCoverage` / `insufficientEvidenceReasons` 用于解释当前样本为什么需要 low-confidence 或 hard reject
- 最终应以 `analysisDisposition` 与 `scoringEvidence.rejectionDecision` 判断是“硬拒绝”“低置信完成”还是“正常可分析”
- `selectedSegmentId` 只表达“选中了哪一段候选”；真正进入抽帧与报告的窗口以 `selectedSegmentWindow` 为准
- `analyzedSegmentId` 默认等于 `selectedSegmentId`；若后续内部发生兼容回退，也用它标记“本次真正分析的是哪一段”

### phaseBreakdown
- phaseKey（`preparation` / `backswing` / `contactCandidate` / `followThrough`）
- label
- status（`ok` / `attention` / `insufficient_evidence`）
- summary
- evidenceRefs（可选）
- detectedFrom（可选）
  - anchorFrameIndex（可选）
  - windowStartFrameIndex（可选）
  - windowEndFrameIndex（可选）
  - sourceMetric（可选）
  - detectionStatus（可选）
  - missingReason（可选）

说明：
- `phaseBreakdown` 是 Phase 2 正式对用户可见的分阶段结果，固定为 4 段
- 它消费 Phase 1 的 `summary.phaseCandidates`，但允许在阶段证据不足时返回 `insufficient_evidence`
- 阶段结果用于解释“哪一个阶段最需要先回看”，不是新的独立总分体系

### issue item
- title
- description
- impact
- issueType（可选：`action_gap` / `evidence_gap`）
- issueCategory（可选）
- targetDimensionKey（可选）
- confidenceImpact（可选：`low` / `medium` / `high`）
- observation（可选）
- whyItMatters（可选）
- nextTrainingFocus（可选）
- captureAdvice（可选）
- evidenceRefs（可选）
  - dimensionKey（可选）
  - featureKey（可选）
  - label（可选）
  - score（可选）
  - confidence（可选）
  - reference（可选）

### suggestion item
- title
- description
- suggestionType（可选：`capture_fix` / `technique_focus` / `retest_check`）
- targetDimensionKey（可选）
- recommendedNextCapture（可选）
- focusPoint（可选）
- linkedIssueCategory（可选）
- evidenceRefs（可选）

## 2. 任务状态与错误信息
### task summary
- taskId
- actionType
- status（`created` / `uploaded` / `processing` / `completed` / `failed`）
- stage（`upload_pending` / `uploaded` / `validating` / `extracting_frames` / `estimating_pose` / `generating_report` / `completed` / `failed`）
- progressPercent
- errorCode（可选）
- errorMessage（可选）
- retryable
- preprocessStatus
- poseStatus
- poseSummary（可选）
- previousCompletedTaskId（可选）
- createdAt
- updatedAt
- segmentScan（可选，上传后粗扫得到的候选片段与当前选择）

说明：
- MVP 目标协议以 `status + stage + error snapshot` 表达任务状态；`preprocessStatus`、`poseStatus` 仍可在内部或调试接口保留，但不再作为前端主状态机
- `uploaded + stage=uploaded + segmentScan` 是显式“等待确认片段”状态，前端上传页要在这一态展示候选片段选择，不进入处理中页
- 错误信息不再使用零散字段自由组合，统一走稳定 `errorCode`
- 常见失败态错误码包括 `upload_failed`、`invalid_duration`、`multi_person_detected`、`body_not_detected`、`poor_lighting_or_occlusion`、`insufficient_pose_coverage`、`preprocess_failed`、`pose_failed`
- `invalid_camera_angle` 与边界型 `insufficient_pose_coverage` 在当前基线下优先下沉到 `completed + low_confidence`，不再默认进入失败态

### segment scan summary
- status（当前固定为 `completed`）
- segmentDetectionVersion
- swingSegments
- recommendedSegmentId
- selectedSegmentId（可选）
- selectedSegmentWindow（可选）
- segmentSelectionMode（可选）

说明：
- `selectedSegmentWindow` 支持用户在上传页对当前候选做轻量前后微调。
- 若用户没有微调，它默认等于 `selectedSegmentId` 对应候选的窗口。
- backend 最终抽帧与报告回显都以 `selectedSegmentWindow` 为准。
- 当前默认策略是“segment 内均匀抽样 + motion boosted 补采样”，不是整段全局抽帧。

### start task request
- selectedSegmentId（可选）
- selectedWindowOverride（可选）

说明：
- `selectedWindowOverride` 仅允许在已选候选的基础上做轻量时间窗修正，不支持跨候选自由裁剪。
- backend 会把该 override clamp 到视频总时长与合法分析窗口范围内，再写回 `segmentScan.selectedSegmentWindow`。

### error response
- error
  - code
  - message
  - retryable

说明：
- `code` 是前端映射标题、文案和返回路径的唯一稳定键
- `message` 主要给日志、开发联调和排障使用

## 3. 历史记录结构
### history item
- taskId
- actionType
- status
- createdAt
- updatedAt
- totalScore（可选）
- summaryText（可选）
- poseBased（可选）

## 4. 复测对比结构
### comparison
- previousTaskId
- previousCreatedAt（可选）
- currentTaskId
- currentCreatedAt（可选）
- totalScoreDelta
- improvedDimensions
- declinedDimensions
- unchangedDimensions
- phaseDeltas
  - phaseKey
  - label
  - previousStatus
  - currentStatus
  - changed
  - summary
- summaryText
- coachReview
  - headline
  - progressNote
  - keepDoing（可选）
  - regressionNote（可选）
  - nextFocus
  - nextCheck
  - focusDimensions（可选）

### delta item
- name
- previousScore
- currentScore
- delta

说明：
- 只有双方使用同一 `scoringModelVersion` 时，`comparison` 才会返回完整内容
- Phase 2 起，跨模型时服务端直接返回 `comparison: null`，并补 `unavailableReason: scoring_model_mismatch`
- 同模型 comparison 除维度 delta 外，还会返回 `phaseDeltas` 说明 4 段阶段里哪一段更稳或更需要回看

## 5. 标准动作对比结构
### standardComparison
- sectionTitle
- summaryText
- currentFrameLabel
- standardFrameLabel
- viewProfile（可选）
- standardReference
  - title
  - cue
  - imageLabel
  - imagePath（可选，本地静态资源路径或后续的真实素材 URL）
  - sourceType（可选：illustration / real-sample）
- phaseFrames（可选）
  - phase
  - title
  - imagePath
  - cue
- differences

说明：
- 当前实现会根据识别出的 `viewProfile` 切换参考说明文案；第一版仍允许复用同一套静态参考图
- MVP 第一版允许先返回“本地静态参考素材 + 差异说明文案”，不强制要求一开始就接真人标准图片库
- 若已有可用素材，可以进一步返回阶段性关键帧（如准备 / 引拍 / 击球），当前字段为 `phaseFrames`
- 后续可再把 `imagePath` 升级为真实素材 URL / token / 媒体资源引用
- Phase 5 起，离线 shadow `smash` 已要求使用独立素材与文案，不能继续复用 `clear` 的标准对照模板

### recognitionContext
- viewProfile（可选：`rear` / `rear_left_oblique` / `rear_right_oblique` / `left_side` / `right_side` / `front_left_oblique` / `front_right_oblique` / `front` / `unknown`）
- viewLabel
- viewConfidence（可选）
- dominantRacketSide（可选：`left` / `right` / `unknown`）
- dominantRacketSideLabel
- racketSideConfidence（可选）
- engine（可选）

### visualEvidence
- bestFrameIndex（可选）
- bestFrameImagePath（可选）
- bestFrameOverlayPath（可选）
- overlayFrames
  - index
  - timestampSeconds（可选）
  - rawImagePath（可选）
  - overlayImagePath（可选）
  - status（可选）

## 6. 评分与预处理补充结构
### scoringEvidence
- scoringModelVersion（可选）
- analysisDisposition（可选：`rejected` / `low_confidence` / `analyzable`）
- detectedFrameCount（可选）
- frameCount（可选）
- coverageRatio（可选）
- medianStabilityScore（可选）
- medianBodyTurnScore（可选）
- medianRacketArmLiftScore（可选）
- scoreVariance（可选）
- bestFrameIndex（可选）
- rejectionReasons（可选）
- dimensionScoresByKey（可选）
- cameraSuitability（可选）
- fallbacksUsed（可选）
- confidenceBreakdown（可选）
  - rawConfidenceScore
  - finalConfidenceScore
  - evidenceQuality
  - cameraSuitability
  - observabilityScore
  - contributions
  - penalties
- rejectionDecision（可选）
  - hardRejectReasons
  - lowConfidenceReasons
  - confidencePenaltyNotes
- dimensionEvidence（可选）
  - key
  - label
  - score
  - available（可选）
  - confidence（可选）
  - source
  - inputs（可选）
  - formula（可选）
  - adjustments（可选）
  - fallbacks（可选）
- humanSummary（可选）

说明：
- `analysisDisposition` 用于区分“硬拒绝”“低置信完成”“正常可分析”
- 公开 runtime 的 `clear` 使用 `rule-v3-phase-aware`
- 公开 runtime 的 `smash` 使用独立 `scoringModelVersion=rule-v3-smash-shadow`
- `cameraSuitability` 只参与置信度，不直接进入 `totalScore`
- `fallbacksUsed` 用于标记哪些维度仍由旧 turn/lift 或全局稳定性代理补足
- Phase 2 起，`swing_repeatability` 优先使用 `contactCandidate` / `followThrough` 阶段证据；若阶段证据不足，会明确记录为阶段回退
- `rejectionReasons` 记录 pose 原始触发原因；最终 hard/soft 分类以 `rejectionDecision.hardRejectReasons` 和 `rejectionDecision.lowConfidenceReasons` 为准
- Phase 4 起，`insufficient_pose_coverage` 在接近门槛但仍有可读动作证据时，可出现在 `lowConfidenceReasons`，不再默认等价于失败

### preprocess
- metadata（可选）
  - fileName
  - fileSizeBytes
  - mimeType（可选）
  - extension（可选）
  - durationSeconds（可选）
  - estimatedFrames（可选）
  - width（可选）
  - height（可选）
  - frameRate（可选）
  - metadataSource（可选：`mock-estimate` / `ffprobe` / `manual`）
- artifacts（可选）
  - normalizedFileName
  - metadataExtractedAt
  - artifactsDir
  - manifestPath
  - analyzedSegmentId（可选）
  - samplingStrategyVersion（可选）
  - framePlan
    - strategy
    - targetFrameCount
    - sampleTimestamps
    - baseSampleTimestamps（可选）
    - motionBoostedSampleTimestamps（可选）
    - motionWindows（可选）
    - motionScoreSummary（可选）
  - sampledFrames
    - index
    - timestampSeconds
    - fileName
    - relativePath
    - sourceType（可选：`uniform` / `motion_boosted`）

## 7. 对比模式约束
- 默认模式：当前样本自动对比“上一条同动作已完成样本”
- 手动模式：允许用户从同动作历史记录中手动选择任意一条历史样本作为对比基线
- 禁止跨动作类型对比（例如杀球 vs 高远球）
- 标准动作对比与历史复测对比可以同时存在，二者面向的问题不同：
  - 历史复测对比：看“和过去的自己相比有没有进步”
  - 标准动作对比：看“和目标动作模板相比还差在哪里”

## 8. 数据来源约束
- 视频输入必须符合拍摄规范
- 报告输出必须符合报告模板
- 历史记录和复测对比必须基于已完成样本生成，不能读取未完成任务作为对比基线
- 标准动作对比文案必须能落到具体差异点，不能只给抽象评价
- 短期产品边界：报告聚焦“用户当前存在哪些动作问题、这些问题会带来什么影响、下次复测该重点看什么”，暂不输出结构化训练计划
- `suggestions` 字段短期只承载“复测关注点 / 后续观察建议”，不承载具体训练动作、组数或训练方案
- 历史详情与复测对比都只允许读取同动作、已完成样本

## 9. 相关主文档
- `docs/design/REPORT-TEMPLATE.md`
- `docs/data/VIDEO-CAPTURE-SPEC.md`
