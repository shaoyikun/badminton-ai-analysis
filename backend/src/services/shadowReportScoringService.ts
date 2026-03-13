import type {
  ActionType,
  AnalysisTaskRecord,
  DominantRacketSide,
  FlowErrorCode,
  PoseAnalysisResult,
  RecognitionContext,
  ReportPhaseAssessment,
  ReportPhaseAssessmentStatus,
  ReportPhaseKey,
  ReportResult,
  StandardComparison,
  SuggestionItem,
  ViewProfile,
  VisualEvidence,
} from '../types/task';
import { buildRuleBasedResult } from './reportScoringService';

export type ShadowActionType = ActionType | 'smash';

export type ShadowReportResult = Omit<ReportResult, 'actionType'> & {
  actionType: ShadowActionType;
};

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
type EvidenceRef = NonNullable<ReportResult['issues'][number]['evidenceRefs']>[number];

type FeatureGroupScore = {
  score: number;
  observableCoverage: number;
  source: string;
  formula: string;
  inputs: StructuredEvidenceRecord;
  fallbacks: string[];
  usedFallback: boolean;
};

type AnalysisDisposition = {
  hardRejectReasons: FlowErrorCode[];
  lowConfidenceReasons: FlowErrorCode[];
  confidencePenaltyNotes: string[];
};

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
  ruleKey: 'technique_focus' | 'capture_fix' | 'retest_check';
};

type FeatureDescriptor = {
  key: string;
  label: string;
  value: number | null;
  observableCoverage?: number;
  reference?: string;
};

type SmashComputedScores = {
  dimensionScores: DimensionScores;
  coreObservableCoverage: number;
  bodyPreparationGroup: FeatureGroupScore;
  racketArmPreparationGroup: FeatureGroupScore;
  swingRepeatabilityFallbackUsed: boolean;
  swingRepeatabilityInputs: StructuredEvidenceRecord;
  cameraInputs: StructuredEvidenceRecord;
};

type SmashIssueContext = {
  recognitionContext: RecognitionContext;
  summary: PoseAnalysisResult['summary'];
  scores: DimensionScores;
  publicScores: Record<PublicDimensionKey, number>;
  confidenceScore: number;
  computed: SmashComputedScores;
  dimensionEvidenceMap: Map<string, DimensionEvidenceEntry>;
  phaseBreakdown: ReportPhaseAssessment[];
};

type ActionProfile = {
  actionType: ShadowActionType;
  scoringModelVersion: string;
  actionLabel: string;
  dimensionLabels: Record<DimensionKey, string>;
  phaseLabels: Record<ReportPhaseKey, string>;
  totalScoreWeights: Record<Exclude<DimensionKey, 'evidence_quality' | 'camera_suitability'>, number>;
  bodyThreshold: number;
  armThreshold: number;
  repeatThreshold: number;
};

const LOW_CONFIDENCE_THRESHOLD = 70;

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

const FRONT_VIEW_PROFILES = new Set<ViewProfile>(['front', 'front_left_oblique', 'front_right_oblique']);

const HARD_REJECT_REASONS = new Set<FlowErrorCode>([
  'body_not_detected',
  'subject_too_small_or_cropped',
  'poor_lighting_or_occlusion',
]);

const MIN_SOFT_COVERAGE_FRAME_COUNT = 5;
const MIN_SOFT_COVERAGE_RATIO = 0.5;
const MIN_SOFT_COVERAGE_STABILITY = 0.6;

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

const CLEAR_PROFILE: ActionProfile = {
  actionType: 'clear',
  scoringModelVersion: 'rule-v3-phase-aware',
  actionLabel: '高远球',
  dimensionLabels: {
    evidence_quality: '证据质量',
    body_preparation: '身体准备',
    racket_arm_preparation: '挥拍臂准备',
    swing_repeatability: '挥拍复现稳定性',
    camera_suitability: '相机适配度',
  },
  phaseLabels: {
    preparation: '准备',
    backswing: '引拍',
    contactCandidate: '击球候选',
    followThrough: '随挥',
  },
  totalScoreWeights: {
    body_preparation: 0.38,
    racket_arm_preparation: 0.37,
    swing_repeatability: 0.25,
  },
  bodyThreshold: 72,
  armThreshold: 72,
  repeatThreshold: 74,
};

const SMASH_PROFILE: ActionProfile = {
  actionType: 'smash',
  scoringModelVersion: 'rule-v3-smash-shadow',
  actionLabel: '杀球',
  dimensionLabels: {
    evidence_quality: '证据质量',
    body_preparation: '身体加载',
    racket_arm_preparation: '挥拍臂加载',
    swing_repeatability: '击球连贯性',
    camera_suitability: '相机适配度',
  },
  phaseLabels: {
    preparation: '加载',
    backswing: '引拍',
    contactCandidate: '击球候选',
    followThrough: '随挥',
  },
  totalScoreWeights: {
    body_preparation: 0.34,
    racket_arm_preparation: 0.33,
    swing_repeatability: 0.33,
  },
  bodyThreshold: 74,
  armThreshold: 74,
  repeatThreshold: 72,
};

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

function getViewLabel(viewProfile?: ViewProfile) {
  return VIEW_PROFILE_LABELS[viewProfile ?? 'unknown'] ?? VIEW_PROFILE_LABELS.unknown;
}

function getRacketSideLabel(dominantRacketSide?: DominantRacketSide) {
  return RACKET_SIDE_LABELS[dominantRacketSide ?? 'unknown'] ?? RACKET_SIDE_LABELS.unknown;
}

function getFeatureSummary(summary: PoseAnalysisResult['summary'], key: string) {
  return summary.specializedFeatureSummary?.[key];
}

function uniqueReasons(reasons: FlowErrorCode[]) {
  return [...new Set(reasons)];
}

function addLowConfidenceReason(reasons: FlowErrorCode[], notes: string[], code: FlowErrorCode, note: string) {
  reasons.push(code);
  notes.push(note);
}

function shouldDowngradeCoverageFailure(summary: PoseAnalysisResult['summary']) {
  return summary.usableFrameCount >= MIN_SOFT_COVERAGE_FRAME_COUNT
    && summary.coverageRatio >= MIN_SOFT_COVERAGE_RATIO
    && summary.medianStabilityScore >= MIN_SOFT_COVERAGE_STABILITY;
}

function classifyCoverageReason(
  summary: PoseAnalysisResult['summary'],
  hardRejectReasons: FlowErrorCode[],
  lowConfidenceReasons: FlowErrorCode[],
  confidencePenaltyNotes: string[],
) {
  if (shouldDowngradeCoverageFailure(summary)) {
    addLowConfidenceReason(
      lowConfidenceReasons,
      confidencePenaltyNotes,
      'insufficient_pose_coverage',
      '当前样本覆盖率接近正式报告门槛，报告可读但建议补一条覆盖更完整的同机位样本。',
    );
    return;
  }

  hardRejectReasons.push('insufficient_pose_coverage');
}

function getAnalysisDisposition(poseResult: PoseAnalysisResult): AnalysisDisposition {
  const hardRejectReasons: FlowErrorCode[] = [];
  const lowConfidenceReasons: FlowErrorCode[] = [];
  const confidencePenaltyNotes: string[] = [];

  for (const reason of poseResult.summary.rejectionReasons) {
    if (reason === 'insufficient_pose_coverage') {
      classifyCoverageReason(poseResult.summary, hardRejectReasons, lowConfidenceReasons, confidencePenaltyNotes);
      continue;
    }

    if (HARD_REJECT_REASONS.has(reason)) {
      hardRejectReasons.push(reason);
      continue;
    }

    lowConfidenceReasons.push(reason);
  }

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
    hardRejectReasons: uniqueReasons(hardRejectReasons),
    lowConfidenceReasons: uniqueReasons(lowConfidenceReasons),
    confidencePenaltyNotes: [...new Set(confidencePenaltyNotes)],
  };
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

