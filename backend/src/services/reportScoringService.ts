import type {
  AnalysisTaskRecord,
  DominantRacketSide,
  FlowErrorCode,
  PoseAnalysisResult,
  ReportPhaseAssessment,
  ReportPhaseAssessmentStatus,
  ReportPhaseKey,
  RecognitionContext,
  ReportResult,
  StandardComparison,
  SuggestionItem,
  ViewProfile,
  VisualEvidence,
} from '../types/task';
import {
  FRONT_VIEW_PROFILES,
  buildDimensionEvidenceMap as buildSharedDimensionEvidenceMap,
  buildEvidenceSentence as buildSharedEvidenceSentence,
  buildFeatureGroupScore as buildSharedFeatureGroupScore,
  buildPhaseAssessment as buildSharedPhaseAssessment,
  buildRecognitionContext as buildSharedRecognitionContext,
  buildSuggestionDraft as buildSharedSuggestionDraft,
  buildVisualEvidence as buildSharedVisualEvidence,
  clampScore,
  clampUnit,
  compactEvidenceRefs as compactSharedEvidenceRefs,
  getAnalysisDisposition as getSharedAnalysisDisposition,
  getDetectedPhaseScore as getSharedDetectedPhaseScore,
  getFeatureSummary as getSharedFeatureSummary,
  getPhaseCandidate as getSharedPhaseCandidate,
  getRacketSideLabel as getSharedRacketSideLabel,
  getViewLabel as getSharedViewLabel,
  getWeakestFeature as getSharedWeakestFeature,
  now,
  roundDebugValue,
  shouldSuggestCaptureAdvice as shouldSharedSuggestCaptureAdvice,
  toDimensionEvidenceRef as toSharedDimensionEvidenceRef,
  toFeatureEvidenceRef as toSharedFeatureEvidenceRef,
} from './scoringShared';

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

type IssueCategory =
  | 'body_preparation_gap'
  | 'racket_arm_preparation_gap'
  | 'arm_lift_focus_gap'
  | 'repeatability_gap'
  | 'evidence_quality_gap';

type SuggestionRuleKey = 'technique_focus' | 'capture_fix' | 'retest_check';

type EvidenceRef = NonNullable<ReportResult['issues'][number]['evidenceRefs']>[number];

type RankedIssue = ReportResult['issues'][number] & {
  key: PublicDimensionKey | 'confidence';
  severity: number;
  rankingBucket: number;
  phaseKey?: ReportPhaseKey;
  phaseLabel?: string;
  leadSuggestion?: SuggestionDraft;
  captureSuggestion?: SuggestionDraft;
};

type SuggestionDraft = SuggestionItem & {
  ruleKey: SuggestionRuleKey;
};

type FeatureDescriptor = {
  key: string;
  label: string;
  value: number | null;
  observableCoverage?: number;
  reference?: string;
};

