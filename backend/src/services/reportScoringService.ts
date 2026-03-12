import type { AnalysisTaskRecord, FlowErrorCode, PoseAnalysisResult, ReportResult, StandardComparison, SuggestionItem } from '../types/task';

function now() {
  return new Date().toISOString();
}

function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function toPercent(value: number) {
  return clampScore(value * 100);
}

type MetricKey = 'stability' | 'turn' | 'lift' | 'repeatability';

type MetricScores = Record<MetricKey, number>;

type RankedIssue = ReportResult['issues'][number] & {
  metricKey: MetricKey;
  severity: number;
  suggestion: SuggestionItem;
};

type PoseQualityFailure = {
  code: FlowErrorCode;
  message: string;
};

type IssueDefinition = {
  metricKey: MetricKey;
  threshold: number;
  title: string;
  description: string;
  impact: string;
  suggestion: SuggestionItem;
};

const METRIC_LABELS: Record<MetricKey, string> = {
  stability: '主体稳定度',
  turn: '侧身展开',
  lift: '挥拍臂上举',
  repeatability: '动作复现稳定性',
};

const ISSUE_DEFINITIONS: IssueDefinition[] = [
  {
    metricKey: 'turn',
    threshold: 72,
    title: '侧身展开不足',
    description: '从稳定识别到的高远球帧看，身体更常停留在较正的朝向，侧身打开还不够。',
    impact: '这会让高远球的准备空间偏小，报告能看到的关键差异也会集中在转体展开不够。',
    suggestion: {
      title: '下次先盯侧身有没有更早打开',
      description: '保持侧后方机位复测，优先看准备到出手前，身体是否比这次更早完成侧身展开。',
    },
  },
  {
    metricKey: 'lift',
    threshold: 72,
    title: '挥拍臂上举不足',
    description: '稳定帧里能看到挥拍臂有上举，但高度和时机都还不够充分。',
    impact: '这会压缩高远球的击球准备空间，让报告更容易持续提示上举不足这一项。',
    suggestion: {
      title: '下次先看上举空间有没有继续抬高',
      description: '保持同机位复测，重点观察挥拍臂是不是更早、更高地进入准备位置。',
    },
  },
  {
    metricKey: 'repeatability',
    threshold: 74,
    title: '动作复现稳定性不足',
    description: '虽然能识别到人体，但不同帧之间的动作质量波动仍然偏大，说明这次样本复现得不够稳。',
    impact: '动作波动大时，单次看起来做到了的细节不一定能连续复现，复测对比也更容易飘。',
    suggestion: {
      title: '下次先把同一套节奏稳定复现出来',
      description: '优先保证准备、击球、收拍这条线更连贯，不要先追求单次最好效果。',
    },
  },
  {
    metricKey: 'stability',
    threshold: 76,
    title: '样本可见性边缘，仅建议重拍',
    description: '这次样本已经勉强达到报告门槛，但可见性和稳定度还处在边缘区间。',
    impact: '如果继续用这类样本做对比，报告可信度会下降，也更像在看演示数据而不是稳定证据。',
    suggestion: {
      title: '下次优先提升样本清晰度和主体完整度',
      description: '尽量让全身完整入镜，减少遮挡和抖动，再做同机位高远球复测。',
    },
  },
];

const STANDARD_REFERENCE = {
  title: '正手高远球标准参考帧',
  cue: '当前只围绕可稳定观测的侧身展开、挥拍臂上举和动作稳定性来做差异对比。',
  imageLabel: '标准高远球真人参考帧',
  imagePath: '/standard-references/clear-reference-real.jpg',
  sourceType: 'real-sample' as const,
};

const QUALITY_FAILURE_MESSAGES: Record<FlowErrorCode, string> = {
  invalid_action_type: 'actionType is invalid',
  unsupported_action_scope: 'only clear is supported in the current MVP',
  file_required: 'file is required',
  task_not_found: 'task not found',
  invalid_task_state: 'task state does not allow this operation',
  result_not_ready: 'result not ready',
  comparison_action_mismatch: 'tasks must share the same action type',
  unsupported_file_type: 'unsupported video file type',
  upload_failed: 'failed to persist upload',
  invalid_duration: 'video duration should be between 5 and 15 seconds',
  multi_person_detected: 'multiple people detected in frame',
  body_not_detected: 'body was not detected reliably enough to generate a report',
  subject_too_small_or_cropped: 'subject is too small or cropped for a credible report',
  poor_lighting_or_occlusion: 'lighting, blur, or occlusion made the pose signal unreliable',
  invalid_camera_angle: 'camera angle is too frontal or too extreme for clear analysis',
  insufficient_pose_coverage: 'stable pose coverage is below the minimum report threshold',
  insufficient_action_evidence: 'action evidence is too unstable to support a formal report',
  preprocess_failed: 'preprocess stage failed',
  pose_failed: 'pose estimation failed',
  report_generation_failed: 'report generation failed',
  task_recovery_failed: 'task recovery failed',
  internal_error: 'internal server error',
};