function buildFeatureGroupScore(
  features: Array<{ key: string; value: number | null; weight: number }>,
  fallbackScore: number,
  fallbackLabel: string,
  scoreFormula: string,
  fallbackFormula: string,
): FeatureGroupScore {
  const available = features.filter((feature) => typeof feature.value === 'number');
  if (available.length === 0) {
    return {
      score: fallbackScore,
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
    observableCoverage,
    source: available.map((feature) => `${feature.key}=${roundDebugValue(feature.value ?? 0)}`).join(', '),
    formula: scoreFormula,
    inputs,
    fallbacks: [],
    usedFallback: false,
  };
}

function getDetectedPhaseScore(candidate?: NonNullable<PoseAnalysisResult['summary']['phaseCandidates']>[ReportPhaseKey]) {
  if (!candidate || candidate.detectionStatus !== 'detected' || typeof candidate.score !== 'number') {
    return null;
  }
  return candidate.score;
}

function buildSmashDimensionScores(summary: PoseAnalysisResult['summary'], frameCount: number): SmashComputedScores {
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
    [
      { key: 'trunkCoilScore', value: trunkCoil?.median ?? null, weight: 0.45 },
      { key: 'shoulderHipRotationScore', value: shoulderHipRotation?.median ?? null, weight: 0.35 },
      { key: 'sideOnReadinessScore', value: sideOnReadiness?.median ?? null, weight: 0.2 },
    ],
    clampScore(22 + summary.medianBodyTurnScore * 78),
    'medianBodyTurnScore',
    'clamp(round(25 + weighted(trunkCoilScore, shoulderHipRotationScore, sideOnReadinessScore) * 75))',
    'clamp(round(22 + medianBodyTurnScore * 78))',
  );

  const racketArmPreparationGroup = buildFeatureGroupScore(
    [
      { key: 'elbowExtensionScore', value: elbowExtension?.median ?? null, weight: 0.3 },
      { key: 'hittingArmPreparationScore', value: hittingArmPreparation?.median ?? null, weight: 0.3 },
      { key: 'wristAboveShoulderConfidence', value: wristAboveShoulder?.median ?? null, weight: 0.25 },
      { key: 'racketSideElbowHeightScore', value: racketSideElbowHeight?.median ?? null, weight: 0.15 },
    ],
    clampScore(22 + summary.medianRacketArmLiftScore * 78),
    'medianRacketArmLiftScore',
    'clamp(round(25 + weighted(elbowExtensionScore, hittingArmPreparationScore, wristAboveShoulderConfidence, racketSideElbowHeightScore) * 75))',
    'clamp(round(22 + medianRacketArmLiftScore * 78))',
  );

  const contactPreparationMedian = contactPreparation?.median ?? null;
  const contactPreparationCoverage = contactPreparation?.observableCoverage ?? 0;
  const contactCandidateScore = getDetectedPhaseScore(summary.phaseCandidates?.contactCandidate);
  const followThroughScore = getDetectedPhaseScore(summary.phaseCandidates?.followThrough);
  const temporalConsistency = summary.temporalConsistency ?? 0;
  const motionContinuity = summary.motionContinuity ?? 0;
  const hasPhaseAwareRepeatabilityEvidence = contactPreparationMedian !== null
    && contactCandidateScore !== null
    && followThroughScore !== null;

  const swingRepeatabilityFallback = clampScore(
    contactPreparationCoverage * 25
      + usableRatio * 25
      + motionContinuity * 30
      + temporalConsistency * 20,
  );
  const swingRepeatability = hasPhaseAwareRepeatabilityEvidence
    ? clampScore(
      contactCandidateScore * 30
        + followThroughScore * 25
        + contactPreparationMedian * 20
        + motionContinuity * 15
        + temporalConsistency * 10,
    )
    : swingRepeatabilityFallback;

  const viewFactorByProfile: Record<ViewProfile, number> = {
    rear: 1,
    rear_left_oblique: 0.95,
    rear_right_oblique: 0.95,
    left_side: 0.9,
    right_side: 0.9,
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

  return {
    dimensionScores: {
      evidence_quality: evidenceQuality,
      body_preparation: bodyPreparationGroup.score,
      racket_arm_preparation: racketArmPreparationGroup.score,
      swing_repeatability: swingRepeatability,
      camera_suitability: cameraSuitability,
    },
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
      motionContinuity: roundDebugValue(motionContinuity),
      temporalConsistency: roundDebugValue(temporalConsistency),
      scoringMode: hasPhaseAwareRepeatabilityEvidence ? 'phase_aware' : 'smash_fallback',
      fallbackReason: hasPhaseAwareRepeatabilityEvidence
        ? null
        : summary.phaseCandidates?.followThrough?.detectionStatus !== 'detected'
          ? 'missing_follow_through_phase'
          : summary.phaseCandidates?.contactCandidate?.detectionStatus !== 'detected'
            ? 'missing_contact_candidate_phase'
            : 'missing_contact_preparation_feature',
    },
    cameraInputs: {
      viewProfile: summary.viewProfile ?? 'unknown',
      viewConfidence: summary.viewConfidence ?? null,
      viewStability: summary.viewStability ?? null,
      unknownViewCount,
      usableFrameCount: summary.usableFrameCount,
      unknownViewRatio: roundDebugValue(unknownViewRatio),
    },
  };
}

