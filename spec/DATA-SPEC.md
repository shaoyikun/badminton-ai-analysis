# DATA-SPEC

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
- recognitionContext（可选，识别出的拍摄视角 / 挥拍侧等上下文）
- visualEvidence（可选，最佳帧与全部抽帧骨架叠加图）
- history（可选，同动作历史样本摘要列表）
- comparison（默认对比上一条同动作样本的复测结果）
- standardComparison（可选，标准动作参考区）
- scoringEvidence（可选，当前评分依据摘要）
- preprocess（可选，预处理元数据和关键帧产物摘要）

说明：
- 当前实现中的报告主结构以 `ReportResult` 为准，定义见 `backend/src/types/task.ts`
- `issues` 已替代旧文档中的 `top_issues`
- `history`、`comparison` 会在结果读取和复测对比场景中按需补充，不保证每次都有
- `totalScore` 只作为辅助摘要信息，不作为产品主叙事
- `confidenceScore` 用于表达“当前报告有多可信”，不直接代表动作质量
- `dimensionScores` 当前展示的是 `证据质量 / 身体准备 / 挥拍臂准备 / 挥拍复现稳定性`
- `issues` 与 `suggestions` 会同时保留旧版 `title / description / impact` 兼容字段，并补充教练式结构化字段

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

说明：
- MVP 目标协议以 `status + stage + error snapshot` 表达任务状态；`preprocessStatus`、`poseStatus` 仍可在内部或调试接口保留，但不再作为前端主状态机
- 错误信息不再使用零散字段自由组合，统一走稳定 `errorCode`
- 常见错误码包括 `upload_failed`、`invalid_duration`、`multi_person_detected`、`body_not_detected`、`poor_lighting_or_occlusion`、`invalid_camera_angle`、`preprocess_failed`、`pose_failed`

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
- 只有双方使用同一 `scoringModelVersion` 时，`improvedDimensions / declinedDimensions / unchangedDimensions` 才保证可比
- 跨模型时服务端只保留 `totalScoreDelta`，维度 delta 数组允许为空

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
- `cameraSuitability` 只参与置信度，不直接进入 `totalScore`
- `fallbacksUsed` 用于标记哪些维度仍由旧 turn/lift 或全局稳定性代理补足

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
  - framePlan
    - strategy
    - targetFrameCount
    - sampleTimestamps
  - sampledFrames
    - index
    - timestampSeconds
    - fileName
    - relativePath

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