type IssueBuildContext = {
  recognitionContext: RecognitionContext;
  summary: PoseAnalysisResult['summary'];
  scores: DimensionScores;
  publicScores: Record<PublicDimensionKey, number>;
  confidenceScore: number;
  evidenceNotes: string[];
  computed: ReturnType<typeof buildDimensionScores>;
  dimensionEvidenceMap: Map<string, DimensionEvidenceEntry>;
  phaseBreakdown: ReportPhaseAssessment[];
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

const SCORING_MODEL_VERSION = 'rule-v3-phase-aware';
const LOW_CONFIDENCE_THRESHOLD = 70;

const PHASE_LABELS: Record<ReportPhaseKey, string> = {
  preparation: '准备',
  backswing: '引拍',
  contactCandidate: '击球候选',
  followThrough: '随挥',
};

const PHASE_STATUS_WEIGHTS: Record<ReportPhaseAssessmentStatus, number> = {
  ok: 0,
  attention: 1,
  insufficient_evidence: 2,
};

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

const QUALITY_FAILURE_MESSAGES: Record<FlowErrorCode, string> = {
  invalid_action_type: 'actionType is invalid',
  unsupported_action_scope: 'actionType is outside the current public runtime scope',
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

const FEATURE_LABELS: Record<string, string> = {
  sideOnReadinessScore: '侧身进入',
  shoulderHipRotationScore: '肩髋转开',
  trunkCoilScore: '躯干蓄力',
  hittingArmPreparationScore: '挥拍臂整体准备',
  wristAboveShoulderConfidence: '抬手高度',
  racketSideElbowHeightScore: '抬肘位置',
  elbowExtensionScore: '肘部展开',
  contactPreparationScore: '准备态完整度',
};

const ISSUE_DEFINITIONS: Record<IssueCategory, { issueType: 'action_gap' | 'evidence_gap'; targetDimensionKey: PublicDimensionKey | 'confidence'; threshold: number }> = {
  body_preparation_gap: {
    issueType: 'action_gap',
    targetDimensionKey: 'body_preparation',
    threshold: 72,
  },
  racket_arm_preparation_gap: {
    issueType: 'action_gap',
    targetDimensionKey: 'racket_arm_preparation',
    threshold: 72,
  },
  arm_lift_focus_gap: {
    issueType: 'action_gap',
    targetDimensionKey: 'racket_arm_preparation',
    threshold: 72,
  },
  repeatability_gap: {
    issueType: 'action_gap',
    targetDimensionKey: 'swing_repeatability',
    threshold: 74,
  },
  evidence_quality_gap: {
    issueType: 'evidence_gap',
    targetDimensionKey: 'confidence',
    threshold: LOW_CONFIDENCE_THRESHOLD,
  },
};

const SUGGESTION_RULES: Record<SuggestionRuleKey, { suggestionType: 'capture_fix' | 'technique_focus' | 'retest_check'; maxCount: number }> = {
  technique_focus: {
    suggestionType: 'technique_focus',
    maxCount: 1,
  },
  capture_fix: {
    suggestionType: 'capture_fix',
    maxCount: 1,
  },
  retest_check: {
    suggestionType: 'retest_check',
    maxCount: 1,
  },
};

function getViewLabel(viewProfile?: ViewProfile) {
  return getSharedViewLabel(viewProfile);
}

function getRacketSideLabel(dominantRacketSide?: DominantRacketSide) {
  return getSharedRacketSideLabel(dominantRacketSide);
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
  return buildSharedRecognitionContext(summary, engine);
}

function buildVisualEvidence(task: AnalysisTaskRecord, poseResult: PoseAnalysisResult): VisualEvidence {
  return buildSharedVisualEvidence(task, poseResult);
}

function getAnalysisDisposition(poseResult: PoseAnalysisResult): AnalysisDisposition {
  return getSharedAnalysisDisposition(poseResult);
}

function getFeatureSummary(
  summary: PoseAnalysisResult['summary'],
  key: string,
): SpecializedSummaryItem | undefined {
  return getSharedFeatureSummary(summary, key) as SpecializedSummaryItem | undefined;
}

function buildFeatureGroupScore(
  _summary: PoseAnalysisResult['summary'],
  features: WeightedFeature[],
  fallbackScore: number,
  fallbackLabel: string,
  scoreFormula: string,
  fallbackFormula: string,
): FeatureGroupScore {
  return buildSharedFeatureGroupScore(features, fallbackScore, fallbackLabel, scoreFormula, fallbackFormula);
}

function getDetectedPhaseScore(candidate?: NonNullable<PoseAnalysisResult['summary']['phaseCandidates']>[ReportPhaseKey]) {
  return getSharedDetectedPhaseScore(candidate);
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
  const contactCandidateScore = getDetectedPhaseScore(summary.phaseCandidates?.contactCandidate);
  const followThroughScore = getDetectedPhaseScore(summary.phaseCandidates?.followThrough);
  const temporalConsistency = summary.temporalConsistency ?? 0;
  const motionContinuity = summary.motionContinuity ?? 0;
  const hasPhaseAwareRepeatabilityEvidence = contactPreparationMedian !== null && contactCandidateScore !== null && followThroughScore !== null;
  const swingRepeatability = hasPhaseAwareRepeatabilityEvidence
    ? clampScore(
      contactPreparationMedian * 30
        + contactCandidateScore * 25
        + followThroughScore * 20
        + motionContinuity * 15
        + temporalConsistency * 10,
    )
    : swingRepeatabilityFallback;

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
    swingRepeatabilityFallbackUsed: !hasPhaseAwareRepeatabilityEvidence,
    swingRepeatabilityInputs: {
      contactPreparationMedian: contactPreparationMedian === null ? null : roundDebugValue(contactPreparationMedian),
      contactPreparationObservableCoverage: roundDebugValue(contactPreparationCoverage),
      contactCandidateScore: contactCandidateScore === null ? null : roundDebugValue(contactCandidateScore),
      followThroughScore: followThroughScore === null ? null : roundDebugValue(followThroughScore),
      usableRatio: roundDebugValue(usableRatio),
      scoreVariance: roundDebugValue(summary.scoreVariance),
      motionContinuity: roundDebugValue(motionContinuity),
      temporalConsistency: roundDebugValue(temporalConsistency),
      scoringMode: hasPhaseAwareRepeatabilityEvidence ? 'phase_aware' : 'fallback',
      fallbackReason: hasPhaseAwareRepeatabilityEvidence
        ? null
        : summary.phaseCandidates?.followThrough?.detectionStatus !== 'detected'
          ? 'missing_follow_through_phase'
          : summary.phaseCandidates?.contactCandidate?.detectionStatus !== 'detected'
            ? 'missing_contact_candidate_phase'
            : 'missing_contact_preparation_feature',
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
        source: computed.swingRepeatabilityFallbackUsed
          ? `usableRatio=${roundDebugValue(usableRatio)}, scoreVariance=${roundDebugValue(summary.scoreVariance)}, contactPreparationMedian=${computed.swingRepeatabilityInputs.contactPreparationMedian ?? 'null'}`
          : `contactPreparationMedian=${computed.swingRepeatabilityInputs.contactPreparationMedian ?? 'null'}, contactCandidateScore=${computed.swingRepeatabilityInputs.contactCandidateScore ?? 'null'}, followThroughScore=${computed.swingRepeatabilityInputs.followThroughScore ?? 'null'}`,
        inputs: computed.swingRepeatabilityInputs,
        formula: computed.swingRepeatabilityFallbackUsed
          ? 'clamp(round(usableRatio * 50 + max(0, 1 - scoreVariance / 0.04) * 50))'
          : 'clamp(round(contactPreparationMedian * 30 + contactCandidateScore * 25 + followThroughScore * 20 + motionContinuity * 15 + temporalConsistency * 10))',
        adjustments: {
          scoreVarianceRole: computed.swingRepeatabilityFallbackUsed ? 'phase_proxy' : 'fallback_only',
          usedFallback: computed.swingRepeatabilityFallbackUsed,
        },
        fallbacks: computed.swingRepeatabilityFallbackUsed ? ['phase_repeatability_fallback'] : [],
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
      ? { key: 'swing_repeatability_fallback', label: '挥拍复现回退', amount: 6, reason: '本次复现稳定性缺少完整阶段证据，仍在使用兼容回退逻辑。' }
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
    notes.push('当前样本复现证据偏散，建议重点回看击球候选和随挥阶段有没有连上。');
  }
  if (computed.bodyPreparationGroup.usedFallback || computed.racketArmPreparationGroup.usedFallback || computed.swingRepeatabilityFallbackUsed) {
    notes.push('本次部分维度仍由兼容特征或阶段回退补足，解释性弱于完整阶段证据。');
  }
  if (computed.swingRepeatabilityFallbackUsed) {
    notes.push('当前挥拍复现稳定性缺少完整的击球候选或随挥阶段证据，系统已回退到基线逻辑。');
  }
  if (confidenceScore < LOW_CONFIDENCE_THRESHOLD) {
    notes.push('当前报告可分析，但建议把证据质量先稳住后再解读动作差异。');
  }
  return [...new Set(notes)];
}

function buildDimensionEvidenceMap(entries: DimensionEvidenceEntry[]) {
  return buildSharedDimensionEvidenceMap(entries);
}

function formatEvidenceScore(score?: number | null) {
  if (score === null || score === undefined) return '证据有限';
  return `${Math.round(score)} 分`;
}

function toDimensionEvidenceRef(entry?: DimensionEvidenceEntry): EvidenceRef | undefined {
  return toSharedDimensionEvidenceRef(entry);
}

function toFeatureEvidenceRef(feature?: FeatureDescriptor): EvidenceRef | undefined {
  return toSharedFeatureEvidenceRef(feature);
}

function compactEvidenceRefs(...refs: Array<EvidenceRef | undefined>) {
  return compactSharedEvidenceRefs(...refs);
}

function getPhaseCandidate(summary: PoseAnalysisResult['summary'], phaseKey: ReportPhaseKey) {
  return getSharedPhaseCandidate(summary, phaseKey);
}

function buildPhaseAssessment(
  phaseKey: ReportPhaseKey,
  status: ReportPhaseAssessmentStatus,
  summaryText: string,
  summary: PoseAnalysisResult['summary'],
  evidenceRefs: EvidenceRef[],
): ReportPhaseAssessment {
  return buildSharedPhaseAssessment(phaseKey, PHASE_LABELS[phaseKey], status, summaryText, summary, evidenceRefs);
}

function buildPhaseBreakdown(
  summary: PoseAnalysisResult['summary'],
  computed: ReturnType<typeof buildDimensionScores>,
  dimensionEvidenceMap: Map<string, DimensionEvidenceEntry>,
): ReportPhaseAssessment[] {
  const bodyEntry = dimensionEvidenceMap.get('body_preparation');
  const armEntry = dimensionEvidenceMap.get('racket_arm_preparation');
  const repeatabilityEntry = dimensionEvidenceMap.get('swing_repeatability');
  const contactPreparation = getFeatureSummary(summary, 'contactPreparationScore');
  const sideOnReadiness = getFeatureSummary(summary, 'sideOnReadinessScore');
  const wristAboveShoulder = getFeatureSummary(summary, 'wristAboveShoulderConfidence');
  const preparationCandidate = getPhaseCandidate(summary, 'preparation');
  const backswingCandidate = getPhaseCandidate(summary, 'backswing');
  const contactCandidate = getPhaseCandidate(summary, 'contactCandidate');
  const followThroughCandidate = getPhaseCandidate(summary, 'followThrough');

  const preparationStatus: ReportPhaseAssessmentStatus = preparationCandidate?.detectionStatus !== 'detected'
    ? 'insufficient_evidence'
    : computed.bodyPreparationGroup.usedFallback
      ? 'insufficient_evidence'
      : computed.dimensionScores.body_preparation < 72
        ? 'attention'
        : 'ok';
  const backswingStatus: ReportPhaseAssessmentStatus = backswingCandidate?.detectionStatus !== 'detected'
    ? 'insufficient_evidence'
    : computed.racketArmPreparationGroup.usedFallback
      ? 'insufficient_evidence'
      : computed.dimensionScores.racket_arm_preparation < 72
        ? 'attention'
        : 'ok';
  const contactCandidateStatus: ReportPhaseAssessmentStatus = contactCandidate?.detectionStatus !== 'detected' || contactPreparation?.median === null
    ? 'insufficient_evidence'
    : (contactPreparation?.median ?? 0) < 0.6 || (contactCandidate.score ?? 0) < 0.6
      ? 'attention'
      : 'ok';
  const followThroughStatus: ReportPhaseAssessmentStatus = followThroughCandidate?.detectionStatus !== 'detected'
    ? 'insufficient_evidence'
    : (summary.motionContinuity ?? 0) < 0.72 || (summary.temporalConsistency ?? 0) < 0.68 || (followThroughCandidate.score ?? 0) < 0.55
      ? 'attention'
      : 'ok';

  return [
    buildPhaseAssessment(
      'preparation',
      preparationStatus,
      preparationStatus === 'insufficient_evidence'
        ? '准备阶段证据不足，当前还不能稳定确认身体准备是不是每次都提前到位。'
        : preparationStatus === 'attention'
          ? '准备阶段是当前最先需要收住的一段，身体准备还不够早。'
          : '准备阶段相对稳定，身体准备已经能比较早地进入动作。 ',
      summary,
      compactEvidenceRefs(
        toDimensionEvidenceRef(bodyEntry),
        toFeatureEvidenceRef({
          key: 'sideOnReadinessScore',
          label: FEATURE_LABELS.sideOnReadinessScore,
          value: sideOnReadiness?.median ?? null,
          observableCoverage: sideOnReadiness?.observableCoverage,
        }),
      ),
    ),
    buildPhaseAssessment(
      'backswing',
      backswingStatus,
      backswingStatus === 'insufficient_evidence'
        ? '引拍阶段证据不足，挥拍臂准备还需要更完整的阶段窗口才能稳定判断。'
        : backswingStatus === 'attention'
          ? '引拍阶段还没完全撑开，挥拍肘和手臂准备仍然偏低。'
          : '引拍阶段已经比较成型，挥拍臂准备能较稳定地挂住。',
      summary,
      compactEvidenceRefs(
        toDimensionEvidenceRef(armEntry),
        toFeatureEvidenceRef({
          key: 'wristAboveShoulderConfidence',
          label: FEATURE_LABELS.wristAboveShoulderConfidence,
          value: wristAboveShoulder?.median ?? null,
          observableCoverage: wristAboveShoulder?.observableCoverage,
        }),
      ),
    ),
    buildPhaseAssessment(
      'contactCandidate',
      contactCandidateStatus,
      contactCandidateStatus === 'insufficient_evidence'
        ? '击球候选阶段证据不足，当前还缺少稳定的击球前准备窗口。'
        : contactCandidateStatus === 'attention'
          ? '击球候选阶段没有完全接顺，击球前准备还不够完整。'
          : '击球候选阶段比较清楚，击球前准备和节奏衔接相对稳定。',
      summary,
      compactEvidenceRefs(
        toDimensionEvidenceRef(repeatabilityEntry),
        toFeatureEvidenceRef({
          key: 'contactPreparationScore',
          label: FEATURE_LABELS.contactPreparationScore,
          value: contactPreparation?.median ?? null,
          observableCoverage: contactPreparation?.observableCoverage,
        }),
      ),
    ),
    buildPhaseAssessment(
      'followThrough',
      followThroughStatus,
      followThroughStatus === 'insufficient_evidence'
        ? '随挥阶段证据不足，这次视频里出手后的连续动作没有被稳定捕捉到。'
        : followThroughStatus === 'attention'
          ? '随挥阶段还没完全连上，出手后的连续性和复现稳定性还在波动。'
          : '随挥阶段已经能比较稳定地接住，动作在出手后没有明显断掉。',
      summary,
      compactEvidenceRefs(toDimensionEvidenceRef(repeatabilityEntry)),
    ),
  ].map((entry) => ({
    ...entry,
    summary: entry.summary.trim(),
  }));
}

function getPhaseAssessment(
  phaseBreakdown: ReportPhaseAssessment[],
  phaseKey: ReportPhaseKey,
) {
  return phaseBreakdown.find((item) => item.phaseKey === phaseKey);
}

function getRepeatabilityFocusPhase(phaseBreakdown: ReportPhaseAssessment[]) {
  const repeatabilityPhases = phaseBreakdown.filter((item) => item.phaseKey === 'contactCandidate' || item.phaseKey === 'followThrough');
  return [...repeatabilityPhases].sort((left, right) => {
    const weightDelta = PHASE_STATUS_WEIGHTS[right.status] - PHASE_STATUS_WEIGHTS[left.status];
    if (weightDelta !== 0) return weightDelta;
    return left.phaseKey === 'contactCandidate' ? -1 : 1;
  })[0];
}

function buildEvidenceSentence(evidenceRefs: EvidenceRef[]) {
  return buildSharedEvidenceSentence(evidenceRefs, formatEvidenceScore);
}

function getWeakestFeature(features: FeatureDescriptor[]) {
  return getSharedWeakestFeature(features);
}

function shouldSuggestCaptureAdvice(
  confidenceScore: number,
  cameraSuitability: number,
  dimensionConfidence?: number | null,
) {
  return shouldSharedSuggestCaptureAdvice(confidenceScore, cameraSuitability, dimensionConfidence, LOW_CONFIDENCE_THRESHOLD);
}

function getCaptureAdvice(recognitionContext: RecognitionContext, emphasis: 'body' | 'arm' | 'repeatability' | 'evidence') {
  const genericTail = '固定手机、让人物完整入镜，并尽量把准备到出手这一段连续录进去。';

  if (FRONT_VIEW_PROFILES.has(recognitionContext.viewProfile ?? 'unknown') || recognitionContext.viewProfile === 'unknown') {
    const focus = emphasis === 'body'
      ? '这样肩髋转开和身体准备会更完整'
      : emphasis === 'arm'
        ? '这样抬肘和抬手位置会更清楚'
        : emphasis === 'repeatability'
          ? '这样更容易看清准备节奏是不是连续'
          : '这样动作细节的判断会更稳';
    return `下次拍摄尽量改成后方或后斜视角，${focus}；${genericTail}`;
  }

  const focus = emphasis === 'body'
    ? '优先让肩髋和侧身准备都留在画面里'
    : emphasis === 'arm'
      ? '优先让挥拍肘、前臂和肩线都完整入镜'
      : emphasis === 'repeatability'
        ? '优先让同一拍的准备到出手连续可见'
        : '优先保持同一机位不变';
  return `下次继续保持${recognitionContext.viewLabel}视角，${focus}，${genericTail}`;
}

function buildSuggestionDraft(
  ruleKey: SuggestionRuleKey,
  suggestion: Omit<SuggestionDraft, 'ruleKey' | 'suggestionType'>,
): SuggestionDraft {
  return buildSharedSuggestionDraft(ruleKey, SUGGESTION_RULES[ruleKey].suggestionType, suggestion) as SuggestionDraft;
}

function buildBodyPreparationIssue(context: IssueBuildContext): RankedIssue | null {
  const definition = ISSUE_DEFINITIONS.body_preparation_gap;
  const score = context.publicScores.body_preparation;
  if (score >= definition.threshold) return null;

  const dimensionEntry = context.dimensionEvidenceMap.get('body_preparation');
  const weakestFeature = getWeakestFeature([
    {
      key: 'sideOnReadinessScore',
      label: FEATURE_LABELS.sideOnReadinessScore,
      value: getFeatureSummary(context.summary, 'sideOnReadinessScore')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'sideOnReadinessScore')?.observableCoverage,
    },
    {
      key: 'shoulderHipRotationScore',
      label: FEATURE_LABELS.shoulderHipRotationScore,
      value: getFeatureSummary(context.summary, 'shoulderHipRotationScore')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'shoulderHipRotationScore')?.observableCoverage,
    },
    {
      key: 'trunkCoilScore',
      label: FEATURE_LABELS.trunkCoilScore,
      value: getFeatureSummary(context.summary, 'trunkCoilScore')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'trunkCoilScore')?.observableCoverage,
    },
  ]);
  const weakEvidence = context.computed.bodyPreparationGroup.usedFallback || (dimensionEntry?.confidence ?? 1) < 0.68;
  const title = weakestFeature?.key === 'sideOnReadinessScore' ? '身体准备不足' : '转体不足';
  const phaseLabel = PHASE_LABELS.preparation;
  const observation = weakEvidence
    ? `${phaseLabel}阶段能看出身体准备还不够早，但专项证据不算完整，这条先按弱判断处理。`
    : weakestFeature?.key === 'sideOnReadinessScore'
      ? `${phaseLabel}阶段里，侧身进入偏晚，身体还没完全转到给击球让出空间的位置。`
      : weakestFeature?.key === 'shoulderHipRotationScore'
        ? `${phaseLabel}阶段里，肩髋转开的幅度还不够，身体准备没有把后面的击球空间完全带出来。`
        : `${phaseLabel}阶段里，身体有准备动作，但躯干蓄力没有持续挂住，转体和出手之间还略显分离。`;
  const whyItMatters = weakestFeature?.key === 'sideOnReadinessScore'
    ? '身体准备偏晚时，后面的抬肘和出手更容易变成临时补动作，击球点会更靠后。'
    : '转体没有先带起来时，挥拍空间和击球蓄力都会被压缩，球更难稳定顶出去。';
  const nextTrainingFocus = weakestFeature?.key === 'sideOnReadinessScore'
    ? '下一次训练先盯启动后的前半拍就把身体先转进去，再接手臂，不要等到快出手才补身体。'
    : '下一次训练先盯肩髋一起转开，把身体先带起来，再接挥拍臂，不要一上来就追求手上速度。';
  const captureAdvice = shouldSuggestCaptureAdvice(context.confidenceScore, context.scores.camera_suitability, dimensionEntry?.confidence)
    ? getCaptureAdvice(context.recognitionContext, 'body')
    : undefined;
  const evidenceRefs = compactEvidenceRefs(
    toDimensionEvidenceRef(dimensionEntry),
    toFeatureEvidenceRef(weakestFeature),
  );
  const evidenceSentence = buildEvidenceSentence(evidenceRefs);

  return {
    key: 'body_preparation',
    severity: definition.threshold - score,
    rankingBucket: 4,
    phaseKey: 'preparation',
    phaseLabel,
    title,
    description: `${observation}${evidenceSentence ? ` ${evidenceSentence}` : ''}`.trim(),
    impact: whyItMatters,
    issueType: definition.issueType,
    issueCategory: definition.targetDimensionKey === 'body_preparation' ? 'body_preparation_gap' : 'body_preparation_gap',
    targetDimensionKey: definition.targetDimensionKey,
    confidenceImpact: weakEvidence ? 'medium' : 'low',
    observation,
    whyItMatters,
    nextTrainingFocus,
    captureAdvice,
    evidenceRefs,
    leadSuggestion: buildSuggestionDraft('technique_focus', {
      title: '下一次先把身体准备做早',
      description: nextTrainingFocus,
      targetDimensionKey: 'body_preparation',
      focusPoint: weakestFeature?.label ?? '身体准备',
      linkedIssueCategory: 'body_preparation_gap',
      evidenceRefs,
    }),
    captureSuggestion: captureAdvice
      ? buildSuggestionDraft('capture_fix', {
        title: '下次拍摄先把身体准备拍清楚',
        description: captureAdvice,
        targetDimensionKey: 'body_preparation',
        recommendedNextCapture: captureAdvice,
        linkedIssueCategory: 'body_preparation_gap',
        evidenceRefs,
      })
      : undefined,
  };
}