function getDimensionConfidence(
  key: PublicDimensionKey,
  scores: DimensionScores,
  bodyCoverage: number,
  racketCoverage: number,
  swingFallbackUsed: boolean,
) {
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

function buildSmashDimensionEvidence(
  key: DimensionKey,
  scores: DimensionScores,
  summary: PoseAnalysisResult['summary'],
  frameCount: number,
  computed: SmashComputedScores,
): DimensionEvidenceEntry {
  const usableRatio = frameCount > 0 ? summary.usableFrameCount / frameCount : 0;

  switch (key) {
    case 'evidence_quality':
      return {
        key,
        label: SMASH_PROFILE.dimensionLabels[key],
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
          actionProfile: 'smash-shadow',
        },
        fallbacks: [],
      };
    case 'body_preparation':
      return {
        key,
        label: SMASH_PROFILE.dimensionLabels[key],
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
        label: SMASH_PROFILE.dimensionLabels[key],
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
        label: SMASH_PROFILE.dimensionLabels[key],
        score: scores[key],
        available: true,
        confidence: getDimensionConfidence(key, scores, computed.bodyPreparationGroup.observableCoverage, computed.racketArmPreparationGroup.observableCoverage, computed.swingRepeatabilityFallbackUsed),
        source: computed.swingRepeatabilityFallbackUsed
          ? `usableRatio=${roundDebugValue(usableRatio)}, motionContinuity=${summary.motionContinuity}, temporalConsistency=${summary.temporalConsistency}`
          : `contactCandidateScore=${computed.swingRepeatabilityInputs.contactCandidateScore ?? 'null'}, followThroughScore=${computed.swingRepeatabilityInputs.followThroughScore ?? 'null'}, contactPreparationMedian=${computed.swingRepeatabilityInputs.contactPreparationMedian ?? 'null'}`,
        inputs: computed.swingRepeatabilityInputs,
        formula: computed.swingRepeatabilityFallbackUsed
          ? 'clamp(round(contactPreparationObservableCoverage * 25 + usableRatio * 25 + motionContinuity * 30 + temporalConsistency * 20))'
          : 'clamp(round(contactCandidateScore * 30 + followThroughScore * 25 + contactPreparationMedian * 20 + motionContinuity * 15 + temporalConsistency * 10))',
        adjustments: {
          scoringProfile: computed.swingRepeatabilityFallbackUsed ? 'smash_fallback' : 'smash_phase_aware',
          usedFallback: computed.swingRepeatabilityFallbackUsed,
        },
        fallbacks: computed.swingRepeatabilityFallbackUsed ? ['smash_phase_repeatability_fallback'] : [],
      };
    case 'camera_suitability':
      return {
        key,
        label: SMASH_PROFILE.dimensionLabels[key],
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

function buildDimensionEvidenceMap(dimensionEvidence: DimensionEvidenceEntry[]) {
  return new Map(dimensionEvidence.map((entry) => [entry.key, entry]));
}

function compactEvidenceRefs(...refs: Array<EvidenceRef | undefined>) {
  return refs.filter((ref): ref is EvidenceRef => Boolean(ref));
}

function toDimensionEvidenceRef(entry?: DimensionEvidenceEntry): EvidenceRef | undefined {
  if (!entry) return undefined;
  return {
    dimensionKey: entry.key,
    label: entry.label,
    score: entry.score,
    confidence: entry.confidence ?? null,
    reference: entry.source,
  };
}

function toFeatureEvidenceRef(feature?: FeatureDescriptor): EvidenceRef | undefined {
  if (!feature) return undefined;
  return {
    featureKey: feature.key,
    label: feature.label,
    score: feature.value === null ? null : clampScore(feature.value * 100),
    confidence: feature.observableCoverage ?? null,
    reference: feature.reference,
  };
}

function getPhaseCandidate(summary: PoseAnalysisResult['summary'], phaseKey: ReportPhaseKey) {
  return summary.phaseCandidates?.[phaseKey];
}

function getPhaseDetectedFrom(summary: PoseAnalysisResult['summary'], phaseKey: ReportPhaseKey) {
  const candidate = getPhaseCandidate(summary, phaseKey);
  if (!candidate) return undefined;
  return {
    anchorFrameIndex: candidate.anchorFrameIndex,
    windowStartFrameIndex: candidate.windowStartFrameIndex,
    windowEndFrameIndex: candidate.windowEndFrameIndex,
    sourceMetric: candidate.sourceMetric,
    detectionStatus: candidate.detectionStatus,
    missingReason: candidate.missingReason,
  };
}

function buildPhaseAssessment(
  profile: ActionProfile,
  phaseKey: ReportPhaseKey,
  status: ReportPhaseAssessmentStatus,
  summaryText: string,
  summary: PoseAnalysisResult['summary'],
  evidenceRefs: EvidenceRef[],
): ReportPhaseAssessment {
  return {
    phaseKey,
    label: profile.phaseLabels[phaseKey],
    status,
    summary: summaryText,
    evidenceRefs,
    detectedFrom: getPhaseDetectedFrom(summary, phaseKey),
  };
}

function buildSmashPhaseBreakdown(
  summary: PoseAnalysisResult['summary'],
  computed: SmashComputedScores,
  dimensionEvidenceMap: Map<string, DimensionEvidenceEntry>,
): ReportPhaseAssessment[] {
  const bodyEntry = dimensionEvidenceMap.get('body_preparation');
  const armEntry = dimensionEvidenceMap.get('racket_arm_preparation');
  const repeatabilityEntry = dimensionEvidenceMap.get('swing_repeatability');
  const contactPreparation = getFeatureSummary(summary, 'contactPreparationScore');
  const trunkCoil = getFeatureSummary(summary, 'trunkCoilScore');
  const elbowExtension = getFeatureSummary(summary, 'elbowExtensionScore');
  const preparationCandidate = getPhaseCandidate(summary, 'preparation');
  const backswingCandidate = getPhaseCandidate(summary, 'backswing');
  const contactCandidate = getPhaseCandidate(summary, 'contactCandidate');
  const followThroughCandidate = getPhaseCandidate(summary, 'followThrough');

  const preparationStatus: ReportPhaseAssessmentStatus = preparationCandidate?.detectionStatus !== 'detected'
    ? 'insufficient_evidence'
    : computed.bodyPreparationGroup.usedFallback
      ? 'insufficient_evidence'
      : computed.dimensionScores.body_preparation < SMASH_PROFILE.bodyThreshold
        ? 'attention'
        : 'ok';
  const backswingStatus: ReportPhaseAssessmentStatus = backswingCandidate?.detectionStatus !== 'detected'
    ? 'insufficient_evidence'
    : computed.racketArmPreparationGroup.usedFallback
      ? 'insufficient_evidence'
      : computed.dimensionScores.racket_arm_preparation < SMASH_PROFILE.armThreshold
        ? 'attention'
        : 'ok';
  const contactCandidateStatus: ReportPhaseAssessmentStatus = contactCandidate?.detectionStatus !== 'detected' || contactPreparation?.median === null
    ? 'insufficient_evidence'
    : (contactPreparation?.median ?? 0) < 0.66 || (contactCandidate.score ?? 0) < 0.64
      ? 'attention'
      : 'ok';
  const followThroughStatus: ReportPhaseAssessmentStatus = followThroughCandidate?.detectionStatus !== 'detected'
    ? 'insufficient_evidence'
    : (summary.motionContinuity ?? 0) < 0.75 || (summary.temporalConsistency ?? 0) < 0.7 || (followThroughCandidate.score ?? 0) < 0.6
      ? 'attention'
      : 'ok';

  return [
    buildPhaseAssessment(
      SMASH_PROFILE,
      'preparation',
      preparationStatus,
      preparationStatus === 'insufficient_evidence'
        ? '加载阶段证据不足，当前还不能稳定确认杀球前的躯干蓄力是不是提前挂住。'
        : preparationStatus === 'attention'
          ? '加载阶段还没先挂住，起跳或转体前的身体蓄力不够完整。'
          : '加载阶段相对稳定，身体已经能较早进入杀球前的蓄力位置。',
      summary,
      compactEvidenceRefs(
        toDimensionEvidenceRef(bodyEntry),
        toFeatureEvidenceRef({
          key: 'trunkCoilScore',
          label: FEATURE_LABELS.trunkCoilScore,
          value: trunkCoil?.median ?? null,
          observableCoverage: trunkCoil?.observableCoverage,
        }),
      ),
    ),
    buildPhaseAssessment(
      SMASH_PROFILE,
      'backswing',
      backswingStatus,
      backswingStatus === 'insufficient_evidence'
        ? '引拍阶段证据不足，挥拍臂的上举和外展还需要更完整的阶段窗口才能稳定判断。'
        : backswingStatus === 'attention'
          ? '引拍阶段还没完全拉开，抬肘和手臂上举的准备位置仍然偏低。'
          : '引拍阶段已经比较成型，挥拍臂的上举和展开能较稳定地挂住。',
      summary,
      compactEvidenceRefs(
        toDimensionEvidenceRef(armEntry),
        toFeatureEvidenceRef({
          key: 'elbowExtensionScore',
          label: FEATURE_LABELS.elbowExtensionScore,
          value: elbowExtension?.median ?? null,
          observableCoverage: elbowExtension?.observableCoverage,
        }),
      ),
    ),
    buildPhaseAssessment(
      SMASH_PROFILE,
      'contactCandidate',
      contactCandidateStatus,
      contactCandidateStatus === 'insufficient_evidence'
        ? '击球候选阶段证据不足，当前还缺少稳定的接触前准备窗口。'
        : contactCandidateStatus === 'attention'
          ? '击球候选阶段衔接还不够顺，接触前的准备和出手节奏没有完全接上。'
          : '击球候选阶段比较清楚，接触前的准备和节奏衔接相对稳定。',
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
      SMASH_PROFILE,
      'followThrough',
      followThroughStatus,
      followThroughStatus === 'insufficient_evidence'
        ? '随挥阶段证据不足，这次视频里击球后的连续动作没有被稳定捕捉到。'
        : followThroughStatus === 'attention'
          ? '随挥阶段还没完全接上，击球后的连贯性和节奏保持还在波动。'
          : '随挥阶段已经能比较稳定地接住，击球后的连续动作没有明显断掉。',
      summary,
      compactEvidenceRefs(toDimensionEvidenceRef(repeatabilityEntry)),
    ),
  ];
}

function getWeakestFeature(features: FeatureDescriptor[]) {
  const available = features.filter((feature) => typeof feature.value === 'number');
  if (available.length > 0) {
    return [...available].sort((left, right) => (left.value ?? 1) - (right.value ?? 1))[0];
  }
  return features[0];
}

function buildEvidenceSentence(evidenceRefs: EvidenceRef[]) {
  const refs = evidenceRefs
    .filter((ref) => ref.label)
    .slice(0, 2)
    .map((ref) => `${ref.label} ${ref.score ?? '—'} 分`);
  return refs.length > 0 ? `当前证据更直接落在 ${refs.join('、')}。` : '';
}

function shouldSuggestCaptureAdvice(
  confidenceScore: number,
  cameraSuitability: number,
  dimensionConfidence?: number | null,
) {
  return confidenceScore < LOW_CONFIDENCE_THRESHOLD
    || cameraSuitability < 70
    || (dimensionConfidence ?? 1) < 0.68;
}

function getSmashCaptureAdvice(recognitionContext: RecognitionContext, emphasis: 'loading' | 'arm' | 'timing' | 'evidence') {
  const genericTail = '固定手机、让人物完整入镜，并尽量把加载到出手、随挥这一段连续录进去。';

  if (FRONT_VIEW_PROFILES.has(recognitionContext.viewProfile ?? 'unknown') || recognitionContext.viewProfile === 'unknown') {
    const focus = emphasis === 'loading'
      ? '这样更容易看清杀球前的躯干加载和肩髋打开'
      : emphasis === 'arm'
        ? '这样抬肘、上举和手臂展开会更清楚'
        : emphasis === 'timing'
          ? '这样更容易看清接触前后的衔接是不是顺'
          : '这样动作细节的判断会更稳';
    return `下次拍摄尽量改成后方、后斜或侧后方视角，${focus}；${genericTail}`;
  }

  const focus = emphasis === 'loading'
    ? '优先让肩髋转开和躯干加载都完整留在画面里'
    : emphasis === 'arm'
      ? '优先让挥拍肘、前臂和肩线都完整入镜'
      : emphasis === 'timing'
        ? '优先让加载、击球候选和随挥连续可见'
        : '优先保持同一机位不变';
  return `下次继续保持${recognitionContext.viewLabel}视角，${focus}，${genericTail}`;
}

function buildSuggestionDraft(
  ruleKey: SuggestionDraft['ruleKey'],
  suggestion: Omit<SuggestionDraft, 'ruleKey' | 'suggestionType'>,
): SuggestionDraft {
  const suggestionType = ruleKey === 'capture_fix'
    ? 'capture_fix'
    : ruleKey === 'technique_focus'
      ? 'technique_focus'
      : 'retest_check';
  return {
    ...suggestion,
    ruleKey,
    suggestionType,
  };
}

function buildSmashLoadingIssue(context: SmashIssueContext): RankedIssue | null {
  const score = context.publicScores.body_preparation;
  if (score >= SMASH_PROFILE.bodyThreshold) return null;

  const dimensionEntry = context.dimensionEvidenceMap.get('body_preparation');
  const weakestFeature = getWeakestFeature([
    {
      key: 'trunkCoilScore',
      label: FEATURE_LABELS.trunkCoilScore,
      value: getFeatureSummary(context.summary, 'trunkCoilScore')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'trunkCoilScore')?.observableCoverage,
    },
    {
      key: 'shoulderHipRotationScore',
      label: FEATURE_LABELS.shoulderHipRotationScore,
      value: getFeatureSummary(context.summary, 'shoulderHipRotationScore')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'shoulderHipRotationScore')?.observableCoverage,
    },
    {
      key: 'sideOnReadinessScore',
      label: FEATURE_LABELS.sideOnReadinessScore,
      value: getFeatureSummary(context.summary, 'sideOnReadinessScore')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'sideOnReadinessScore')?.observableCoverage,
    },
  ]);
  const weakEvidence = context.computed.bodyPreparationGroup.usedFallback || (dimensionEntry?.confidence ?? 1) < 0.68;
  const phaseLabel = SMASH_PROFILE.phaseLabels.preparation;
  const observation = weakEvidence
    ? `${phaseLabel}阶段能看出身体加载还不够完整，但专项证据不算完整，这条先按弱判断处理。`
    : weakestFeature?.key === 'sideOnReadinessScore'
      ? `${phaseLabel}阶段里，身体进入侧向加载的位置偏晚，杀球前的打开和起动没有先挂住。`
      : weakestFeature?.key === 'shoulderHipRotationScore'
        ? `${phaseLabel}阶段里，肩髋转开的幅度还不够，杀球前的转体加载没有把出手空间完全带出来。`
        : `${phaseLabel}阶段里，躯干蓄力还没完全挂住，身体加载和后续挥拍之间还略显脱节。`;
  const whyItMatters = '身体加载不到位时，杀球前的蓄力空间会变小，后面更容易只剩手臂补速度。';
  const nextTrainingFocus = '下一次训练先盯身体先加载、再接手臂出手，让转体和起动先挂住，不要一上来就追求手上速度。';
  const captureAdvice = shouldSuggestCaptureAdvice(context.confidenceScore, context.scores.camera_suitability, dimensionEntry?.confidence)
    ? getSmashCaptureAdvice(context.recognitionContext, 'loading')
    : undefined;
  const evidenceRefs = compactEvidenceRefs(
    toDimensionEvidenceRef(dimensionEntry),
    toFeatureEvidenceRef(weakestFeature),
  );

  return {
    key: 'body_preparation',
    severity: SMASH_PROFILE.bodyThreshold - score,
    rankingBucket: 4,
    phaseKey: 'preparation',
    phaseLabel,
    title: '身体加载不足',
    description: `${observation} ${buildEvidenceSentence(evidenceRefs)}`.trim(),
    impact: whyItMatters,
    issueType: 'action_gap',
    issueCategory: 'smash_loading_gap',
    targetDimensionKey: 'body_preparation',
    confidenceImpact: weakEvidence ? 'medium' : 'low',
    observation,
    whyItMatters,
    nextTrainingFocus,
    captureAdvice,
    evidenceRefs,
    leadSuggestion: buildSuggestionDraft('technique_focus', {
      title: '下一次先把身体加载做完整',
      description: nextTrainingFocus,
      targetDimensionKey: 'body_preparation',
      focusPoint: '身体加载',
      linkedIssueCategory: 'smash_loading_gap',
      evidenceRefs,
    }),
    captureSuggestion: captureAdvice
      ? buildSuggestionDraft('capture_fix', {
        title: '下次拍摄先把身体加载拍清楚',
        description: captureAdvice,
        targetDimensionKey: 'body_preparation',
        recommendedNextCapture: captureAdvice,
        linkedIssueCategory: 'smash_loading_gap',
        evidenceRefs,
      })
      : undefined,
  };
}

