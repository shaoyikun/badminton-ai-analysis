# DATA-SPEC

## 1. 分析结果结构
### report
- taskId
- actionType
- totalScore
- summaryText（可选）
- dimensionScores
- issues
- suggestions（短期语义收口为复测关注点 / 后续观察建议）
- compareSummary（可选）
- retestAdvice
- createdAt（可选）
- poseBased（可选）
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

## 2. 任务状态与错误信息
### task summary
- taskId
- status（`created` / `uploaded` / `processing` / `completed` / `failed`）
- errorCode（可选）
- errorMessage（可选）
- preprocessStatus
- poseStatus
- poseSummary（可选）
- previousCompletedTaskId（可选）
- updatedAt

说明：
- 当前错误信息主要挂在任务状态与预处理/姿态识别阶段，不再单独维护一个独立 `error_result` 结构
- 常见错误码包括 `upload_failed`、`invalid_duration`、`multi_person_detected`、`body_not_detected`、`poor_lighting_or_occlusion`、`invalid_camera_angle`

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

### delta item
- name
- previousScore
- currentScore
- delta

## 5. 标准动作对比结构
### standardComparison
- sectionTitle
- summaryText
- currentFrameLabel
- standardFrameLabel
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
- MVP 第一版允许先返回“本地静态参考素材 + 差异说明文案”，不强制要求一开始就接真人标准图片库
- 若已有可用素材，可以进一步返回阶段性关键帧（如准备 / 引拍 / 击球），当前字段为 `phaseFrames`
- 后续可再把 `imagePath` 升级为真实素材 URL / token / 媒体资源引用

## 6. 评分与预处理补充结构
### scoringEvidence
- detectedFrameCount（可选）
- frameCount（可选）
- avgStabilityScore（可选）
- avgBodyTurnScore（可选）
- avgRacketArmLiftScore（可选）
- bestFrameIndex（可选）
- humanSummary（可选）

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
