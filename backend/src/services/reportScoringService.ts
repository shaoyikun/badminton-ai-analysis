import type {
  AnalysisTaskRecord,
  DominantRacketSide,
  FlowErrorCode,
  PoseAnalysisResult,
  RecognitionContext,
  ReportResult,
  StandardComparison,
  SuggestionItem,
  ViewProfile,
  VisualEvidence,
} from '../types/task';

function now() {
  return new Date().toISOString();
}

function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function toPercent(value: number) {
  return clampScore(value * 100);
}

function roundDebugValue(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

type MetricKey = 'stability' | 'turn' | 'lift' | 'repeatability';

type MetricScores = Record<MetricKey, number>;
type StructuredEvidenceValue = string | number | boolean | null;
type StructuredEvidenceRecord = Record<string, StructuredEvidenceValue>;
type DimensionEvidenceEntry = NonNullable<NonNullable<ReportResult['scoringEvidence']>['dimensionEvidence']>[number];

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

const TOTAL_SCORE_WEIGHTS: Record<MetricKey, number> = {
  stability: 0.28,
  turn: 0.28,
  lift: 0.24,
  repeatability: 0.2,
};

const VIEW_PROFILE_LABELS: Record<ViewProfile, string> = {
  rear: '后方',
  rear_left_oblique: '左后斜',
  rear_right_oblique: '右后斜',
  left_side: '左侧面',
  right_side: '右侧面',
  front_left_oblique: '左前斜',
  front_right_oblique: '右前斜',
  front: '正面',
  unknown: '未确定',
};

const RACKET_SIDE_LABELS: Record<DominantRacketSide, string> = {
  left: '左手挥拍侧',
  right: '右手挥拍侧',
  unknown: '挥拍侧未确定',
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

const WEAK_TURN_VIEW_PROFILES = new Set<ViewProfile>(['front', 'front_left_oblique', 'front_right_oblique']);

function getViewLabel(viewProfile?: ViewProfile) {
  return VIEW_PROFILE_LABELS[viewProfile ?? 'unknown'] ?? VIEW_PROFILE_LABELS.unknown;
}

function getRacketSideLabel(dominantRacketSide?: DominantRacketSide) {
  return RACKET_SIDE_LABELS[dominantRacketSide ?? 'unknown'] ?? RACKET_SIDE_LABELS.unknown;
}

function getViewReferenceCue(viewProfile?: ViewProfile) {
  switch (viewProfile) {
    case 'left_side':
    case 'right_side':
      return '当前识别为侧面视角，参考图主要帮助你对齐挥拍侧准备和击球前身体线条。';
    case 'front':
      return '当前识别为正面视角，系统更适合参考挥拍臂准备和整体稳定度，转体展开只做弱判断。';
    case 'front_left_oblique':
    case 'front_right_oblique':
      return '当前识别为前斜视角，这次更适合参考挥拍臂准备；转体展开会保留为弱判断。';
    case 'rear_left_oblique':
    case 'rear_right_oblique':
      return '当前识别为后斜视角，这次对转体展开和挥拍臂准备都能给出相对完整的参考判断。';
    case 'rear':
      return '当前识别为后方视角，这次的转体展开和挥拍臂准备判断会相对更稳。';
    default:
      return '当前只围绕可稳定观测的侧身展开、挥拍臂上举和动作稳定性来做差异对比。';
  }
}

function getMetricViewNote(metricKey: MetricKey, viewProfile?: ViewProfile) {
  if (metricKey === 'turn' && WEAK_TURN_VIEW_PROFILES.has(viewProfile ?? 'unknown')) {
    return `基于当前${getViewLabel(viewProfile)}视角，这一项只做弱判断，更适合作为复测时的辅助参考。`;
  }
  if (metricKey === 'lift' && (viewProfile === 'front' || viewProfile === 'front_left_oblique' || viewProfile === 'front_right_oblique')) {
    return `基于当前${getViewLabel(viewProfile)}视角，这一项的证据相对直接。`;
  }
  if (metricKey === 'repeatability') {
    return `这一项主要看当前${getViewLabel(viewProfile)}视角下动作在多帧里是否稳定复现。`;
  }
  return `这项判断结合了当前${getViewLabel(viewProfile)}视角下最稳定的关键帧证据。`;
}

function getMetricConfidence(metricKey: MetricKey, viewProfile?: ViewProfile) {
  if (metricKey === 'turn' && WEAK_TURN_VIEW_PROFILES.has(viewProfile ?? 'unknown')) {
    return 0.52;
  }
  if (metricKey === 'lift' && (viewProfile === 'front' || viewProfile === 'front_left_oblique' || viewProfile === 'front_right_oblique')) {
    return 0.84;
  }
  if (viewProfile === 'unknown') {
    return 0.48;
  }
  return 0.78;
}

function buildRecognitionContext(summary: PoseAnalysisResult['summary'], engine: string): RecognitionContext {
  return {
    viewProfile: summary.viewProfile,
    viewLabel: getViewLabel(summary.viewProfile),
    viewConfidence: summary.viewConfidence,
    dominantRacketSide: summary.dominantRacketSide,
    dominantRacketSideLabel: getRacketSideLabel(summary.dominantRacketSide),
    racketSideConfidence: summary.racketSideConfidence,
    engine,
  };
}

function buildVisualEvidence(task: AnalysisTaskRecord, poseResult: PoseAnalysisResult): VisualEvidence {
  const sampledFrames = task.artifacts.preprocess?.artifacts?.sampledFrames ?? [];
  const frameMap = new Map(poseResult.frames.map((frame) => [frame.frameIndex, frame]));
  const bestFrameIndex = poseResult.summary.bestFrameIndex ?? sampledFrames[0]?.index ?? null;
  const bestRawFrame = sampledFrames.find((item) => item.index === bestFrameIndex) ?? sampledFrames[0];
  const bestPoseFrame = bestFrameIndex ? frameMap.get(bestFrameIndex) : undefined;

  return {
    bestFrameIndex,
    bestFrameImagePath: bestRawFrame?.relativePath,
    bestFrameOverlayPath: poseResult.summary.bestFrameOverlayRelativePath ?? bestPoseFrame?.overlayRelativePath,
    overlayFrames: sampledFrames.map((frame) => {
      const poseFrame = frameMap.get(frame.index);
      return {
        index: frame.index,
        timestampSeconds: frame.timestampSeconds,
        rawImagePath: frame.relativePath,
        overlayImagePath: poseFrame?.overlayRelativePath,
        status: poseFrame?.status,
      };
    }),
  };
}

function buildMetricScores(summary: PoseAnalysisResult['summary'], frameCount: number): MetricScores {
  const usableRatio = frameCount > 0 ? summary.usableFrameCount / frameCount : 0;
  const stability = clampScore(summary.coverageRatio * 40 + summary.medianStabilityScore * 60);
  const turn = clampScore(20 + summary.medianBodyTurnScore * 80);
  const lift = clampScore(20 + summary.medianRacketArmLiftScore * 80);
  const repeatability = clampScore(usableRatio * 45 + Math.max(0, 1 - (summary.scoreVariance / 0.04)) * 55);

  return { stability, turn, lift, repeatability };
}

function isWeakTurnView(viewProfile?: ViewProfile) {
  return WEAK_TURN_VIEW_PROFILES.has(viewProfile ?? 'unknown');
}

function buildDimensionEvidence(
  metricKey: MetricKey,
  metricScores: MetricScores,
  summary: PoseAnalysisResult['summary'],
  frameCount: number,
): DimensionEvidenceEntry {
  const usableRatio = frameCount > 0 ? summary.usableFrameCount / frameCount : 0;
  const weakTurnAdjustmentApplied = metricKey === 'turn' && isWeakTurnView(summary.viewProfile);

  switch (metricKey) {
    case 'stability': {
      const inputs: StructuredEvidenceRecord = {
        coverageRatio: summary.coverageRatio,
        medianStabilityScore: summary.medianStabilityScore,
      };
      const adjustments: StructuredEvidenceRecord = {
        weakViewAdjustmentApplied: false,
      };
      return {
        key: metricKey,
        label: METRIC_LABELS[metricKey],
        score: metricScores[metricKey],
        available: true,
        confidence: getMetricConfidence(metricKey, summary.viewProfile),
        source: `coverageRatio=${summary.coverageRatio}, medianStability=${summary.medianStabilityScore}`,
        inputs,
        formula: 'clamp(round(coverageRatio * 40 + medianStabilityScore * 60))',
        adjustments,
      };
    }
    case 'turn': {
      const inputs: StructuredEvidenceRecord = {
        medianBodyTurnScore: summary.medianBodyTurnScore,
        viewProfile: summary.viewProfile ?? 'unknown',
      };
      const adjustments: StructuredEvidenceRecord = {
        weakViewAdjustmentApplied: weakTurnAdjustmentApplied,
        issueSeverityMultiplier: weakTurnAdjustmentApplied ? 0.55 : 1,
      };
      return {
        key: metricKey,
        label: METRIC_LABELS[metricKey],
        score: metricScores[metricKey],
        available: true,
        confidence: getMetricConfidence(metricKey, summary.viewProfile),
        source: `medianBodyTurnScore=${summary.medianBodyTurnScore}`,
        inputs,
        formula: 'clamp(round(20 + medianBodyTurnScore * 80))',
        adjustments,
      };
    }
    case 'lift': {
      const inputs: StructuredEvidenceRecord = {
        medianRacketArmLiftScore: summary.medianRacketArmLiftScore,
        viewProfile: summary.viewProfile ?? 'unknown',
      };
      const adjustments: StructuredEvidenceRecord = {
        frontViewEvidenceBoost: summary.viewProfile === 'front' || summary.viewProfile === 'front_left_oblique' || summary.viewProfile === 'front_right_oblique',
      };
      return {
        key: metricKey,
        label: METRIC_LABELS[metricKey],
        score: metricScores[metricKey],
        available: true,
        confidence: getMetricConfidence(metricKey, summary.viewProfile),
        source: `medianRacketArmLiftScore=${summary.medianRacketArmLiftScore}`,
        inputs,
        formula: 'clamp(round(20 + medianRacketArmLiftScore * 80))',
        adjustments,
      };
    }
    case 'repeatability': {
      const inputs: StructuredEvidenceRecord = {
        usableFrameCount: summary.usableFrameCount,
        frameCount,
        usableRatio: roundDebugValue(usableRatio),
        scoreVariance: summary.scoreVariance,
      };
      const adjustments: StructuredEvidenceRecord = {
        varianceThreshold: 0.04,
      };
      return {
        key: metricKey,
        label: METRIC_LABELS[metricKey],
        score: metricScores[metricKey],
        available: true,
        confidence: getMetricConfidence(metricKey, summary.viewProfile),
        source: `usableFrameCount=${summary.usableFrameCount}, scoreVariance=${summary.scoreVariance}`,
        inputs,
        formula: 'clamp(round(usableRatio * 45 + max(0, 1 - scoreVariance / 0.04) * 55))',
        adjustments,
      };
    }
  }
}

function buildTotalScoreBreakdown(metricScores: MetricScores) {
  const contributions = (Object.keys(METRIC_LABELS) as MetricKey[]).map((key) => ({
    key,
    label: METRIC_LABELS[key],
    score: metricScores[key],
    weight: TOTAL_SCORE_WEIGHTS[key],
    weightedScore: roundDebugValue(metricScores[key] * TOTAL_SCORE_WEIGHTS[key]),
  }));
  const rawWeightedTotal = roundDebugValue(
    contributions.reduce((total, item) => total + item.weightedScore, 0),
  );
  const finalTotalScore = clampScore(rawWeightedTotal);

  return {
    rawWeightedTotal,
    finalTotalScore,
    contributions,
  };
}

function buildSummaryText(metricScores: MetricScores, poseSummary: PoseAnalysisResult['summary'], frameCount: number) {
  const weakestMetric = Object.entries(metricScores).sort((a, b) => a[1] - b[1])[0] as [MetricKey, number];
  const evidence = `本次基于 ${poseSummary.usableFrameCount}/${frameCount} 帧稳定识别结果生成。`;
  const viewLead = `当前识别为${getViewLabel(poseSummary.viewProfile)}，${getRacketSideLabel(poseSummary.dominantRacketSide)}。`;

  if (weakestMetric[1] >= 80) {
    return `${evidence} ${viewLead} 当前这条高远球的可观测框架比较稳定，下一步更适合继续验证动作能否连续复现。`;
  }

  return `${evidence} ${viewLead} 当前最值得先改的是${METRIC_LABELS[weakestMetric[0]]}，这也是这次报告里证据最明确的短板。`;
}

function buildRankedIssues(metricScores: MetricScores, poseSummary: PoseAnalysisResult['summary']): RankedIssue[] {
  return ISSUE_DEFINITIONS
    .map((definition) => {
      const metricScore = metricScores[definition.metricKey];
      const rawGap = definition.threshold - metricScore;
      const gap = definition.metricKey === 'turn' && isWeakTurnView(poseSummary.viewProfile)
        ? rawGap * 0.55
        : rawGap;
      if (gap <= 0) return null;

      return {
        title: definition.title,
        description: `${definition.description}（${METRIC_LABELS[definition.metricKey]} ${metricScore} 分）${getMetricViewNote(definition.metricKey, poseSummary.viewProfile)}`,
        impact: `${definition.impact}${definition.metricKey === 'turn' && isWeakTurnView(poseSummary.viewProfile) ? ' 当前视角下，这一项会建议你在下次尽量保持同机位复测确认。' : ''}`,
        metricKey: definition.metricKey,
        severity: gap,
        suggestion: definition.suggestion,
      } satisfies RankedIssue;
    })
    .filter((item): item is RankedIssue => Boolean(item))
    .sort((a, b) => b.severity - a.severity);
}

function buildStandardComparison(rankedIssues: RankedIssue[], poseSummary: PoseAnalysisResult['summary']): StandardComparison {
  const viewLabel = getViewLabel(poseSummary.viewProfile);
  const differences = rankedIssues.length > 0
    ? rankedIssues.slice(0, 3).map((issue) => {
      switch (issue.metricKey) {
        case 'turn':
          return WEAK_TURN_VIEW_PROFILES.has(poseSummary.viewProfile ?? 'unknown')
            ? `基于当前${viewLabel}视角，系统看到转体展开还有提升空间，但这一项会保留为弱判断。`
            : `基于当前${viewLabel}视角，系统看到身体更常停留在较正朝向，和参考动作相比，侧身展开还不够明确。`;
        case 'lift':
          return `基于当前${viewLabel}视角，挥拍臂准备空间还没完全撑开，和参考动作相比，上举幅度偏保守。`;
        case 'repeatability':
          return `基于当前${viewLabel}视角，当前样本不同帧之间波动偏大，动作复现稳定性还不够。`;
        case 'stability':
          return `当前样本虽然可分析，但在${viewLabel}视角下的主体稳定度仍偏边缘，画面条件还需要先稳住。`;
      }
    })
    : [`基于当前${viewLabel}视角，当前样本和参考动作之间的可观测差异已经不大，下一步更适合继续验证稳定复现。`];

  return {
    sectionTitle: '当前视角动作参考对照',
    summaryText: rankedIssues.length > 0
      ? `当前识别为${viewLabel}视角，和参考动作相比，最明确的差异集中在${rankedIssues.slice(0, 3).map((item) => METRIC_LABELS[item.metricKey]).join('、')}。`
      : `当前识别为${viewLabel}视角，和参考动作相比，可稳定观测的关键维度已经比较接近。`,
    currentFrameLabel: '当前样本最佳稳定帧',
    standardFrameLabel: STANDARD_REFERENCE.imageLabel,
    viewProfile: poseSummary.viewProfile,
    standardReference: {
      ...STANDARD_REFERENCE,
      cue: getViewReferenceCue(poseSummary.viewProfile),
    },
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
    available: true,
    confidence: getMetricConfidence(key, poseResult.summary.viewProfile),
    note: getMetricViewNote(key, poseResult.summary.viewProfile),
  }));
  const totalScoreBreakdown = buildTotalScoreBreakdown(metricScores);
  const totalScore = totalScoreBreakdown.finalTotalScore;
  const rankedIssues = buildRankedIssues(metricScores, poseResult.summary);
  const recognitionContext = buildRecognitionContext(poseResult.summary, poseResult.engine);
  const visualEvidence = buildVisualEvidence(task, poseResult);
  const dimensionEvidence = (Object.keys(METRIC_LABELS) as MetricKey[]).map((key) => (
    buildDimensionEvidence(key, metricScores, poseResult.summary, poseResult.frameCount)
  ));

  const issues = rankedIssues.length > 0
    ? rankedIssues.slice(0, 3).map(({ title, description, impact }) => ({
      title,
      description,
      impact,
    }))
    : [{
      title: '当前高远球可观测框架较稳定',
      description: `当前识别为${recognitionContext.viewLabel}视角，系统能稳定看到主体稳定度、侧身展开、挥拍臂准备和动作复现都没有明显拖后腿的短板。`,
      impact: '接下来更值得继续验证的是，能不能在同机位下把这套动作持续复现出来。',
    }];

  const suggestions = rankedIssues.length > 0
    ? rankedIssues.map((item) => ({
      ...item.suggestion,
      description: `${item.suggestion.description} 当前识别为${recognitionContext.viewLabel}视角。`,
    })).slice(0, 3)
    : [{
      title: '下次继续验证动作能否稳定复现',
      description: `保持同一机位再录一条高远球视频，优先确认这次在${recognitionContext.viewLabel}视角下看到的较稳动作不是偶尔出现。`,
    }];

  return {
    taskId: task.taskId,
    actionType: task.actionType,
    totalScore,
    summaryText: buildSummaryText(metricScores, poseResult.summary, poseResult.frameCount),
    dimensionScores,
    issues,
    suggestions,
    compareSummary: `当前报告只围绕${recognitionContext.viewLabel}视角下可稳定观测的侧身展开、挥拍臂上举、主体稳定度和动作复现稳定性生成。`,
    retestAdvice: `建议 3~7 天后保持同一机位复测，下次优先看${recognitionContext.viewLabel}视角下的侧身展开、挥拍臂上举和动作复现稳定性是否一起变稳。`,
    createdAt: now(),
    poseBased: true,
    recognitionContext,
    visualEvidence,
    standardComparison: buildStandardComparison(rankedIssues, poseResult.summary),
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
      metricScores,
      totalScoreBreakdown,
      dimensionEvidence,
      humanSummary: poseResult.summary.humanSummary,
    },
    preprocess: {
      metadata: task.artifacts.preprocess?.metadata,
      artifacts: task.artifacts.preprocess?.artifacts,
    },
  };
}