function buildRacketArmPreparationIssue(context: IssueBuildContext): RankedIssue | null {
  const definition = ISSUE_DEFINITIONS.racket_arm_preparation_gap;
  const score = context.publicScores.racket_arm_preparation;
  if (score >= definition.threshold) return null;

  const dimensionEntry = context.dimensionEvidenceMap.get('racket_arm_preparation');
  const weakestFeature = getWeakestFeature([
    {
      key: 'racketSideElbowHeightScore',
      label: FEATURE_LABELS.racketSideElbowHeightScore,
      value: getFeatureSummary(context.summary, 'racketSideElbowHeightScore')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'racketSideElbowHeightScore')?.observableCoverage,
    },
    {
      key: 'wristAboveShoulderConfidence',
      label: FEATURE_LABELS.wristAboveShoulderConfidence,
      value: getFeatureSummary(context.summary, 'wristAboveShoulderConfidence')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'wristAboveShoulderConfidence')?.observableCoverage,
    },
    {
      key: 'elbowExtensionScore',
      label: FEATURE_LABELS.elbowExtensionScore,
      value: getFeatureSummary(context.summary, 'elbowExtensionScore')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'elbowExtensionScore')?.observableCoverage,
    },
  ]);
  const weakEvidence = context.computed.racketArmPreparationGroup.usedFallback || (dimensionEntry?.confidence ?? 1) < 0.68;
  const phaseLabel = PHASE_LABELS.backswing;
  const focusPoint = weakestFeature?.key === 'wristAboveShoulderConfidence' ? '抬手位置不足' : '肘部位置不足';
  const observation = weakEvidence
    ? `${phaseLabel}阶段能看出挥拍臂准备还不够充分，但专项证据不算完整，这条先按弱判断处理。`
    : weakestFeature?.key === 'wristAboveShoulderConfidence'
      ? `${phaseLabel}阶段里，挥拍臂已经开始上举了，但手和前臂抬得还不够早，准备点还偏低。`
      : weakestFeature?.key === 'elbowExtensionScore'
        ? `${phaseLabel}阶段里，挥拍臂有准备动作，但肘部和前臂没有提前展开，整条手臂的引拍空间还没撑开。`
        : `${phaseLabel}阶段里，挥拍臂已经往上走了，但肘部没有先撑起来，准备位置还是偏低。`;
  const whyItMatters = '挥拍臂准备不到位时，击球前的引拍空间会变小，后面更容易只靠最后一下补手臂。';
  const nextTrainingFocus = weakestFeature?.key === 'wristAboveShoulderConfidence'
    ? '下一次训练先盯手和前臂更早抬到准备位，让抬手动作先到位，再去追求出手速度。'
    : '下一次训练先盯肘部先撑起来，再让前臂顺着展开，不要把整条手臂拖到临出手才补。';
  const captureAdvice = shouldSuggestCaptureAdvice(context.confidenceScore, context.scores.camera_suitability, dimensionEntry?.confidence)
    ? getCaptureAdvice(context.recognitionContext, 'arm')
    : undefined;
  const evidenceRefs = compactEvidenceRefs(
    toDimensionEvidenceRef(dimensionEntry),
    toFeatureEvidenceRef(weakestFeature),
    toFeatureEvidenceRef({
      key: 'hittingArmPreparationScore',
      label: FEATURE_LABELS.hittingArmPreparationScore,
      value: getFeatureSummary(context.summary, 'hittingArmPreparationScore')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'hittingArmPreparationScore')?.observableCoverage,
    }),
  );
  const evidenceSentence = buildEvidenceSentence(evidenceRefs);

  return {
    key: 'racket_arm_preparation',
    severity: definition.threshold - score,
    rankingBucket: 3,
    phaseKey: 'backswing',
    phaseLabel,
    title: '挥拍臂准备不足',
    description: `${observation}${evidenceSentence ? ` ${evidenceSentence}` : ''}`.trim(),
    impact: whyItMatters,
    issueType: definition.issueType,
    issueCategory: 'racket_arm_preparation_gap',
    targetDimensionKey: definition.targetDimensionKey,
    confidenceImpact: weakEvidence ? 'medium' : 'low',
    observation,
    whyItMatters,
    nextTrainingFocus,
    captureAdvice,
    evidenceRefs,
    leadSuggestion: buildSuggestionDraft('technique_focus', {
      title: `下一次先把${focusPoint.replace('不足', '')}收住`,
      description: nextTrainingFocus,
      targetDimensionKey: 'racket_arm_preparation',
      focusPoint,
      linkedIssueCategory: 'arm_lift_focus_gap',
      evidenceRefs,
    }),
    captureSuggestion: captureAdvice
      ? buildSuggestionDraft('capture_fix', {
        title: '下次拍摄先把挥拍臂准备拍清楚',
        description: captureAdvice,
        targetDimensionKey: 'racket_arm_preparation',
        recommendedNextCapture: captureAdvice,
        linkedIssueCategory: 'racket_arm_preparation_gap',
        evidenceRefs,
      })
      : undefined,
  };
}