function buildMetricScores(summary: PoseAnalysisResult['summary'], frameCount: number): MetricScores {
  const usableRatio = frameCount > 0 ? summary.usableFrameCount / frameCount : 0;
  const stability = clampScore(summary.coverageRatio * 40 + summary.medianStabilityScore * 60);
  const turn = clampScore(20 + summary.medianBodyTurnScore * 80);
  const lift = clampScore(20 + summary.medianRacketArmLiftScore * 80);
  const repeatability = clampScore(usableRatio * 45 + Math.max(0, 1 - (summary.scoreVariance / 0.04)) * 55);

  return { stability, turn, lift, repeatability };
}

function buildSummaryText(metricScores: MetricScores, poseSummary: PoseAnalysisResult['summary'], frameCount: number) {
  const weakestMetric = Object.entries(metricScores).sort((a, b) => a[1] - b[1])[0] as [MetricKey, number];
  const evidence = `本次基于 ${poseSummary.usableFrameCount}/${frameCount} 帧稳定识别结果生成。`;

  if (weakestMetric[1] >= 80) {
    return `${evidence} 当前这条高远球的可观测框架比较稳定，下一步更适合继续验证动作能否连续复现。`;
  }

  return `${evidence} 当前最值得先改的是${METRIC_LABELS[weakestMetric[0]]}，这也是这次报告里证据最明确的短板。`;
}

function buildRankedIssues(metricScores: MetricScores): RankedIssue[] {
  return ISSUE_DEFINITIONS
    .map((definition) => {
      const metricScore = metricScores[definition.metricKey];
      const gap = definition.threshold - metricScore;
      if (gap <= 0) return null;

      return {
        title: definition.title,
        description: `${definition.description}（${METRIC_LABELS[definition.metricKey]} ${metricScore} 分）`,
        impact: definition.impact,
        metricKey: definition.metricKey,
        severity: gap,
        suggestion: definition.suggestion,
      } satisfies RankedIssue;
    })
    .filter((item): item is RankedIssue => Boolean(item))
    .sort((a, b) => b.severity - a.severity);
}

function buildStandardComparison(rankedIssues: RankedIssue[]): StandardComparison {
  const differences = rankedIssues.length > 0
    ? rankedIssues.slice(0, 3).map((issue) => {
      switch (issue.metricKey) {
        case 'turn':
          return '当前样本里身体更常停留在较正朝向，和标准高远球相比，侧身展开还不够明确。';
        case 'lift':
          return '当前样本里挥拍臂上举空间还没完全撑开，和标准参考相比，上举幅度偏保守。';
        case 'repeatability':
          return '当前样本不同帧之间波动偏大，和标准参考相比，动作复现稳定性还不够。';
        case 'stability':
          return '当前样本虽然可分析，但主体稳定度偏边缘，和标准参考相比，画面条件仍需要先稳住。';
      }
    })
    : ['当前样本和标准参考之间的可观测差异已经不大，下一步更适合继续验证稳定复现。'];

  return {
    sectionTitle: '标准动作对比',
    summaryText: rankedIssues.length > 0
      ? `和标准高远球相比，当前最明确的差异集中在${rankedIssues.slice(0, 3).map((item) => METRIC_LABELS[item.metricKey]).join('、')}。`
      : '和标准高远球相比，当前可稳定观测的关键维度已经比较接近。',
    currentFrameLabel: '当前样本最佳稳定帧',
    standardFrameLabel: STANDARD_REFERENCE.imageLabel,
    standardReference: STANDARD_REFERENCE,
    phaseFrames: [
      {
        phase: '准备',
        title: '高远球准备阶段',
        imagePath: '/standard-references/clear-phase-prep.jpg',
        cue: '先保证站位和身体朝向给侧身展开留出空间。',
      },
      {
        phase: '上举',
        title: '高远球上举阶段',
        imagePath: '/standard-references/clear-phase-contact.jpg',
        cue: '当前 MVP 重点看挥拍臂是否抬高，以及身体有没有继续打开。',
      },
      {
        phase: '复现',
        title: '高远球动作复现',
        imagePath: '/standard-references/clear-phase-follow.jpg',
        cue: '关注这套动作能否在多帧里保持相近质量，而不只是偶尔做对。',
      },
    ],
    differences,
  };
}