function buildSmashArmPreparationIssue(context: SmashIssueContext): RankedIssue | null {
  const score = context.publicScores.racket_arm_preparation;
  if (score >= SMASH_PROFILE.armThreshold) return null;

  const dimensionEntry = context.dimensionEvidenceMap.get('racket_arm_preparation');
  const weakestFeature = getWeakestFeature([
    {
      key: 'elbowExtensionScore',
      label: FEATURE_LABELS.elbowExtensionScore,
      value: getFeatureSummary(context.summary, 'elbowExtensionScore')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'elbowExtensionScore')?.observableCoverage,
    },
    {
      key: 'wristAboveShoulderConfidence',
      label: FEATURE_LABELS.wristAboveShoulderConfidence,
      value: getFeatureSummary(context.summary, 'wristAboveShoulderConfidence')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'wristAboveShoulderConfidence')?.observableCoverage,
    },
    {
      key: 'racketSideElbowHeightScore',
      label: FEATURE_LABELS.racketSideElbowHeightScore,
      value: getFeatureSummary(context.summary, 'racketSideElbowHeightScore')?.median ?? null,
      observableCoverage: getFeatureSummary(context.summary, 'racketSideElbowHeightScore')?.observableCoverage,
    },
  ]);
  const weakEvidence = context.computed.racketArmPreparationGroup.usedFallback || (dimensionEntry?.confidence ?? 1) < 0.68;
  const phaseLabel = SMASH_PROFILE.phaseLabels.backswing;
  const observation = weakEvidence
    ? `${phaseLabel}阶段能看出挥拍臂加载还不够充分，但专项证据不算完整，这条先按弱判断处理。`
    : weakestFeature?.key === 'wristAboveShoulderConfidence'
      ? `${phaseLabel}阶段里，挥拍手和前臂抬得还不够早，杀球前的上举准备位置仍然偏低。`
      : weakestFeature?.key === 'elbowExtensionScore'
        ? `${phaseLabel}阶段里，肘部和前臂没有提前展开，整条手臂的引拍加载还没完全撑开。`
        : `${phaseLabel}阶段里，抬肘位置还不够高，挥拍臂加载没有先把上肢空间拉出来。`;
  const whyItMatters = '挥拍臂加载不到位时，杀球前的上举和引拍空间会被压缩，后面更容易只靠最后一下补手臂。';
  const nextTrainingFocus = '下一次训练先盯抬肘和上举更早到位，再去追求杀球速度，先把挥拍臂的加载位置挂住。';
  const captureAdvice = shouldSuggestCaptureAdvice(context.confidenceScore, context.scores.camera_suitability, dimensionEntry?.confidence)
    ? getSmashCaptureAdvice(context.recognitionContext, 'arm')
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

  return {
    key: 'racket_arm_preparation',
    severity: SMASH_PROFILE.armThreshold - score,
    rankingBucket: 3,
    phaseKey: 'backswing',
    phaseLabel,
    title: '挥拍臂加载不足',
    description: `${observation} ${buildEvidenceSentence(evidenceRefs)}`.trim(),
    impact: whyItMatters,
    issueType: 'action_gap',
    issueCategory: 'smash_arm_preparation_gap',
    targetDimensionKey: 'racket_arm_preparation',
    confidenceImpact: weakEvidence ? 'medium' : 'low',
    observation,
    whyItMatters,
    nextTrainingFocus,
    captureAdvice,
    evidenceRefs,
    leadSuggestion: buildSuggestionDraft('technique_focus', {
      title: '下一次先把挥拍臂加载挂住',
      description: nextTrainingFocus,
      targetDimensionKey: 'racket_arm_preparation',
      focusPoint: '挥拍臂加载',
      linkedIssueCategory: 'smash_arm_preparation_gap',
      evidenceRefs,
    }),
    captureSuggestion: captureAdvice
      ? buildSuggestionDraft('capture_fix', {
        title: '下次拍摄先把挥拍臂加载拍清楚',
        description: captureAdvice,
        targetDimensionKey: 'racket_arm_preparation',
        recommendedNextCapture: captureAdvice,
        linkedIssueCategory: 'smash_arm_preparation_gap',
        evidenceRefs,
      })
      : undefined,
  };
}

