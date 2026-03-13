---
name: badminton-vision-engineering
description: Use when the task is about image/video recognition engineering for this badminton project, especially multi-swing segment detection, recommended clip selection, single-segment sampling optimization, pose and phase recognition, evidence-quality gating, explainable rule scoring, evaluation/baseline/fixture/regression changes, or when external public references should inform implementation choices.
---

# Badminton Vision Engineering

## 何时使用

当任务聚焦在这个仓库里的视觉/视频识别工程能力，而不是单纯页面流程或协议搬运时使用：

- 多挥拍视频的候选片段检测、排序、推荐片段选择
- 单片段抽帧优化、关键帧价值提升、相位覆盖增强
- 姿态估计、动作阶段识别、挥拍准备/引拍/击球候选/收拍证据提炼
- 证据质量门槛、低置信降级、rejection / low confidence 判定
- 动作纠正、规则评分、可解释反馈、evidence notes
- evaluation / baseline / fixture / regression 设计与结果解读
- 当前仓库没有现成实现模式，需要主动参考官方文档、论文、高质量开源实现后再落地

这个 skill 关注“如何把视觉识别问题在当前仓库里做对”。主链路编排、共享协议、前端页面联动、Python 调用边界仍应交给对应 specialized skill 协同完成。

## 先读什么

先沿当前真实链路检查一遍，不要把需求当成空白项目来设计：

- `AGENTS.md`
- `docs/algorithm-baseline.md`
- `backend/src/services/preprocessService.ts`
- `backend/src/services/analysisService.ts`
- `backend/src/services/poseService.ts`
- `backend/src/services/reportScoringService.ts`
- `backend/src/dev/evaluateFixtures.ts`
- `analysis-service/app.py`
- `analysis-service/services/swing_segment_detector.py`
- `analysis-service/services/pose_estimator.py`

如果任务还涉及主流程或评测真源，再补读：

- `backend/src/services/taskService.ts`
- `spec/DATA-SPEC.md`
- `evaluation/README.md`
- `evaluation/fixtures/index.json`
- `evaluation/baseline.json`

先回答以下问题，再开始改代码：

1. 当前问题落在整段粗扫、单片段抽帧、pose summary、评分解释，还是评测护栏。
2. 现有链路里已经有哪些字段、阈值、fallback 和错误分层。
3. 这次变化是否会影响 `segmentScan`、preprocess manifest、pose result、report、evaluation baseline。

## 工作顺序/决策顺序

把视觉识别任务默认当成 staged pipeline，而不是单点打补丁：

1. 先判断整段视频里要分析哪一次挥拍。
2. 再决定这次挥拍片段里哪些帧最值得分析。
3. 再确认姿态与阶段证据是否足够支撑结论。
4. 再输出动作问题、纠正建议和解释文本。
5. 最后用 evaluation / baseline / fixture / 真实样本 smoke test 判断变化是否真的提升。

默认优先级顺序：

1. 多挥拍片段检测
2. 推荐分析片段
3. 单片段抽帧优化
4. 证据质量门槛
5. 姿态识别鲁棒性
6. 动作纠正逻辑质量
7. evaluation / baseline / 回归护栏

如果你还没确认“系统到底在分析哪一次挥拍”，不要直接去调评分或纠正文案。

## 核心规则

1. Inspect before changing：修改前必须沿 `upload -> segment scan -> selected segment -> preprocess -> pose -> report -> evaluation` trace 一次真实链路。
2. Optimize for precision and stability：默认优化目标是识别精度、识别稳定性、结果可解释性、与现有仓库兼容性，不为了新颖性做无关大重构。
3. Segment before deep analysis：不要默认整段视频等于一次动作。视频里可能有多次挥拍时，优先先做候选片段检测、排序和推荐，再进入单片段精分析。
4. Smart sampling over brute force：抽帧优化优先考虑均匀抽样、动作感知补采样、相位候选帧覆盖，不要把“无脑增加总帧数”当首选方案。
5. Evidence quality before correction confidence：主体过小、遮挡、机位差、阶段覆盖不足时，优先降低置信度、给出 `low_confidence` 或 `rejection`，不要继续输出强动作纠正结论。
6. Separate problem classes：始终明确区分：
   - 输入质量问题
   - 证据不足问题
   - 执行失败 / 系统错误
   - 动作本身问题