export function getPoseQualityFailure(poseResult: PoseAnalysisResult): PoseQualityFailure | null {
  const primaryReason = poseResult.summary.rejectionReasons[0];
  if (!primaryReason) return null;

  return {
    code: primaryReason,
    message: QUALITY_FAILURE_MESSAGES[primaryReason] ?? QUALITY_FAILURE_MESSAGES.insufficient_action_evidence,
  };
}

export function buildRuleBasedResult(task: AnalysisTaskRecord, poseResult: PoseAnalysisResult): ReportResult {
  const metricScores = buildMetricScores(poseResult.summary, poseResult.frameCount);
  const dimensionScores = (Object.keys(METRIC_LABELS) as MetricKey[]).map((key) => ({
    name: METRIC_LABELS[key],
    score: metricScores[key],
  }));
  const totalScore = clampScore(
    metricScores.stability * 0.28
    + metricScores.turn * 0.28
    + metricScores.lift * 0.24
    + metricScores.repeatability * 0.2,
  );
  const rankedIssues = buildRankedIssues(metricScores);

  const issues = rankedIssues.length > 0
    ? rankedIssues.slice(0, 3).map(({ title, description, impact }) => ({ title, description, impact }))
    : [{
      title: '当前高远球可观测框架较稳定',
      description: '这次样本里，主体稳定度、侧身展开、挥拍臂上举和动作复现都没有明显拖后腿的短板。',
      impact: '接下来更值得继续验证的是，能不能在同机位下把这套动作持续复现出来。',
    }];

  const suggestions = rankedIssues.length > 0
    ? rankedIssues.map((item) => item.suggestion).slice(0, 3)
    : [{
      title: '下次继续验证动作能否稳定复现',
      description: '保持同一机位再录一条高远球视频，优先确认这次看到的较稳动作不是偶尔出现。',
    }];

  return {
    taskId: task.taskId,
    actionType: task.actionType,
    totalScore,
    summaryText: buildSummaryText(metricScores, poseResult.summary, poseResult.frameCount),
    dimensionScores,
    issues,
    suggestions,
    compareSummary: '当前报告只围绕可稳定观测的侧身展开、挥拍臂上举、主体稳定度和动作复现稳定性生成。',
    retestAdvice: '建议 3~7 天后保持同一机位复测，下次优先看侧身展开、挥拍臂上举和动作复现稳定性是否一起变稳。',
    createdAt: now(),
    poseBased: true,
    standardComparison: buildStandardComparison(rankedIssues),
    scoringEvidence: {
      frameCount: poseResult.frameCount,
      detectedFrameCount: poseResult.detectedFrameCount,
      usableFrameCount: poseResult.summary.usableFrameCount,
      coverageRatio: poseResult.summary.coverageRatio,
      medianStabilityScore: poseResult.summary.medianStabilityScore,
      medianBodyTurnScore: poseResult.summary.medianBodyTurnScore,
      medianRacketArmLiftScore: poseResult.summary.medianRacketArmLiftScore,
      scoreVariance: poseResult.summary.scoreVariance,
      bestFrameIndex: poseResult.summary.bestFrameIndex,
      rejectionReasons: poseResult.summary.rejectionReasons,
      dimensionEvidence: [
        {
          key: 'stability',
          label: METRIC_LABELS.stability,
          score: metricScores.stability,
          source: `coverageRatio=${poseResult.summary.coverageRatio}, medianStability=${poseResult.summary.medianStabilityScore}`,
        },
        {
          key: 'turn',
          label: METRIC_LABELS.turn,
          score: metricScores.turn,
          source: `medianBodyTurnScore=${poseResult.summary.medianBodyTurnScore}`,
        },
        {
          key: 'lift',
          label: METRIC_LABELS.lift,
          score: metricScores.lift,
          source: `medianRacketArmLiftScore=${poseResult.summary.medianRacketArmLiftScore}`,
        },
        {
          key: 'repeatability',
          label: METRIC_LABELS.repeatability,
          score: metricScores.repeatability,
          source: `usableFrameCount=${poseResult.summary.usableFrameCount}, scoreVariance=${poseResult.summary.scoreVariance}`,
        },
      ],
      humanSummary: poseResult.summary.humanSummary,
    },
    preprocess: {
      metadata: task.artifacts.preprocess?.metadata,
      artifacts: task.artifacts.preprocess?.artifacts,
    },
  };
}