function getRepeatabilityFocusPhase(phaseBreakdown: ReportPhaseAssessment[]) {
  const repeatabilityPhases = phaseBreakdown.filter((item) => item.phaseKey === 'contactCandidate' || item.phaseKey === 'followThrough');
  return [...repeatabilityPhases].sort((left, right) => {
    const weight = { ok: 0, attention: 1, insufficient_evidence: 2 };
    const weightDelta = weight[right.status] - weight[left.status];
    if (weightDelta !== 0) return weightDelta;
    return left.phaseKey === 'contactCandidate' ? -1 : 1;
  })[0];
}

function buildSmashContactTimingIssue(context: SmashIssueContext): RankedIssue | null {
  const score = context.publicScores.swing_repeatability;
  if (score >= SMASH_PROFILE.repeatThreshold) return null;

  const dimensionEntry = context.dimensionEvidenceMap.get('swing_repeatability');
  const contactPreparation = getFeatureSummary(context.summary, 'contactPreparationScore');
  const focusPhase = getRepeatabilityFocusPhase(context.phaseBreakdown);
  const phaseLabel = focusPhase?.label ?? SMASH_PROFILE.phaseLabels.contactCandidate;
  const weakEvidence = context.computed.swingRepeatabilityFallbackUsed || (dimensionEntry?.confidence ?? 1) < 0.72;
  const observation = weakEvidence
    ? `${phaseLabel}阶段证据还不完整，这次更多是在提醒杀球接触前后的衔接偏散。`
    : `${phaseLabel}阶段当前最需要回看，加载、击球候选到随挥的节奏没有稳定连起来，好的那一下能看到，但没有连续留住。`;
  const whyItMatters = '击球前后衔接不顺时，单次看起来做到了的节奏不一定能稳定带到每一拍，速度和落点也更难稳定。';
  const nextTrainingFocus = `下一次训练先把${phaseLabel}阶段接顺，让加载、出手和随挥形成同一套节奏，再去放大发力。`;
  const captureAdvice = shouldSuggestCaptureAdvice(context.confidenceScore, context.scores.camera_suitability, dimensionEntry?.confidence)
    ? getSmashCaptureAdvice(context.recognitionContext, 'timing')
    : undefined;
  const evidenceRefs = compactEvidenceRefs(
    toDimensionEvidenceRef(dimensionEntry),
    toFeatureEvidenceRef({
      key: 'contactPreparationScore',
      label: FEATURE_LABELS.contactPreparationScore,
      value: contactPreparation?.median ?? null,
      observableCoverage: contactPreparation?.observableCoverage,
      reference: `motionContinuity=${roundDebugValue(context.summary.motionContinuity ?? 0)}`,
    }),
  );

  return {
    key: 'swing_repeatability',
    severity: SMASH_PROFILE.repeatThreshold - score,
    rankingBucket: 2,
    phaseKey: focusPhase?.phaseKey ?? 'contactCandidate',
    phaseLabel,
    title: '击球前后衔接不顺',
    description: `${observation} ${buildEvidenceSentence(evidenceRefs)}`.trim(),
    impact: whyItMatters,
    issueType: 'action_gap',
    issueCategory: 'smash_contact_timing_gap',
    targetDimensionKey: 'swing_repeatability',
    confidenceImpact: weakEvidence ? 'medium' : 'low',
    observation,
    whyItMatters,
    nextTrainingFocus,
    captureAdvice,
    evidenceRefs,
    leadSuggestion: buildSuggestionDraft('technique_focus', {
      title: `下一次先把${phaseLabel}阶段接顺`,
      description: nextTrainingFocus,
      targetDimensionKey: 'swing_repeatability',
      focusPoint: `${phaseLabel}阶段的击球连贯性`,
      linkedIssueCategory: 'smash_contact_timing_gap',
      evidenceRefs,
    }),
    captureSuggestion: captureAdvice
      ? buildSuggestionDraft('capture_fix', {
        title: '下次拍摄先保证击球前后都拍进去',
        description: captureAdvice,
        targetDimensionKey: 'swing_repeatability',
        recommendedNextCapture: captureAdvice,
        linkedIssueCategory: 'smash_contact_timing_gap',
        evidenceRefs,
      })
      : undefined,
  };
}