7. 不要把输入质量差或证据不足误写成“动作做错了”；也不要把 `pose_failed`、timeout、非法 JSON 这类执行失败伪装成动作结论。
8. Preserve compatibility：尽量保留现有 API 语义、manifest / report / evaluation 结构，优先通过新增字段扩展，而不是直接破坏旧消费。
9. Explainable outputs first：设计方案时优先考虑是否需要补充可追踪字段，而不是只输出一个黑盒结论。
10. Deliver implementation, not only advice：除非用户明确要求只做分析，否则默认目标是产出代码、测试、文档和可验证改动。
11. 复用优先：优先扩展 `preprocessService`、segment scan、pose summary、评分 evidence、evaluation 脚本和现有 artifacts，不要新造平行链路。
12. 模块拆分优先：新增逻辑优先拆到聚焦 helper 或服务模块，不要继续把大分支堆进 `pose_estimator.py`、评分服务或主流程大文件。

## 精度优化偏好

### 多挥拍片段检测

- 先做整段视频粗粒度扫描，再找多个疑似挥拍片段。
- 推荐片段的目标是“最值得精分析的一次挥拍”，不是“运动峰值最大的一小段”。
- 排名时优先考虑完整性、准备段/收拍覆盖、截断风险、主体质量，而不是只看一个 peak。
- 如果没有可靠候选，允许回退，但要保留 fallback 原因和质量标记。

### 单片段抽帧优化

- 优先做“均匀抽样 + 动作补采样 + 相位覆盖”。
- 重点提升准备、引拍、击球候选、收拍这些关键相位的覆盖质量。
- 抽帧改造应尽量保持 preprocess manifest、report 回显和调试产物兼容。
- 若需要新增字段，优先考虑：
  - `samplingStrategyVersion`
  - `sampledFrames[].sourceType`
  - `phaseCoverage`

### 姿态估计与动作阶段识别

- 先确认当前项目是否仍以关键点 + 规则为主，再决定引入多复杂的视觉逻辑。
- 新阶段识别应先和已有 `phaseCandidates`、`specializedFeatureSummary`、`summary` 字段对齐。
- 优先提高可观测性、时序稳定性和阶段解释能力，而不是直接增加模型复杂度。

### 证据质量门槛

- 先判断主体是否过小、是否遮挡严重、机位是否明显不适合、phase coverage 是否不足。
- 对证据质量差的样本，优先走：
  - `rejectionReasons`
  - `lowConfidenceReasons`
  - `analysisDisposition=low_confidence`
- 不要让证据不足的样本继续产生看起来很确定的动作纠正建议。
- 如果需要新增或补强字段，优先考虑：
  - `evidenceQualityFlags`
  - `rejectionReasons`
  - `lowConfidenceReasons`

### 规则评分与可解释反馈

- 评分逻辑应能解释“为什么是这个分数”和“为什么置信度下降了”。
- 动作评分和证据置信度应继续分开思考，不要把机位问题直接算成动作质量差。
- 纠正建议应尽量引用阶段证据、关键指标或 summary 线索，而不是凭单一瞬时帧下结论。

### evaluation / baseline / regression

- 评测不是只看 pass / fail，要能解释行为为什么变化。
- 至少同时关注：
  - 片段检测是否更合理
  - 关键相位覆盖是否改善
  - 证据质量 gating 是否更稳定
  - disposition / rejection / low confidence 分布是否合理
  - baseline drift 是否可解释
- 能用真实视频做轻量 smoke test 时，不要只停留在静态 fixture。

## 可解释字段设计信号

这些字段不是要求一律新增，但设计时应优先考虑是否需要它们来提高可解释、可追踪、可回归验证能力：