function buildRepeatabilityIssue(context: IssueBuildContext): RankedIssue | null {
  const definition = ISSUE_DEFINITIONS.repeatability_gap;
  const score = context.publicScores.swing_repeatability;
  if (score >= definition.threshold) return null;

  const dimensionEntry = context.dimensionEvidenceMap.get('swing_repeatability');
  const contactPreparation = getFeatureSummary(context.summary, 'contactPreparationScore');
  const focusPhase = getRepeatabilityFocusPhase(context.phaseBreakdown);
  const phaseLabel = focusPhase?.label ?? PHASE_LABELS.contactCandidate;
  const weakEvidence = context.computed.swingRepeatabilityFallbackUsed || (dimensionEntry?.confidence ?? 1) < 0.72;
  const observation = weakEvidence
    ? `${phaseLabel}阶段证据还不完整，这次更多是“复现偏散”的提醒，说明准备到出手没有稳定连上。`
    : `${phaseLabel}阶段当前最需要回看，准备到出手的节奏没有稳定连起来，好的那一下能看到，但没有连续留住。`;
  const whyItMatters = '复现差时，单次看起来做到了的细节不一定能稳定带到每一次击球，训练效果也更难沉下来。';
  const nextTrainingFocus = `下一次训练先把${phaseLabel}阶段接顺，把准备、抬肘、出手做成同一套节奏，不要一边追求发力一边又同时改很多动作点。`;
  const captureAdvice = shouldSuggestCaptureAdvice(context.confidenceScore, context.scores.camera_suitability, dimensionEntry?.confidence)
    ? getCaptureAdvice(context.recognitionContext, 'repeatability')
    : undefined;
  const evidenceRefs = compactEvidenceRefs(
    toDimensionEvidenceRef(dimensionEntry),
    toFeatureEvidenceRef({
      key: 'contactPreparationScore',
      label: FEATURE_LABELS.contactPreparationScore,
      value: contactPreparation?.median ?? null,
      observableCoverage: contactPreparation?.observableCoverage,
      reference: `scoreVariance=${roundDebugValue(context.summary.scoreVariance)}`,
    }),
  );
  const evidenceSentence = buildEvidenceSentence(evidenceRefs);

  return {
    key: 'swing_repeatability',
    severity: definition.threshold - score,
    rankingBucket: 2,
    phaseKey: focusPhase?.phaseKey ?? 'contactCandidate',
    phaseLabel,
    title: '动作不连贯，复现差',
    description: `${observation}${evidenceSentence ? ` ${evidenceSentence}` : ''}`.trim(),
    impact: whyItMatters,
    issueType: definition.issueType,
    issueCategory: 'repeatability_gap',
    targetDimensionKey: definition.targetDimensionKey,
    confidenceImpact: weakEvidence ? 'medium' : 'low',
    observation,
    whyItMatters,
    nextTrainingFocus,
    captureAdvice,
    evidenceRefs,
    leadSuggestion: buildSuggestionDraft('technique_focus', {
      title: `下一次先把${phaseLabel}阶段做顺`,
      description: nextTrainingFocus,
      targetDimensionKey: 'swing_repeatability',
      focusPoint: `${phaseLabel}阶段的连续节奏`,
      linkedIssueCategory: 'repeatability_gap',
      evidenceRefs,
    }),
    captureSuggestion: captureAdvice
      ? buildSuggestionDraft('capture_fix', {
        title: '下次拍摄先保证连续动作都拍进去',
        description: captureAdvice,
        targetDimensionKey: 'swing_repeatability',
        recommendedNextCapture: captureAdvice,
        linkedIssueCategory: 'repeatability_gap',
        evidenceRefs,
      })
      : undefined,
  };
}

