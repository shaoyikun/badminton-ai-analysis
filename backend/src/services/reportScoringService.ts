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

function clampUnit(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function roundDebugValue(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

type DimensionKey =
  | 'evidence_quality'
  | 'body_preparation'
  | 'racket_arm_preparation'
  | 'swing_repeatability'
  | 'camera_suitability';

type PublicDimensionKey = Exclude<DimensionKey, 'camera_suitability'>;

type DimensionScores = Record<DimensionKey, number>;
type StructuredEvidenceValue = string | number | boolean | null;
type StructuredEvidenceRecord = Record<string, StructuredEvidenceValue>;
type DimensionEvidenceEntry = NonNullable<NonNullable<ReportResult['scoringEvidence']>['dimensionEvidence']>[number];

type PoseQualityFailure = {
  code: FlowErrorCode;
  message: string;
};

type AnalysisDisposition = {
  hardRejectReasons: FlowErrorCode[];
  lowConfidenceReasons: FlowErrorCode[];
  confidencePenaltyNotes: string[];
};

type RankedIssue = ReportResult['issues'][number] & {
  key: PublicDimensionKey | 'confidence';
  severity: number;
  kind: 'action_gap' | 'evidence_gap';
  suggestion: SuggestionItem;
};

type SpecializedSummaryItem = NonNullable<PoseAnalysisResult['summary']['specializedFeatureSummary']>[string];

type WeightedFeature = {
  key: string;
  value: number | null;
  weight: number;
};

type FeatureGroupScore = {
  score: number;
  normalizedScore: number;
  observableCoverage: number;
  source: string;
  formula: string;
  inputs: StructuredEvidenceRecord;
  fallbacks: string[];
  usedFallback: boolean;
};

const SCORING_MODEL_VERSION = 'rule-v2-evidence-confidence';
const LOW_CONFIDENCE_THRESHOLD = 70;

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  evidence_quality: '证据质量',
  body_preparation: '身体准备',
  racket_arm_preparation: '挥拍臂准备',
  swing_repeatability: '挥拍复现稳定性',
  camera_suitability: '相机适配度',
};

const TOTAL_SCORE_WEIGHTS: Record<Exclude<DimensionKey, 'evidence_quality' | 'camera_suitability'>, number> = {
  body_preparation: 0.38,
  racket_arm_preparation: 0.37,
  swing_repeatability: 0.25,
};

const CONFIDENCE_WEIGHTS = {
  evidenceQuality: 0.55,
  cameraSuitability: 0.3,
  observability: 0.15,
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

const HARD_REJECT_REASONS = new Set<FlowErrorCode>([
  'body_not_detected',
  'subject_too_small_or_cropped',
  'poor_lighting_or_occlusion',
  'insufficient_pose_coverage',
]);

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

const FRONT_VIEW_PROFILES = new Set<ViewProfile>(['front', 'front_left_oblique', 'front_right_oblique']);

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
      return '当前识别为侧面视角，系统会把更多置信度留给挥拍臂准备，身体准备判断相对保守。';
    case 'front':
      return '当前识别为正面视角，系统仍可参考挥拍臂准备和证据稳定性，但不会把视角局限直接当作动作差。';
    case 'front_left_oblique':
    case 'front_right_oblique':
      return '当前识别为前斜视角，报告会保留动作结论，但会单独降低证据置信度。';
    case 'rear_left_oblique':
    case 'rear_right_oblique':
      return '当前识别为后斜视角，这次对身体准备和挥拍臂准备都能给出较完整的可解释证据。';
    case 'rear':
      return '当前识别为后方视角，这次的动作准备判断和证据稳定度相对更稳。';
    default:
      return '当前报告会同时区分动作问题和证据质量问题，避免把机位局限直接写成动作差。';
  }
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
  const bestPoseFrame = bestFrameIndex !== null && bestFrameIndex !== undefined ? frameMap.get(bestFrameIndex) : undefined;

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

function uniqueReasons(reasons: FlowErrorCode[]) {
  return [...new Set(reasons)];
}

function addLowConfidenceReason(
  reasons: FlowErrorCode[],
  notes: string[],
  code: FlowErrorCode,
  note: string,
) {
  reasons.push(code);
  notes.push(note);
}

function getAnalysisDisposition(poseResult: PoseAnalysisResult): AnalysisDisposition {
  const hardRejectReasons = uniqueReasons(
    poseResult.summary.rejectionReasons.filter((reason) => HARD_REJECT_REASONS.has(reason)),
  );
  const lowConfidenceReasons = [...poseResult.summary.rejectionReasons.filter((reason) => !HARD_REJECT_REASONS.has(reason))];
  const confidencePenaltyNotes: string[] = [];

  const viewProfile = poseResult.summary.viewProfile ?? 'unknown';
  const unknownViewCount = poseResult.summary.debugCounts?.unknownViewCount ?? 0;
  const usableFrameCount = Math.max(1, poseResult.summary.usableFrameCount);
  const unknownViewRatio = unknownViewCount / usableFrameCount;
  const weakViewConfidence = (poseResult.summary.viewConfidence ?? 0) < 0.62;
  const frontOrUnknownView = FRONT_VIEW_PROFILES.has(viewProfile) || viewProfile === 'unknown';

  if (frontOrUnknownView || weakViewConfidence || unknownViewRatio >= 0.45) {
    addLowConfidenceReason(
      lowConfidenceReasons,
      confidencePenaltyNotes,
      'invalid_camera_angle',
      '当前机位降低了置信度，但不直接代表动作更差。',
    );
  }

  if (poseResult.summary.scoreVariance >= 0.03 && poseResult.summary.coverageRatio >= 0.6) {
    addLowConfidenceReason(
      lowConfidenceReasons,
      confidencePenaltyNotes,
      'insufficient_action_evidence',
      '当前样本复现证据偏散，建议同机位再录一条确认动作是否稳定。',
    );
  }

  return {
    hardRejectReasons,
    lowConfidenceReasons: uniqueReasons(lowConfidenceReasons),
    confidencePenaltyNotes: [...new Set(confidencePenaltyNotes)],
  };
}

function getFeatureSummary(
  summary: PoseAnalysisResult['summary'],
  key: string,
): SpecializedSummaryItem | undefined {
  return summary.specializedFeatureSummary?.[key];
}

function buildFeatureGroupScore(
  summary: PoseAnalysisResult['summary'],
  features: WeightedFeature[],
  fallbackScore: number,
  fallbackLabel: string,
  scoreFormula: string,
  fallbackFormula: string,
): FeatureGroupScore {
  const available = features.filter((feature) => typeof feature.value === 'number');
  if (available.length === 0) {
    return {
      score: fallbackScore,
      normalizedScore: clampUnit((fallbackScore - 20) / 80),
      observableCoverage: 0,
      source: `${fallbackLabel}=${roundDebugValue((fallbackScore - 20) / 80)}`,
      formula: fallbackFormula,
      inputs: {
        [fallbackLabel]: roundDebugValue((fallbackScore - 20) / 80),
      },
      fallbacks: [`${fallbackLabel}_fallback`],
      usedFallback: true,
    };
  }

  const totalWeight = available.reduce((sum, feature) => sum + feature.weight, 0);
  const normalizedScore = totalWeight > 0
    ? available.reduce((sum, feature) => sum + (feature.value ?? 0) * feature.weight, 0) / totalWeight
    : 0;
  const observableCoverage = features.length > 0 ? available.length / features.length : 0;
  const inputs = Object.fromEntries(features.map((feature) => [feature.key, feature.value === null ? null : roundDebugValue(feature.value)]));

  return {
    score: clampScore(25 + normalizedScore * 75),
    normalizedScore,
    observableCoverage,
    source: available.map((feature) => `${feature.key}=${roundDebugValue(feature.value ?? 0)}`).join(', '),
    formula: scoreFormula,
    inputs,
    fallbacks: [],
    usedFallback: false,
  };
}

function buildDimensionScores(summary: PoseAnalysisResult['summary'], frameCount: number) {
  const usableRatio = frameCount > 0 ? summary.usableFrameCount / frameCount : 0;
  const trunkCoil = getFeatureSummary(summary, 'trunkCoilScore');
  const sideOnReadiness = getFeatureSummary(summary, 'sideOnReadinessScore');
  const shoulderHipRotation = getFeatureSummary(summary, 'shoulderHipRotationScore');
  const hittingArmPreparation = getFeatureSummary(summary, 'hittingArmPreparationScore');
  const wristAboveShoulder = getFeatureSummary(summary, 'wristAboveShoulderConfidence');
  const racketSideElbowHeight = getFeatureSummary(summary, 'racketSideElbowHeightScore');
  const elbowExtension = getFeatureSummary(summary, 'elbowExtensionScore');
  const contactPreparation = getFeatureSummary(summary, 'contactPreparationScore');

  const coreObservableCoverages = [
    trunkCoil?.observableCoverage,
    hittingArmPreparation?.observableCoverage,
    contactPreparation?.observableCoverage,
  ].filter((value): value is number => typeof value === 'number');
  const coreObservableCoverage = coreObservableCoverages.length > 0
    ? coreObservableCoverages.reduce((sum, value) => sum + value, 0) / coreObservableCoverages.length
    : 0;

  const evidenceQuality = clampScore(
    summary.coverageRatio * 40 + summary.medianStabilityScore * 35 + coreObservableCoverage * 25,
  );

  const bodyPreparationGroup = buildFeatureGroupScore(
    summary,
    [
      { key: 'sideOnReadinessScore', value: sideOnReadiness?.median ?? null, weight: 0.35 },
      { key: 'shoulderHipRotationScore', value: shoulderHipRotation?.median ?? null, weight: 0.3 },
      { key: 'trunkCoilScore', value: trunkCoil?.median ?? null, weight: 0.35 },
    ],
    clampScore(20 + summary.medianBodyTurnScore * 80),
    'medianBodyTurnScore',
    'clamp(round(25 + weighted(sideOnReadinessScore, shoulderHipRotationScore, trunkCoilScore) * 75))',
    'clamp(round(20 + medianBodyTurnScore * 80))',
  );

  const racketArmPreparationGroup = buildFeatureGroupScore(
    summary,
    [
      { key: 'hittingArmPreparationScore', value: hittingArmPreparation?.median ?? null, weight: 0.4 },
      { key: 'wristAboveShoulderConfidence', value: wristAboveShoulder?.median ?? null, weight: 0.2 },
      { key: 'racketSideElbowHeightScore', value: racketSideElbowHeight?.median ?? null, weight: 0.2 },
      { key: 'elbowExtensionScore', value: elbowExtension?.median ?? null, weight: 0.2 },
    ],
    clampScore(20 + summary.medianRacketArmLiftScore * 80),
    'medianRacketArmLiftScore',
    'clamp(round(25 + weighted(hittingArmPreparationScore, wristAboveShoulderConfidence, racketSideElbowHeightScore, elbowExtensionScore) * 75))',
    'clamp(round(20 + medianRacketArmLiftScore * 80))',
  );

  const contactPreparationMedian = contactPreparation?.median ?? null;
  const contactPreparationCoverage = contactPreparation?.observableCoverage ?? 0;
  const varianceComponent = Math.max(0, 1 - (summary.scoreVariance / 0.04));
  const swingRepeatabilityFallback = clampScore(usableRatio * 50 + varianceComponent * 50);
  const swingRepeatability = contactPreparationMedian === null
    ? swingRepeatabilityFallback
    : clampScore(contactPreparationMedian * 45 + contactPreparationCoverage * 30 + usableRatio * 15 + varianceComponent * 10);

  const viewFactorByProfile: Record<ViewProfile, number> = {
    rear: 1,
    rear_left_oblique: 0.95,
    rear_right_oblique: 0.95,
    left_side: 0.88,
    right_side: 0.88,
    front_left_oblique: 0.72,
    front_right_oblique: 0.72,
    front: 0.58,
    unknown: 0.4,
  };
  const unknownViewCount = summary.debugCounts?.unknownViewCount ?? 0;
  const unknownViewRatio = summary.usableFrameCount > 0 ? unknownViewCount / summary.usableFrameCount : 1;
  const cameraSuitability = clampScore(
    viewFactorByProfile[summary.viewProfile ?? 'unknown'] * 45
      + (summary.viewConfidence ?? 0.45) * 30
      + (summary.viewStability ?? summary.viewConfidence ?? 0.45) * 15
      + Math.max(0, 1 - unknownViewRatio) * 10,
  );

  const dimensionScores: DimensionScores = {
    evidence_quality: evidenceQuality,
    body_preparation: bodyPreparationGroup.score,
    racket_arm_preparation: racketArmPreparationGroup.score,
    swing_repeatability: swingRepeatability,
    camera_suitability: cameraSuitability,
  };

  return {
    dimensionScores,
    coreObservableCoverage,
    bodyPreparationGroup,
    racketArmPreparationGroup,
    swingRepeatabilityFallbackUsed: contactPreparationMedian === null,
    swingRepeatabilityInputs: {
      contactPreparationMedian: contactPreparationMedian === null ? null : roundDebugValue(contactPreparationMedian),
      contactPreparationObservableCoverage: roundDebugValue(contactPreparationCoverage),
      usableRatio: roundDebugValue(usableRatio),
      scoreVariance: roundDebugValue(summary.scoreVariance),
    } satisfies StructuredEvidenceRecord,
    cameraInputs: {
      viewProfile: summary.viewProfile ?? 'unknown',
      viewConfidence: summary.viewConfidence ?? null,
      viewStability: summary.viewStability ?? null,
      unknownViewCount,
      usableFrameCount: summary.usableFrameCount,
      unknownViewRatio: roundDebugValue(unknownViewRatio),
    } satisfies StructuredEvidenceRecord,
  };
}

function getDimensionConfidence(key: PublicDimensionKey, scores: DimensionScores, bodyCoverage: number, racketCoverage: number, swingFallbackUsed: boolean) {
  switch (key) {
    case 'evidence_quality':
      return 0.92;
    case 'body_preparation':
      return clampUnit(0.45 + bodyCoverage * 0.35 + scores.camera_suitability / 100 * 0.2);
    case 'racket_arm_preparation':
      return clampUnit(0.45 + racketCoverage * 0.35 + scores.camera_suitability / 100 * 0.2);
    case 'swing_repeatability':
      return clampUnit(0.5 + scores.evidence_quality / 100 * 0.2 + (swingFallbackUsed ? 0 : 0.2));
  }
}

function buildDimensionEvidence(
  key: DimensionKey,
  scores: DimensionScores,
  summary: PoseAnalysisResult['summary'],
  frameCount: number,
  computed: ReturnType<typeof buildDimensionScores>,
): DimensionEvidenceEntry {
  const usableRatio = frameCount > 0 ? summary.usableFrameCount / frameCount : 0;

  switch (key) {
    case 'evidence_quality':
      return {
        key,
        label: DIMENSION_LABELS[key],
        score: scores[key],
        available: true,
        confidence: 0.92,
        source: `coverageRatio=${summary.coverageRatio}, medianStabilityScore=${summary.medianStabilityScore}, coreObservableCoverage=${roundDebugValue(computed.coreObservableCoverage)}`,
        inputs: {
          coverageRatio: roundDebugValue(summary.coverageRatio),
          medianStabilityScore: roundDebugValue(summary.medianStabilityScore),
          coreObservableCoverage: roundDebugValue(computed.coreObservableCoverage),
        },
        formula: 'clamp(round(coverageRatio * 40 + medianStabilityScore * 35 + coreObservableCoverage * 25))',
        adjustments: {
          viewPenaltyApplied: false,
        },
        fallbacks: [],
      };
    case 'body_preparation':
      return {
        key,
        label: DIMENSION_LABELS[key],
        score: scores[key],
        available: true,
        confidence: getDimensionConfidence(key, scores, computed.bodyPreparationGroup.observableCoverage, computed.racketArmPreparationGroup.observableCoverage, computed.swingRepeatabilityFallbackUsed),
        source: computed.bodyPreparationGroup.source,
        inputs: computed.bodyPreparationGroup.inputs,
        formula: computed.bodyPreparationGroup.formula,
        adjustments: {
          observableCoverage: roundDebugValue(computed.bodyPreparationGroup.observableCoverage),
          usedFallback: computed.bodyPreparationGroup.usedFallback,
        },
        fallbacks: computed.bodyPreparationGroup.fallbacks,
      };
    case 'racket_arm_preparation':
      return {
        key,
        label: DIMENSION_LABELS[key],
        score: scores[key],
        available: true,
        confidence: getDimensionConfidence(key, scores, computed.bodyPreparationGroup.observableCoverage, computed.racketArmPreparationGroup.observableCoverage, computed.swingRepeatabilityFallbackUsed),
        source: computed.racketArmPreparationGroup.source,
        inputs: computed.racketArmPreparationGroup.inputs,
        formula: computed.racketArmPreparationGroup.formula,
        adjustments: {
          observableCoverage: roundDebugValue(computed.racketArmPreparationGroup.observableCoverage),
          usedFallback: computed.racketArmPreparationGroup.usedFallback,
        },
        fallbacks: computed.racketArmPreparationGroup.fallbacks,
      };
    case 'swing_repeatability':
      return {
        key,
        label: DIMENSION_LABELS[key],
        score: scores[key],
        available: true,
        confidence: getDimensionConfidence(key, scores, computed.bodyPreparationGroup.observableCoverage, computed.racketArmPreparationGroup.observableCoverage, computed.swingRepeatabilityFallbackUsed),
        source: `usableRatio=${roundDebugValue(usableRatio)}, scoreVariance=${roundDebugValue(summary.scoreVariance)}, contactPreparationMedian=${computed.swingRepeatabilityInputs.contactPreparationMedian ?? 'null'}`,
        inputs: computed.swingRepeatabilityInputs,
        formula: computed.swingRepeatabilityFallbackUsed
          ? 'clamp(round(usableRatio * 50 + max(0, 1 - scoreVariance / 0.04) * 50))'
          : 'clamp(round(contactPreparationMedian * 45 + contactPreparationObservableCoverage * 30 + usableRatio * 15 + max(0, 1 - scoreVariance / 0.04) * 10))',
        adjustments: {
          scoreVarianceRole: 'phase_proxy',
          usedFallback: computed.swingRepeatabilityFallbackUsed,
        },
        fallbacks: computed.swingRepeatabilityFallbackUsed ? ['contactPreparationScore_fallback'] : [],
      };
    case 'camera_suitability':
      return {
        key,
        label: DIMENSION_LABELS[key],
        score: scores[key],
        available: true,
        confidence: 0.85,
        source: `viewProfile=${summary.viewProfile ?? 'unknown'}, viewConfidence=${summary.viewConfidence ?? 'null'}, viewStability=${summary.viewStability ?? 'null'}`,
        inputs: computed.cameraInputs,
        formula: 'clamp(round(viewProfileFactor * 45 + viewConfidence * 30 + viewStability * 15 + max(0, 1 - unknownViewRatio) * 10))',
        adjustments: {
          impactsTotalScore: false,
        },
        fallbacks: [],
      };
  }
}

function buildTotalScoreBreakdown(scores: DimensionScores) {
  const contributions = (Object.keys(TOTAL_SCORE_WEIGHTS) as Array<keyof typeof TOTAL_SCORE_WEIGHTS>).map((key) => ({
    key,
    label: DIMENSION_LABELS[key],
    score: scores[key],
    weight: TOTAL_SCORE_WEIGHTS[key],
    weightedScore: roundDebugValue(scores[key] * TOTAL_SCORE_WEIGHTS[key]),
  }));
  const rawWeightedTotal = roundDebugValue(contributions.reduce((sum, item) => sum + item.weightedScore, 0));
  return {
    rawWeightedTotal,
    finalTotalScore: clampScore(rawWeightedTotal),
    contributions,
  };
}

function buildConfidenceBreakdown(
  scores: DimensionScores,
  computed: ReturnType<typeof buildDimensionScores>,
  disposition: AnalysisDisposition,
) {
  const observabilityScore = clampScore(
    ((computed.bodyPreparationGroup.observableCoverage + computed.racketArmPreparationGroup.observableCoverage + (computed.swingRepeatabilityFallbackUsed ? 0 : 1)) / 3) * 100,
  );
  const contributions = [
    {
      key: 'evidence_quality',
      label: DIMENSION_LABELS.evidence_quality,
      score: scores.evidence_quality,
      weight: CONFIDENCE_WEIGHTS.evidenceQuality,
      weightedScore: roundDebugValue(scores.evidence_quality * CONFIDENCE_WEIGHTS.evidenceQuality),
    },
    {
      key: 'camera_suitability',
      label: DIMENSION_LABELS.camera_suitability,
      score: scores.camera_suitability,
      weight: CONFIDENCE_WEIGHTS.cameraSuitability,
      weightedScore: roundDebugValue(scores.camera_suitability * CONFIDENCE_WEIGHTS.cameraSuitability),
    },
    {
      key: 'observability',
      label: '专项特征完整度',
      score: observabilityScore,
      weight: CONFIDENCE_WEIGHTS.observability,
      weightedScore: roundDebugValue(observabilityScore * CONFIDENCE_WEIGHTS.observability),
    },
  ];

  const penalties = [
    computed.bodyPreparationGroup.usedFallback
      ? { key: 'body_preparation_fallback', label: '身体准备回退', amount: 8, reason: '本次身体准备主要由旧 turn 特征补足。' }
      : null,
    computed.racketArmPreparationGroup.usedFallback
      ? { key: 'racket_arm_preparation_fallback', label: '挥拍臂准备回退', amount: 8, reason: '本次挥拍臂准备主要由旧 lift 特征补足。' }
      : null,
    computed.swingRepeatabilityFallbackUsed
      ? { key: 'swing_repeatability_fallback', label: '挥拍复现回退', amount: 6, reason: '本次复现稳定性缺少 contactPreparation 主证据。' }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const rawConfidenceScore = roundDebugValue(contributions.reduce((sum, item) => sum + item.weightedScore, 0));
  const totalPenalty = penalties.reduce((sum, item) => sum + item.amount, 0);
  const finalConfidenceScore = clampScore(rawConfidenceScore - totalPenalty);

  return {
    observabilityScore,
    rawConfidenceScore,
    finalConfidenceScore,
    contributions,
    penalties,
    confidencePenaltyNotes: disposition.confidencePenaltyNotes,
  };
}

function buildEvidenceNotes(
  scores: DimensionScores,
  confidenceScore: number,
  disposition: AnalysisDisposition,
  computed: ReturnType<typeof buildDimensionScores>,
) {
  const notes = [...disposition.confidencePenaltyNotes];
  if (scores.camera_suitability < 70 && !notes.some((note) => note.includes('机位'))) {
    notes.push('当前机位降低了置信度，但不直接代表动作更差。');
  }
  if (scores.swing_repeatability < 65 && !notes.some((note) => note.includes('复现证据偏散'))) {
    notes.push('当前样本复现证据偏散，建议同机位再录一条确认动作是否稳定。');
  }
  if (computed.bodyPreparationGroup.usedFallback || computed.racketArmPreparationGroup.usedFallback || computed.swingRepeatabilityFallbackUsed) {
    notes.push('本次部分维度由兼容特征补足，解释性弱于完整专项证据。');
  }
  if (confidenceScore < LOW_CONFIDENCE_THRESHOLD) {
    notes.push('当前报告可分析，但建议把证据质量先稳住后再解读动作差异。');
  }
  return [...new Set(notes)];
}

function buildSummaryText(
  publicScores: Record<PublicDimensionKey, number>,
  confidenceScore: number,
  summary: PoseAnalysisResult['summary'],
  frameCount: number,
) {
  const weakestDimension = (Object.entries(publicScores) as Array<[PublicDimensionKey, number]>).sort((left, right) => left[1] - right[1])[0];
  const evidenceLead = `本次基于 ${summary.usableFrameCount}/${frameCount} 帧稳定识别结果生成。`;
  const recognitionLead = `当前识别为${getViewLabel(summary.viewProfile)}，${getRacketSideLabel(summary.dominantRacketSide)}。`;

  if (confidenceScore < LOW_CONFIDENCE_THRESHOLD) {
    return `${evidenceLead} ${recognitionLead} 当前报告能看出动作大方向，但证据置信度偏低，建议先把机位和样本稳定性收住，再放大解读动作细节。`;
  }

  if (weakestDimension[1] >= 80) {
    return `${evidenceLead} ${recognitionLead} 当前这条高远球的可观测动作框架比较完整，下一步更适合继续验证能否稳定复现。`;
  }

  return `${evidenceLead} ${recognitionLead} 当前最值得先改的是${DIMENSION_LABELS[weakestDimension[0]]}，这也是这次动作证据最明确的短板。`;
}

function buildRankedIssues(
  publicScores: Record<PublicDimensionKey, number>,
  confidenceScore: number,
  evidenceNotes: string[],
): RankedIssue[] {
  const issues: RankedIssue[] = [];

  if (publicScores.body_preparation < 72) {
    const severity = 72 - publicScores.body_preparation;
    issues.push({
      key: 'body_preparation',
      kind: 'action_gap',
      severity,
      title: '身体准备不足',
      description: `当前身体准备分为 ${publicScores.body_preparation} 分，说明侧身进入和躯干蓄力还不够稳定。`,
      impact: '这会压缩击球前的准备空间，让后续出手更依赖临时补动作。',
      suggestion: {
        title: '下次先盯身体准备能不能更早完成',
        description: '保持同机位复测，优先确认准备到出手前，身体是否更早完成侧身和躯干打开。',
      },
    });
  }

  if (publicScores.racket_arm_preparation < 72) {
    const severity = 72 - publicScores.racket_arm_preparation;
    issues.push({
      key: 'racket_arm_preparation',
      kind: 'action_gap',
      severity,
      title: '挥拍臂准备不足',
      description: `当前挥拍臂准备分为 ${publicScores.racket_arm_preparation} 分，说明抬肘、伸展和准备高度还不够完整。`,
      impact: '这会让击球前的准备空间不足，动作容易只靠最后一下补手臂。',
      suggestion: {
        title: '下次先看挥拍臂是不是更早到位',
        description: '优先确认挥拍肘和手腕是不是更早进入准备位置，而不是临近出手才临时抬起。',
      },
    });
  }

  if (publicScores.swing_repeatability < 74) {
    const severity = 74 - publicScores.swing_repeatability;
    issues.push({
      key: 'swing_repeatability',
      kind: 'action_gap',
      severity,
      title: '挥拍复现稳定性不足',
      description: `当前挥拍复现稳定性为 ${publicScores.swing_repeatability} 分，说明动作质量在多帧之间还不够一致。`,
      impact: '动作波动大时，单次看起来做到了的细节不一定能连续复现。',
      suggestion: {
        title: '下次先把同一套挥拍节奏连续做稳',
        description: '优先保证准备、出手和收拍的节奏一致，再看单次最好效果。',
      },
    });
  }

  if (confidenceScore < LOW_CONFIDENCE_THRESHOLD || publicScores.evidence_quality < 70) {
    const severity = Math.max(LOW_CONFIDENCE_THRESHOLD - confidenceScore, 70 - publicScores.evidence_quality);
    issues.push({
      key: 'confidence',
      kind: 'evidence_gap',
      severity,
      title: '当前样本证据置信度偏低',
      description: `当前证据质量为 ${publicScores.evidence_quality} 分，置信度为 ${confidenceScore} 分。${evidenceNotes[0] ?? '这不直接代表动作更差，而是说明当前视频对动作判断的支持力度有限。'}`,
      impact: '这次更适合作为方向性参考，不建议把细小分差直接当成动作退步或进步。',
      suggestion: {
        title: '下次优先把拍摄证据先稳住',
        description: '先保持同机位、减少抖动、让主体完整入镜，再看动作细节的分差会更可靠。',
      },
    });
  }

  return issues.sort((left, right) => right.severity - left.severity);
}

function buildStandardComparison(rankedIssues: RankedIssue[], summary: PoseAnalysisResult['summary']): StandardComparison {
  const viewLabel = getViewLabel(summary.viewProfile);
  const topIssues = rankedIssues.slice(0, 3);
  const differences = topIssues.length > 0
    ? topIssues.map((issue) => {
      switch (issue.key) {
        case 'body_preparation':
          return `基于当前${viewLabel}视角，系统看到身体准备还不够早，侧身进入和躯干打开空间仍偏小。`;
        case 'racket_arm_preparation':
          return `基于当前${viewLabel}视角，挥拍臂准备还没完全撑开，抬肘和准备高度偏保守。`;
        case 'swing_repeatability':
          return `基于当前${viewLabel}视角，当前样本在多帧里的挥拍节奏还不够一致，复现稳定性不足。`;
        case 'confidence':
          return `这次更明显的问题在证据质量而不是动作结论本身，当前${viewLabel}视角下的机位或样本稳定性降低了判断置信度。`;
      }
    }).filter((item): item is string => Boolean(item))
    : [`基于当前${viewLabel}视角，当前样本和参考动作之间的关键准备维度已经比较接近。`];

  return {
    sectionTitle: '当前视角动作参考对照',
    summaryText: topIssues.length > 0
      ? `当前识别为${viewLabel}视角，这次最明确的差异集中在${topIssues.map((item) => item.kind === 'evidence_gap' ? '证据质量' : DIMENSION_LABELS[item.key as PublicDimensionKey]).join('、')}。`
      : `当前识别为${viewLabel}视角，这次可稳定观测的动作准备维度已经比较接近参考动作。`,
    currentFrameLabel: '当前样本最佳稳定帧',
    standardFrameLabel: '标准高远球真人参考帧',
    viewProfile: summary.viewProfile,
    standardReference: {
      title: '正手高远球标准参考帧',
      cue: getViewReferenceCue(summary.viewProfile),
      imageLabel: '标准高远球真人参考帧',
      imagePath: '/standard-references/clear-reference-real.jpg',
      sourceType: 'real-sample',
    },
    phaseFrames: [
      {
        phase: '准备',
        title: '高远球准备阶段',
        imagePath: '/standard-references/clear-phase-prep.jpg',
        cue: '优先观察身体准备是否更早完成，而不是只看击球瞬间。',
      },
      {
        phase: '挥拍臂',
        title: '高远球挥拍臂准备',
        imagePath: '/standard-references/clear-phase-contact.jpg',
        cue: '看挥拍肘、手腕高度和伸展是否一起撑开。',
      },
      {
        phase: '复现',
        title: '高远球动作复现',
        imagePath: '/standard-references/clear-phase-follow.jpg',
        cue: '确认这套动作能否在多帧里稳定出现，而不是只偶尔做对。',
      },
    ],
    differences,
  };
}

function buildCompareSummary(recognitionContext: RecognitionContext, confidenceScore: number) {
  const confidenceClause = confidenceScore < LOW_CONFIDENCE_THRESHOLD
    ? '这次报告会把机位和样本稳定性作为低置信提示单独输出。'
    : '这次报告里的动作分数和证据分数已经分开处理。';
  return `当前报告围绕${recognitionContext.viewLabel}视角下的身体准备、挥拍臂准备、挥拍复现稳定性和证据质量生成。${confidenceClause}`;
}

function buildRetestAdvice(recognitionContext: RecognitionContext, confidenceScore: number, rankedIssues: RankedIssue[]) {
  if (confidenceScore < LOW_CONFIDENCE_THRESHOLD) {
    return `建议 3~7 天后保持同一机位复测，下次先把${recognitionContext.viewLabel}视角下的机位稳定性和主体完整度收住，再看动作分差。`;
  }

  const topActionIssue = rankedIssues.find((issue) => issue.kind === 'action_gap');
  if (!topActionIssue) {
    return `建议 3~7 天后保持同一机位复测，继续确认${recognitionContext.viewLabel}视角下这套动作能否稳定复现。`;
  }

  return `建议 3~7 天后保持同一机位复测，下次优先看${recognitionContext.viewLabel}视角下的${DIMENSION_LABELS[topActionIssue.key as PublicDimensionKey]}是否继续变稳。`;
}

export function getPoseQualityFailure(poseResult: PoseAnalysisResult): PoseQualityFailure | null {
  const disposition = getAnalysisDisposition(poseResult);
  const primaryReason = disposition.hardRejectReasons[0];
  if (!primaryReason) return null;

  return {
    code: primaryReason,
    message: QUALITY_FAILURE_MESSAGES[primaryReason] ?? QUALITY_FAILURE_MESSAGES.insufficient_action_evidence,
  };
}

export function buildRuleBasedResult(task: AnalysisTaskRecord, poseResult: PoseAnalysisResult): ReportResult {
  const disposition = getAnalysisDisposition(poseResult);
  const computed = buildDimensionScores(poseResult.summary, poseResult.frameCount);
  const scores = computed.dimensionScores;
  const publicScores: Record<PublicDimensionKey, number> = {
    evidence_quality: scores.evidence_quality,
    body_preparation: scores.body_preparation,
    racket_arm_preparation: scores.racket_arm_preparation,
    swing_repeatability: scores.swing_repeatability,
  };
  const totalScoreBreakdown = buildTotalScoreBreakdown(scores);
  const confidenceBreakdown = buildConfidenceBreakdown(scores, computed, disposition);
  const confidenceScore = confidenceBreakdown.finalConfidenceScore;
  const analysisDisposition = disposition.hardRejectReasons.length > 0
    ? 'rejected'
    : confidenceScore < LOW_CONFIDENCE_THRESHOLD
      ? 'low_confidence'
      : 'analyzable';
  const evidenceNotes = buildEvidenceNotes(scores, confidenceScore, disposition, computed);
  const rankedIssues = buildRankedIssues(publicScores, confidenceScore, evidenceNotes);
  const recognitionContext = buildRecognitionContext(poseResult.summary, poseResult.engine);
  const visualEvidence = buildVisualEvidence(task, poseResult);
  const dimensionEvidence = (Object.keys(DIMENSION_LABELS) as DimensionKey[]).map((key) => (
    buildDimensionEvidence(key, scores, poseResult.summary, poseResult.frameCount, computed)
  ));
  const dimensionScores = (Object.keys(publicScores) as PublicDimensionKey[]).map((key) => ({
    name: DIMENSION_LABELS[key],
    score: publicScores[key],
    available: true,
    confidence: buildDimensionEvidence(key, scores, poseResult.summary, poseResult.frameCount, computed).confidence,
    note: key === 'evidence_quality'
      ? '这项只表达证据是否足够稳定可读，不直接代表动作好坏。'
      : confidenceScore < LOW_CONFIDENCE_THRESHOLD
        ? '这项动作分可作为方向参考，但请结合当前证据置信度一起解读。'
        : '这项分数更偏向动作质量判断，不会因为机位问题被直接写差。',
  }));

  const issues = rankedIssues.length > 0
    ? rankedIssues.slice(0, 3).map(({ title, description, impact }) => ({ title, description, impact }))
    : [{
      title: '当前动作框架和证据质量都比较稳定',
      description: `当前识别为${recognitionContext.viewLabel}视角，系统能稳定看到身体准备、挥拍臂准备和挥拍复现都没有明显短板。`,
      impact: '接下来更值得继续验证的是，能不能在同机位下把这套动作持续复现出来。',
    }];

  const suggestions = rankedIssues.length > 0
    ? rankedIssues.slice(0, 3).map((item) => ({
      ...item.suggestion,
      description: `${item.suggestion.description} 当前识别为${recognitionContext.viewLabel}视角。`,
    }))
    : [{
      title: '下次继续验证动作能否稳定复现',
      description: `保持同一机位再录一条高远球视频，优先确认这次在${recognitionContext.viewLabel}视角下看到的较稳动作不是偶尔出现。`,
    }];

  const fallbacksUsed = [
    ...computed.bodyPreparationGroup.fallbacks,
    ...computed.racketArmPreparationGroup.fallbacks,
    ...(computed.swingRepeatabilityFallbackUsed ? ['contactPreparationScore_fallback'] : []),
  ].filter((item): item is string => Boolean(item));

  return {
    taskId: task.taskId,
    actionType: task.actionType,
    totalScore: totalScoreBreakdown.finalTotalScore,
    confidenceScore,
    summaryText: buildSummaryText(publicScores, confidenceScore, poseResult.summary, poseResult.frameCount),
    dimensionScores,
    issues,
    suggestions,
    compareSummary: buildCompareSummary(recognitionContext, confidenceScore),
    retestAdvice: buildRetestAdvice(recognitionContext, confidenceScore, rankedIssues),
    evidenceNotes,
    createdAt: now(),
    poseBased: true,
    recognitionContext,
    visualEvidence,
    standardComparison: buildStandardComparison(rankedIssues, poseResult.summary),
    scoringEvidence: {
      scoringModelVersion: SCORING_MODEL_VERSION,
      analysisDisposition,
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
      dimensionScoresByKey: publicScores,
      cameraSuitability: scores.camera_suitability,
      fallbacksUsed,
      confidenceBreakdown: {
        rawConfidenceScore: confidenceBreakdown.rawConfidenceScore,
        finalConfidenceScore: confidenceBreakdown.finalConfidenceScore,
        evidenceQuality: scores.evidence_quality,
        cameraSuitability: scores.camera_suitability,
        observabilityScore: confidenceBreakdown.observabilityScore,
        contributions: confidenceBreakdown.contributions,
        penalties: confidenceBreakdown.penalties,
      },
      rejectionDecision: {
        hardRejectReasons: disposition.hardRejectReasons,
        lowConfidenceReasons: disposition.lowConfidenceReasons,
        confidencePenaltyNotes: evidenceNotes,
      },
      metricScores: {
        ...publicScores,
        camera_suitability: scores.camera_suitability,
      },
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