- `swingSegments`
- `recommendedSegmentId`
- `segmentDetectionVersion`
- `samplingStrategyVersion`
- `sampledFrames[].sourceType`
- `phaseCoverage`
- `evidenceQualityFlags`
- `rejectionReasons`
- `lowConfidenceReasons`

如果新增字段会影响公开协议或 checked-in baseline，记得同步对应 contracts、docs 和 evaluation。

## 外部公开资料使用策略

当出现以下情况时，应主动使用公开资料辅助实现，而不是只在仓库里盲猜：

- 仓库里没有现成实现模式
- 需要选择视频/视觉算法
- 需要为阈值、启发式、分段逻辑提供依据
- 需要比较不同开源方案
- 需要确认库能力、API、最佳实践
- 需要设计更合理的 evaluation 指标

优先级顺序：

1. 官方文档
2. 论文 / arXiv / 项目页
3. 高质量开源实现
4. 工程博客 / 技术文章

可作为起点的搜索主题包括：

- `video action segmentation lightweight heuristic`
- `pose-based motion phase detection`
- `MediaPipe pose sports motion analysis`
- `badminton swing keyframe detection`
- `motion peak detection in short videos`
- `confidence gating in pose estimation pipelines`
- `sports video sampling and action segment ranking`
- `evaluation metrics for pose/action analysis systems`

使用外部资料时必须遵守：

1. 外部资料只是辅助，不是最终答案。
2. 不允许照抄论文或开源实现；必须转化成当前仓库的工程实现选择。
3. 参考后要落到当前项目的 Node / Python 分层、现有 report/evaluation、当前 artifacts 和 spec 风格里。
4. 不要把任务退化成纯 research 或资料总结；最终要回到代码、测试、文档和验证结果。
5. 若外部资料支持了阈值、启发式或方案选型，交付说明里应简要说明“为什么这里采用这个落地方式”。

## 何时联动其他 skills

- `analysis-pipeline`：这次改动跨越主链路多个边界
- `badminton-analysis-flow`：候选片段粗扫、推荐片段、用户选片、状态推进变化
- `analysis-service-integration`：`ffprobe` / `ffmpeg` / Python 调用边界、pose 输出、错误映射变化
- `evaluation-and-regression`：评分、阈值、summary、fixtures、baseline 变化
- `backend-api-contracts`：公开字段、错误语义、报告结构变化
- `shared-contracts-and-adapters`：前端消费模型、view model、adapter 变化
- `docs-spec-sync`：实现变化会导致 `docs/` 或 `spec/` 失真
- `repo-delivery-baseline`：需要决定 `make test`、`make build`、`make verify`、`make evaluate` 跑法
- `skill-evolution`：这次工作又沉淀出新的可复用经验，值得回写 skill

## 何时读取 examples/

在你已经确认任务主问题之后，再读最贴近的 example：

- `examples/multi-swing-segment-first.md`
  - 多挥拍视频、候选片段检测、推荐片段排序
- `examples/smart-sampling-and-phase-coverage.md`
  - 单片段抽帧优化、关键相位覆盖、manifest 兼容扩展
- `examples/evidence-gating-and-correction-confidence.md`
  - 证据门槛、low confidence / rejection、动作问题与输入问题分层
- `examples/external-research-to-repo-implementation.md`
  - 需要查外部资料、比较方案并落到当前仓库实现

不要一次性把全部 examples 都读进来；只加载最相关的那个或两个。

## 任务完成后的输出要求

最终交付说明至少要写清：

- 问题主要落在哪一段：多挥拍检测、抽帧、pose、证据门槛、评分还是评测
- 这次如何区分输入质量问题、证据不足、执行失败和动作问题
- 新逻辑为什么能提升精度、稳定性或可解释性，而不是只改了更多规则
- 是否新增或扩展了哪些可解释字段
- 跑了哪些验证：
  - 单测 / 集成测试
  - `make evaluate`
  - 真实样本 smoke test
  - build / verify
- 如果参考了外部资料，最终落地成了哪些当前仓库里的具体实现选择
- 剩余风险、未覆盖样本或暂未处理的 follow-up 是什么