function buildEvidenceQualityIssue(context: IssueBuildContext): RankedIssue | null {
  const score = context.publicScores.evidence_quality;
  const cameraSuitability = context.scores.camera_suitability;
  if (context.confidenceScore >= LOW_CONFIDENCE_THRESHOLD && score >= 70 && cameraSuitability >= 60) return null;

  const evidenceEntry = context.dimensionEvidenceMap.get('evidence_quality');
  const cameraEntry = context.dimensionEvidenceMap.get('camera_suitability');
  const lowViewConfidence = (context.summary.viewConfidence ?? 0) < 0.62;
  const observation = cameraSuitability < 60
    ? `这次视频更像是机位先限制了判断，当前${context.recognitionContext.viewLabel}视角下身体和挥拍臂的细节不够完整，只能保守解读。`
    : lowViewConfidence
      ? `这次视频能看出动作大方向，但视角判断还不够稳，细节结论需要留一点余量。`
      : `这次视频里稳定帧和专项特征覆盖还不够整，动作细节可以参考，但不适合放大读。`;
  const whyItMatters = '证据质量有限时，动作分更适合看趋势，不适合把细小分差直接当成真实进步或退步。';
  const nextTrainingFocus = '下一次训练先只盯 1 个动作点，在更稳定的拍摄下确认它是不是真的在变好，再决定要不要继续扩展。';
  const captureAdvice = getCaptureAdvice(context.recognitionContext, 'evidence');
  const evidenceRefs = compactEvidenceRefs(
    toDimensionEvidenceRef(evidenceEntry),
    toDimensionEvidenceRef(cameraEntry),
  );
  const evidenceSentence = buildEvidenceSentence(evidenceRefs);
  const severity = Math.max(LOW_CONFIDENCE_THRESHOLD - context.confidenceScore, 70 - score, 65 - cameraSuitability);

  return {
    key: 'confidence',
    severity,
    rankingBucket: 1,
    title: '证据质量有限，当前判断要保守',
    description: `${observation}${evidenceSentence ? ` ${evidenceSentence}` : ''}`.trim(),
    impact: whyItMatters,
    issueType: ISSUE_DEFINITIONS.evidence_quality_gap.issueType,
    issueCategory: 'evidence_quality_gap',
    targetDimensionKey: 'evidence_quality',
    confidenceImpact: severity >= 10 ? 'high' : severity >= 5 ? 'medium' : 'low',
    observation,
    whyItMatters,
    nextTrainingFocus,
    captureAdvice,
    evidenceRefs,
    captureSuggestion: buildSuggestionDraft('capture_fix', {
      title: '下次先把机位和样本稳定性收住',
      description: captureAdvice,
      targetDimensionKey: 'evidence_quality',
      recommendedNextCapture: captureAdvice,
      focusPoint: '机位稳定和主体完整入镜',
      linkedIssueCategory: 'evidence_quality_gap',
      evidenceRefs,
    }),
  };
}