function buildEvidenceQualityIssue(context: SmashIssueContext): RankedIssue | null {
  const score = context.publicScores.evidence_quality;
  const cameraSuitability = context.scores.camera_suitability;
  if (context.confidenceScore >= LOW_CONFIDENCE_THRESHOLD && score >= 70 && cameraSuitability >= 60) return null;

  const evidenceEntry = context.dimensionEvidenceMap.get('evidence_quality');
  const cameraEntry = context.dimensionEvidenceMap.get('camera_suitability');
  const lowViewConfidence = (context.summary.viewConfidence ?? 0) < 0.62;
  const observation = cameraSuitability < 60
    ? `这次视频更像是机位先限制了判断，当前${context.recognitionContext.viewLabel}视角下的加载、引拍和随挥细节都只能保守解读。`
    : lowViewConfidence
      ? '这次视频能看出杀球动作的大方向，但视角判断还不够稳，细节结论需要留一点余量。'
      : '这次视频里稳定帧和专项特征覆盖还不够整，杀球细节可以参考，但不适合放大读。';
  const whyItMatters = '证据质量有限时，shadow 评分更适合看方向，不适合把细小分差直接当成真实进步或退步。';
  const nextTrainingFocus = '下一次训练先只盯 1 个杀球动作点，在更稳定的拍摄下确认它是不是真的在变好。';
  const captureAdvice = getSmashCaptureAdvice(context.recognitionContext, 'evidence');
  const evidenceRefs = compactEvidenceRefs(
    toDimensionEvidenceRef(evidenceEntry),
    toDimensionEvidenceRef(cameraEntry),
  );
  const severity = Math.max(LOW_CONFIDENCE_THRESHOLD - context.confidenceScore, 70 - score, 65 - cameraSuitability);

  return {
    key: 'confidence',
    severity,
    rankingBucket: 1,
    title: '证据质量有限，当前判断要保守',
    description: `${observation} ${buildEvidenceSentence(evidenceRefs)}`.trim(),
    impact: whyItMatters,
    issueType: 'evidence_gap',
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

function buildSmashRankedIssues(context: SmashIssueContext): RankedIssue[] {
  const issues = [
    buildSmashLoadingIssue(context),
    buildSmashArmPreparationIssue(context),
    buildSmashContactTimingIssue(context),
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

function buildSmashSuggestions(recognitionContext: RecognitionContext, rankedIssues: RankedIssue[]): SuggestionItem[] {
  if (rankedIssues.length === 0) {
    return [{
      title: '下次继续验证杀球节奏能否稳定复现',
      description: `保持同一机位再录一条杀球视频，优先确认这次在${recognitionContext.viewLabel}视角下看到的加载和出手节奏不是偶尔出现。`,
      suggestionType: 'retest_check',
      targetDimensionKey: 'swing_repeatability',
      focusPoint: '杀球节奏稳定复现',
      linkedIssueCategory: 'smash_contact_timing_gap',
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
    title: actionFocusIssues.length > 0 ? '下次复测先只盯 1~2 个杀球动作点' : '下次复测先看证据有没有稳住',
    description: actionFocusIssues.length > 0
      ? `下次复测先盯 ${focusLabels.join('、')}，先确认这 1~2 个杀球动作点有没有一起变稳，再决定要不要继续加别的调整。`
      : `下次复测先确认${recognitionContext.viewLabel}视角下的机位和主体完整度有没有稳住，再放大读杀球细节。`,
    targetDimensionKey: actionFocusIssues[0]?.targetDimensionKey ?? 'evidence_quality',
    focusPoint: actionFocusIssues.length > 0 ? focusLabels.join('、') : '证据质量',
    linkedIssueCategory: actionFocusIssues[0]?.issueCategory ?? 'evidence_quality_gap',
    evidenceRefs: actionFocusIssues[0]?.evidenceRefs,
  }));

  return suggestions
    .slice(0, 3)
    .map(({ ruleKey: _ruleKey, ...item }) => ({
      ...item,
      description: `${item.description} 当前识别为${recognitionContext.viewLabel}视角。`,
    }));
}

function buildSmashSummaryText(
  rankedIssues: RankedIssue[],
  confidenceScore: number,
  summary: PoseAnalysisResult['summary'],
  frameCount: number,
) {
  const evidenceLead = `本次基于 ${summary.usableFrameCount}/${frameCount} 帧稳定识别结果生成。`;
  const recognitionLead = `当前识别为${getViewLabel(summary.viewProfile)}，${getRacketSideLabel(summary.dominantRacketSide)}。`;
  const topIssue = rankedIssues[0];

  if (!topIssue) {
    return `${evidenceLead} ${recognitionLead} 当前这条杀球的可观测动作框架比较完整，下一步更适合继续验证加载到出手能否稳定复现。`;
  }

  if (topIssue.issueCategory === 'evidence_quality_gap' || confidenceScore < LOW_CONFIDENCE_THRESHOLD) {
    return `${evidenceLead} ${recognitionLead} 当前报告能看出杀球动作的大方向，但这次更该先把机位和样本稳定性收住，再放大解读动作细节。`;
  }

  return `${evidenceLead} ${recognitionLead} 当前最值得先改的是${topIssue.phaseLabel ?? '当前关键'}阶段的${topIssue.title}，这也是这次证据最直接指向的杀球短板。`;
}

function getSmashViewReferenceCue(viewProfile?: ViewProfile) {
  switch (viewProfile) {
    case 'left_side':
    case 'right_side':
      return '当前识别为侧面视角，这次更适合观察杀球前的上举和击球前后衔接，身体加载判断会更保守。';
    case 'front':
      return '当前识别为正面视角，系统仍可参考挥拍臂加载和证据稳定性，但不会把视角局限直接当成动作差。';
    case 'front_left_oblique':
    case 'front_right_oblique':
      return '当前识别为前斜视角，报告会保留杀球结论，但会单独降低证据置信度。';
    case 'rear_left_oblique':
    case 'rear_right_oblique':
      return '当前识别为后斜视角，这次对杀球前的身体加载、挥拍臂加载和击球衔接都能给出较完整的可解释证据。';
    case 'rear':
      return '当前识别为后方视角，这次对杀球前的加载和出手连贯性判断相对更稳。';
    default:
      return '当前报告会同时区分动作问题和证据质量问题，避免把机位局限直接写成动作差。';
  }
}

function buildSmashStandardComparison(rankedIssues: RankedIssue[], summary: PoseAnalysisResult['summary']): StandardComparison {
  const viewLabel = getViewLabel(summary.viewProfile);
  const topIssues = rankedIssues.slice(0, 3);
  const differences = topIssues.length > 0
    ? topIssues.map((issue) => {
      switch (issue.issueCategory) {
        case 'smash_loading_gap':
          return `基于当前${viewLabel}视角，杀球前的身体加载还不够完整，转体和蓄力空间偏小。`;
        case 'smash_arm_preparation_gap':
          return `基于当前${viewLabel}视角，挥拍臂加载还没完全撑开，重点先回看抬肘、上举和手臂展开。`;
        case 'smash_contact_timing_gap':
          return `基于当前${viewLabel}视角，这条样本在击球候选到随挥的节奏衔接上还不够顺。`;
        case 'evidence_quality_gap':
          return `这次更明显的问题在证据质量，当前${viewLabel}视角下的机位或样本稳定性限制了杀球判断置信度。`;
        default:
          return issue.observation ?? issue.description;
      }
    })
    : [`基于当前${viewLabel}视角，当前样本和杀球参考动作之间的关键加载维度已经比较接近。`];

  return {
    sectionTitle: '当前视角动作参考对照',
    summaryText: topIssues.length > 0
      ? `当前识别为${viewLabel}视角，这次最明确的杀球差异集中在${topIssues.map((item) => item.title).join('、')}。`
      : `当前识别为${viewLabel}视角，这次可稳定观测的杀球加载和出手维度已经比较接近参考动作。`,
    currentFrameLabel: '当前样本最佳稳定帧',
    standardFrameLabel: '标准杀球真人参考帧',
    viewProfile: summary.viewProfile,
    standardReference: {
      title: '杀球标准参考帧',
      cue: getSmashViewReferenceCue(summary.viewProfile),
      imageLabel: '标准杀球真人参考帧',
      imagePath: '/standard-references/smash-reference-real.jpg',
      sourceType: 'real-sample',
    },
    phaseFrames: [
      {
        phase: '加载',
        title: '杀球加载阶段',
        imagePath: '/standard-references/smash-phase-prep.jpg',
        cue: '优先观察杀球前的身体加载和肩髋打开是否更早完成。',
      },
      {
        phase: '引拍',
        title: '杀球引拍加载',
        imagePath: '/standard-references/smash-phase-load.jpg',
        cue: '看抬肘、上举和手臂展开是否一起挂住，而不是临出手才补手臂。',
      },
      {
        phase: '击球',
        title: '杀球击球候选与随挥',
        imagePath: '/standard-references/smash-phase-contact.jpg',
        cue: '确认击球候选到随挥能否顺着接上，而不是只看到单帧姿势。',
      },
    ],
    differences,
  };
}

function buildSmashCompareSummary(recognitionContext: RecognitionContext, confidenceScore: number, rankedIssues: RankedIssue[]) {
  const leadPhase = rankedIssues[0]?.phaseLabel;
  const issueLead = rankedIssues[0]?.issueCategory === 'evidence_quality_gap'
    ? '这次 shadow 报告会把证据质量单独提出，避免把机位限制直接当成杀球动作错误。'
    : `这次 shadow 报告会把动作问题和证据问题分开写，并明确指出${leadPhase ?? '当前'}阶段是不是主要薄弱点。`;
  const confidenceClause = confidenceScore < LOW_CONFIDENCE_THRESHOLD
    ? '当前这条样本更适合做方向判断。'
    : '当前这条样本已经可以更明确地定位杀球短板。';
  return `当前报告围绕${recognitionContext.viewLabel}视角下的身体加载、挥拍臂加载、击球连贯性和证据质量生成。${issueLead}${confidenceClause}`;
}

function buildSmashRetestAdvice(recognitionContext: RecognitionContext, confidenceScore: number, rankedIssues: RankedIssue[]) {
  if (confidenceScore < LOW_CONFIDENCE_THRESHOLD) {
    const actionTitle = rankedIssues.find((issue) => issue.issueType === 'action_gap')?.title;
    const actionPhase = rankedIssues.find((issue) => issue.issueType === 'action_gap')?.phaseLabel;
    return actionTitle
      ? `建议 3~7 天后保持同一机位复测，下次先把${recognitionContext.viewLabel}视角下的机位稳定性收住，再确认${actionPhase ?? '当前关键'}阶段的${actionTitle}是不是真的在改善。`
      : `建议 3~7 天后保持同一机位复测，下次先把${recognitionContext.viewLabel}视角下的机位稳定性和主体完整度收住，再看杀球分差。`;
  }

  const topActionIssues = rankedIssues.filter((issue) => issue.issueType === 'action_gap').slice(0, 2);
  if (topActionIssues.length === 0) {
    return `建议 3~7 天后保持同一机位复测，继续确认${recognitionContext.viewLabel}视角下这套杀球动作能否稳定复现。`;
  }

  return `建议 3~7 天后保持同一机位复测，下次优先看${topActionIssues.map((issue) => `${issue.phaseLabel ?? '当前'}阶段的${issue.title}`).join('、')}这 1~2 个动作点有没有一起变稳。`;
}

function buildSmashConfidenceBreakdown(
  scores: DimensionScores,
  computed: SmashComputedScores,
  disposition: AnalysisDisposition,
) {
  const observabilityScore = clampScore(
    ((computed.bodyPreparationGroup.observableCoverage + computed.racketArmPreparationGroup.observableCoverage + (computed.swingRepeatabilityFallbackUsed ? 0 : 1)) / 3) * 100,
  );
  const contributions = [
    {
      key: 'evidence_quality',
      label: SMASH_PROFILE.dimensionLabels.evidence_quality,
      score: scores.evidence_quality,
      weight: 0.55,
      weightedScore: roundDebugValue(scores.evidence_quality * 0.55),
    },
    {
      key: 'camera_suitability',
      label: SMASH_PROFILE.dimensionLabels.camera_suitability,
      score: scores.camera_suitability,
      weight: 0.3,
      weightedScore: roundDebugValue(scores.camera_suitability * 0.3),
    },
    {
      key: 'observability',
      label: '阶段可观测性',
      score: observabilityScore,
      weight: 0.15,
      weightedScore: roundDebugValue(observabilityScore * 0.15),
    },
  ];
  const penalties = [
    ...(computed.bodyPreparationGroup.usedFallback
      ? [{ key: 'smash_loading_fallback', label: '身体加载回退', amount: 8, reason: '本次身体加载主要由旧 turn 特征补足。' }]
      : []),
    ...(computed.racketArmPreparationGroup.usedFallback
      ? [{ key: 'smash_arm_preparation_fallback', label: '挥拍臂加载回退', amount: 8, reason: '本次挥拍臂加载主要由旧 lift 特征补足。' }]
      : []),
    ...(computed.swingRepeatabilityFallbackUsed
      ? [{ key: 'smash_repeatability_fallback', label: '击球连贯性回退', amount: 6, reason: '本次击球前后衔接缺少完整阶段证据，仍在使用 smash shadow fallback。' }]
      : []),
    ...disposition.confidencePenaltyNotes.map((note, index) => ({
      key: `disposition_penalty_${index}`,
      label: '证据置信惩罚',
      amount: 6,
      reason: note,
    })),
  ];
  const rawConfidenceScore = roundDebugValue(contributions.reduce((sum, item) => sum + item.weightedScore, 0));
  const totalPenalty = penalties.reduce((sum, item) => sum + item.amount, 0);
  return {
    rawConfidenceScore,
    finalConfidenceScore: clampScore(rawConfidenceScore - totalPenalty),
    observabilityScore,
    contributions,
    penalties,
  };
}

function buildSmashEvidenceNotes(
  scores: DimensionScores,
  confidenceScore: number,
  disposition: AnalysisDisposition,
  computed: SmashComputedScores,
) {
  const notes = [...disposition.confidencePenaltyNotes];
  if (computed.bodyPreparationGroup.usedFallback) {
    notes.push('当前身体加载主要由旧 turn 特征补足。');
  }
  if (computed.racketArmPreparationGroup.usedFallback) {
    notes.push('当前挥拍臂加载主要由旧 lift 特征补足。');
  }
  if (computed.swingRepeatabilityFallbackUsed) {
    notes.push('当前击球连贯性缺少完整阶段证据，仍在使用 smash shadow fallback。');
  }
  if (scores.swing_repeatability < 68 && !notes.some((note) => note.includes('击球'))) {
    notes.push('当前击球候选到随挥的连贯性还不够稳，这项更适合作为后续复测关注点。');
  }
  if (confidenceScore < LOW_CONFIDENCE_THRESHOLD && !notes.some((note) => note.includes('机位'))) {
    notes.push('当前样本更适合看方向，不适合放大解读细小分差。');
  }
  return [...new Set(notes)];
}

function buildTotalScoreBreakdown(scores: DimensionScores, profile: ActionProfile) {
  const contributions = (Object.keys(profile.totalScoreWeights) as Array<keyof typeof profile.totalScoreWeights>).map((key) => ({
    key,
    label: profile.dimensionLabels[key],
    score: scores[key],
    weight: profile.totalScoreWeights[key],
    weightedScore: roundDebugValue(scores[key] * profile.totalScoreWeights[key]),
  }));
  const rawWeightedTotal = roundDebugValue(contributions.reduce((sum, item) => sum + item.weightedScore, 0));
  return {
    rawWeightedTotal,
    finalTotalScore: clampScore(rawWeightedTotal),
    contributions,
  };
}

export function buildShadowRuleBasedResult(
  task: AnalysisTaskRecord,
  poseResult: PoseAnalysisResult,
  options: { shadowActionType?: ShadowActionType } = {},
): ShadowReportResult {
  const shadowActionType = options.shadowActionType ?? task.actionType;
  if (shadowActionType === 'clear') {
    return buildRuleBasedResult(task, poseResult) as ShadowReportResult;
  }

  const disposition = getAnalysisDisposition(poseResult);
  const computed = buildSmashDimensionScores(poseResult.summary, poseResult.frameCount);
  const scores = computed.dimensionScores;
  const publicScores: Record<PublicDimensionKey, number> = {
    evidence_quality: scores.evidence_quality,
    body_preparation: scores.body_preparation,
    racket_arm_preparation: scores.racket_arm_preparation,
    swing_repeatability: scores.swing_repeatability,
  };
  const totalScoreBreakdown = buildTotalScoreBreakdown(scores, SMASH_PROFILE);
  const confidenceBreakdown = buildSmashConfidenceBreakdown(scores, computed, disposition);
  const confidenceScore = confidenceBreakdown.finalConfidenceScore;
  const analysisDisposition = disposition.hardRejectReasons.length > 0
    ? 'rejected'
    : confidenceScore < LOW_CONFIDENCE_THRESHOLD
      ? 'low_confidence'
      : 'analyzable';
  const evidenceNotes = buildSmashEvidenceNotes(scores, confidenceScore, disposition, computed);
  const recognitionContext = buildRecognitionContext(poseResult.summary, poseResult.engine);
  const visualEvidence = buildVisualEvidence(task, poseResult);
  const dimensionEvidence = (Object.keys(SMASH_PROFILE.dimensionLabels) as DimensionKey[]).map((key) => (
    buildSmashDimensionEvidence(key, scores, poseResult.summary, poseResult.frameCount, computed)
  ));
  const dimensionEvidenceMap = buildDimensionEvidenceMap(dimensionEvidence);
  const phaseBreakdown = buildSmashPhaseBreakdown(poseResult.summary, computed, dimensionEvidenceMap);
  const rankedIssues = buildSmashRankedIssues({
    recognitionContext,
    summary: poseResult.summary,
    scores,
    publicScores,
    confidenceScore,
    computed,
    dimensionEvidenceMap,
    phaseBreakdown,
  });
  const dimensionScores = (Object.keys(publicScores) as PublicDimensionKey[]).map((key) => ({
    name: SMASH_PROFILE.dimensionLabels[key],
    score: publicScores[key],
    available: true,
    confidence: buildSmashDimensionEvidence(key, scores, poseResult.summary, poseResult.frameCount, computed).confidence,
    note: key === 'evidence_quality'
      ? '这项只表达证据是否足够稳定可读，不直接代表杀球动作好坏。'
      : confidenceScore < LOW_CONFIDENCE_THRESHOLD
        ? '这项动作分可作为方向参考，但请结合当前证据置信度一起解读。'
        : '这项分数更偏向杀球动作质量判断，不会因为机位问题被直接写差。',
  }));

  const issues: ShadowReportResult['issues'] = rankedIssues.length > 0
    ? rankedIssues.slice(0, 3).map(({ severity: _severity, rankingBucket: _rankingBucket, leadSuggestion: _leadSuggestion, captureSuggestion: _captureSuggestion, ...issue }) => issue)
    : [{
      title: '当前杀球动作框架和证据质量都比较稳定',
      description: `当前识别为${recognitionContext.viewLabel}视角，系统能稳定看到身体加载、挥拍臂加载和击球连贯性都没有明显短板。`,
      impact: '接下来更值得继续验证的是，能不能在同机位下把这套杀球节奏持续复现出来。',
      issueType: 'action_gap',
      issueCategory: 'smash_contact_timing_gap',
      targetDimensionKey: 'swing_repeatability',
      confidenceImpact: 'low',
      observation: `当前识别为${recognitionContext.viewLabel}视角，系统能稳定看到身体加载、挥拍臂加载和击球连贯性都没有明显短板。`,
      whyItMatters: '接下来更值得继续验证的是，能不能在同机位下把这套杀球节奏持续复现出来。',
      nextTrainingFocus: '下一次训练先不要额外加新改动，继续用同一节奏把当前杀球框架稳定复现出来。',
    }];

  const fallbacksUsed = [
    ...computed.bodyPreparationGroup.fallbacks,
    ...computed.racketArmPreparationGroup.fallbacks,
    ...(computed.swingRepeatabilityFallbackUsed ? ['smash_phase_repeatability_fallback'] : []),
  ].filter((item): item is string => Boolean(item));

  return {
    taskId: task.taskId,
    actionType: 'smash',
    totalScore: totalScoreBreakdown.finalTotalScore,
    confidenceScore,
    summaryText: buildSmashSummaryText(rankedIssues, confidenceScore, poseResult.summary, poseResult.frameCount),
    dimensionScores,
    issues,
    suggestions: buildSmashSuggestions(recognitionContext, rankedIssues),
    compareSummary: buildSmashCompareSummary(recognitionContext, confidenceScore, rankedIssues),
    retestAdvice: buildSmashRetestAdvice(recognitionContext, confidenceScore, rankedIssues),
    evidenceNotes,
    createdAt: now(),
    poseBased: true,
    swingSegments: task.artifacts.preprocess?.artifacts?.swingSegments,
    recommendedSegmentId: task.artifacts.preprocess?.artifacts?.recommendedSegmentId,
    segmentDetectionVersion: task.artifacts.preprocess?.artifacts?.segmentDetectionVersion,
    segmentSelectionMode: task.artifacts.preprocess?.artifacts?.segmentSelectionMode,
    selectedSegmentId: task.artifacts.preprocess?.artifacts?.selectedSegmentId,
    recognitionContext,
    phaseBreakdown,
    visualEvidence,
    standardComparison: buildSmashStandardComparison(rankedIssues, poseResult.summary),
    scoringEvidence: {
      scoringModelVersion: SMASH_PROFILE.scoringModelVersion,
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