function buildRankedIssues(context: IssueBuildContext): RankedIssue[] {
  const issues = [
    buildBodyPreparationIssue(context),
    buildRacketArmPreparationIssue(context),
    buildRepeatabilityIssue(context),
    buildEvidenceQualityIssue(context),
  ].filter((issue): issue is RankedIssue => Boolean(issue));

  const prioritizeEvidence = context.confidenceScore < 65 || context.scores.camera_suitability < 60;

  return issues.sort((left, right) => {
    const leftBucket = prioritizeEvidence && left.issueCategory === 'evidence_quality_gap' ? 5 : left.rankingBucket;
    const rightBucket = prioritizeEvidence && right.issueCategory === 'evidence_quality_gap' ? 5 : right.rankingBucket;
    if (leftBucket !== rightBucket) return rightBucket - leftBucket;
    if (left.severity !== right.severity) return right.severity - left.severity;
    return left.title.localeCompare(right.title, 'zh-Hans-CN');
  });
}

function buildSuggestions(recognitionContext: RecognitionContext, rankedIssues: RankedIssue[]): SuggestionItem[] {
  if (rankedIssues.length === 0) {
    return [{
      title: '下次继续验证动作能否稳定复现',
      description: `保持同一机位再录一条高远球视频，优先确认这次在${recognitionContext.viewLabel}视角下看到的较稳动作不是偶尔出现。`,
      suggestionType: 'retest_check',
      targetDimensionKey: 'swing_repeatability',
      focusPoint: '动作稳定复现',
      linkedIssueCategory: 'repeatability_gap',
    }];
  }

  const suggestions: SuggestionDraft[] = [];
  const primaryActionIssue = rankedIssues.find((issue) => issue.issueType === 'action_gap' && issue.leadSuggestion);
  if (primaryActionIssue?.leadSuggestion) {
    suggestions.push(primaryActionIssue.leadSuggestion);
  }

  const captureIssue = rankedIssues.find((issue) => issue.captureSuggestion);
  if (captureIssue?.captureSuggestion) {
    suggestions.push(captureIssue.captureSuggestion);
  }

  const actionFocusIssues = rankedIssues.filter((issue) => issue.issueType === 'action_gap').slice(0, 2);
  const focusLabels = actionFocusIssues.map((issue) => issue.title);
  suggestions.push(buildSuggestionDraft('retest_check', {
    title: actionFocusIssues.length > 0 ? '下次复测先只盯 1~2 个动作点' : '下次复测先看证据有没有稳住',
    description: actionFocusIssues.length > 0
      ? `下次复测先盯 ${focusLabels.join('、')}，先确认这 1~2 个动作点有没有一起变稳，再决定要不要继续加别的调整。`
      : `下次复测先确认${recognitionContext.viewLabel}视角下的机位和主体完整度有没有稳住，再放大读动作细节。`,
    targetDimensionKey: actionFocusIssues[0]?.targetDimensionKey ?? 'evidence_quality',
    focusPoint: actionFocusIssues.length > 0 ? focusLabels.join('、') : '证据质量',
    linkedIssueCategory: actionFocusIssues[0]?.issueCategory ?? 'evidence_quality_gap',
    evidenceRefs: actionFocusIssues[0]?.evidenceRefs,
  }));

  const limitedSuggestions: SuggestionDraft[] = [];
  for (const ruleKey of Object.keys(SUGGESTION_RULES) as SuggestionRuleKey[]) {
    const allowedCount = SUGGESTION_RULES[ruleKey].maxCount;
    limitedSuggestions.push(...suggestions.filter((item) => item.ruleKey === ruleKey).slice(0, allowedCount));
  }

  return limitedSuggestions
    .slice(0, 3)
    .map(({ ruleKey: _ruleKey, ...item }) => ({
      ...item,
      description: `${item.description} 当前识别为${recognitionContext.viewLabel}视角。`,
    }));
}

function buildSummaryText(
  rankedIssues: RankedIssue[],
  confidenceScore: number,
  summary: PoseAnalysisResult['summary'],
  frameCount: number,
) {
  const evidenceLead = `本次基于 ${summary.usableFrameCount}/${frameCount} 帧稳定识别结果生成。`;
  const recognitionLead = `当前识别为${getViewLabel(summary.viewProfile)}，${getRacketSideLabel(summary.dominantRacketSide)}。`;
  const topIssue = rankedIssues[0];

  if (!topIssue) {
    return `${evidenceLead} ${recognitionLead} 当前这条高远球的可观测动作框架比较完整，下一步更适合继续验证能否稳定复现。`;
  }

  if (topIssue.issueCategory === 'evidence_quality_gap' || confidenceScore < LOW_CONFIDENCE_THRESHOLD) {
    return `${evidenceLead} ${recognitionLead} 当前报告能看出动作大方向，但这次更该先把机位和样本稳定性收住，再放大解读动作细节。`;
  }

  return `${evidenceLead} ${recognitionLead} 当前最值得先改的是${topIssue.phaseLabel ?? '当前关键'}阶段的${topIssue.title}，这也是这次证据最直接指向的动作短板。`;
}

function buildStandardComparison(rankedIssues: RankedIssue[], summary: PoseAnalysisResult['summary']): StandardComparison {
  const viewLabel = getViewLabel(summary.viewProfile);
  const topIssues = rankedIssues.slice(0, 3);
  const differences = topIssues.length > 0
    ? topIssues.map((issue) => {
      switch (issue.issueCategory) {
        case 'body_preparation_gap':
          return `基于当前${viewLabel}视角，身体准备还不够早，转体和蓄力空间偏小。`;
        case 'racket_arm_preparation_gap':
          return `基于当前${viewLabel}视角，挥拍臂准备还没完全撑开，重点先回看${issue.nextTrainingFocus ?? '抬肘和抬手位置'}。`;
        case 'repeatability_gap':
          return `基于当前${viewLabel}视角，这条样本在多帧里的准备到出手节奏还不够一致。`;
        case 'evidence_quality_gap':
          return `这次更明显的问题在证据质量，当前${viewLabel}视角下的机位或样本稳定性限制了判断置信度。`;
        default:
          return issue.observation ?? issue.description;
      }
    })
    : [`基于当前${viewLabel}视角，当前样本和参考动作之间的关键准备维度已经比较接近。`];

  return {
    sectionTitle: '当前视角动作参考对照',
    summaryText: topIssues.length > 0
      ? `当前识别为${viewLabel}视角，这次最明确的差异集中在${topIssues.map((item) => item.title).join('、')}。`
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

function buildCompareSummary(recognitionContext: RecognitionContext, confidenceScore: number, rankedIssues: RankedIssue[]) {
  const leadPhase = rankedIssues[0]?.phaseLabel;
  const issueLead = rankedIssues[0]?.issueCategory === 'evidence_quality_gap'
    ? '这次报告会把证据质量单独提出，避免把机位限制直接当成动作错误。'
    : `这次报告会把动作问题和证据问题分开写，并明确指出${leadPhase ?? '当前'}阶段是不是主要薄弱点。`;
  const confidenceClause = confidenceScore < LOW_CONFIDENCE_THRESHOLD
    ? '当前这条样本更适合做方向判断。'
    : '当前这条样本已经可以更明确地定位动作短板。';
  return `当前报告围绕${recognitionContext.viewLabel}视角下的身体准备、挥拍臂准备、挥拍复现稳定性和证据质量生成。${issueLead}${confidenceClause}`;
}

function buildRetestAdvice(recognitionContext: RecognitionContext, confidenceScore: number, rankedIssues: RankedIssue[]) {
  if (confidenceScore < LOW_CONFIDENCE_THRESHOLD) {
    const actionTitle = rankedIssues.find((issue) => issue.issueType === 'action_gap')?.title;
    const actionPhase = rankedIssues.find((issue) => issue.issueType === 'action_gap')?.phaseLabel;
    return actionTitle
      ? `建议 3~7 天后保持同一机位复测，下次先把${recognitionContext.viewLabel}视角下的机位稳定性收住，再确认${actionPhase ?? '当前关键'}阶段的${actionTitle}是不是真的在改善。`
      : `建议 3~7 天后保持同一机位复测，下次先把${recognitionContext.viewLabel}视角下的机位稳定性和主体完整度收住，再看动作分差。`;
  }

  const topActionIssues = rankedIssues.filter((issue) => issue.issueType === 'action_gap').slice(0, 2);
  if (topActionIssues.length === 0) {
    return `建议 3~7 天后保持同一机位复测，继续确认${recognitionContext.viewLabel}视角下这套动作能否稳定复现。`;
  }

  return `建议 3~7 天后保持同一机位复测，下次优先看${topActionIssues.map((issue) => `${issue.phaseLabel ?? '当前'}阶段的${issue.title}`).join('、')}这 1~2 个动作点有没有一起变稳。`;
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
  const recognitionContext = buildRecognitionContext(poseResult.summary, poseResult.engine);
  const visualEvidence = buildVisualEvidence(task, poseResult);
  const dimensionEvidence = (Object.keys(DIMENSION_LABELS) as DimensionKey[]).map((key) => (
    buildDimensionEvidence(key, scores, poseResult.summary, poseResult.frameCount, computed)
  ));
  const dimensionEvidenceMap = buildDimensionEvidenceMap(dimensionEvidence);
  const phaseBreakdown = buildPhaseBreakdown(poseResult.summary, computed, dimensionEvidenceMap);
  const rankedIssues = buildRankedIssues({
    recognitionContext,
    summary: poseResult.summary,
    scores,
    publicScores,
    confidenceScore,
    evidenceNotes,
    computed,
    dimensionEvidenceMap,
    phaseBreakdown,
  });
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

  const issues: ReportResult['issues'] = rankedIssues.length > 0
    ? rankedIssues.slice(0, 3).map(({ severity: _severity, rankingBucket: _rankingBucket, leadSuggestion: _leadSuggestion, captureSuggestion: _captureSuggestion, ...issue }) => issue)
    : [{
      title: '当前动作框架和证据质量都比较稳定',
      description: `当前识别为${recognitionContext.viewLabel}视角，系统能稳定看到身体准备、挥拍臂准备和挥拍复现都没有明显短板。`,
      impact: '接下来更值得继续验证的是，能不能在同机位下把这套动作持续复现出来。',
      issueType: 'action_gap' as const,
      issueCategory: 'repeatability_gap',
      targetDimensionKey: 'swing_repeatability',
      confidenceImpact: 'low' as const,
      observation: `当前识别为${recognitionContext.viewLabel}视角，系统能稳定看到身体准备、挥拍臂准备和挥拍复现都没有明显短板。`,
      whyItMatters: '接下来更值得继续验证的是，能不能在同机位下把这套动作持续复现出来。',
      nextTrainingFocus: '下一次训练先不要额外加新改动，继续用同一节奏把当前动作框架稳定复现出来。',
    }];

  const suggestions = buildSuggestions(recognitionContext, rankedIssues);

  const fallbacksUsed = [
    ...computed.bodyPreparationGroup.fallbacks,
    ...computed.racketArmPreparationGroup.fallbacks,
    ...(computed.swingRepeatabilityFallbackUsed ? ['phase_repeatability_fallback'] : []),
  ].filter((item): item is string => Boolean(item));

  return {
    taskId: task.taskId,
    actionType: task.actionType,
    totalScore: totalScoreBreakdown.finalTotalScore,
    confidenceScore,
    summaryText: buildSummaryText(rankedIssues, confidenceScore, poseResult.summary, poseResult.frameCount),
    dimensionScores,
    issues,
    suggestions,
    compareSummary: buildCompareSummary(recognitionContext, confidenceScore, rankedIssues),
    retestAdvice: buildRetestAdvice(recognitionContext, confidenceScore, rankedIssues),
    evidenceNotes,
    createdAt: now(),
    poseBased: true,
    swingSegments: task.artifacts.preprocess?.artifacts?.swingSegments,
    recommendedSegmentId: task.artifacts.preprocess?.artifacts?.recommendedSegmentId,
    segmentDetectionVersion: task.artifacts.preprocess?.artifacts?.segmentDetectionVersion,
    segmentSelectionMode: task.artifacts.preprocess?.artifacts?.segmentSelectionMode,
    selectedSegmentId: task.artifacts.preprocess?.artifacts?.selectedSegmentId,
    selectedSegmentWindow: task.artifacts.preprocess?.artifacts?.selectedSegmentWindow,
    recognitionContext,
    phaseBreakdown,
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
      temporalConsistency: poseResult.summary.temporalConsistency,
      motionContinuity: poseResult.summary.motionContinuity,
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
