import type {
  AnalysisTaskRecord,
  DominantRacketSide,
  FlowErrorCode,
  PoseAnalysisResult,
  RecognitionContext,
  ReportPhaseAssessment,
  ReportPhaseAssessmentStatus,
  ReportPhaseKey,
  ViewProfile,
  VisualEvidence,
} from '../types/task'

type WeightedFeature = {
  key: string
  value: number | null
  weight: number
}

const MIN_SOFT_COVERAGE_FRAME_COUNT = 5
const MIN_SOFT_COVERAGE_RATIO = 0.5
const MIN_SOFT_COVERAGE_STABILITY = 0.6

export const VIEW_PROFILE_LABELS: Record<ViewProfile, string> = {
  rear: '后方',
  rear_left_oblique: '左后斜',
  rear_right_oblique: '右后斜',
  left_side: '左侧面',
  right_side: '右侧面',
  front_left_oblique: '左前斜',
  front_right_oblique: '右前斜',
  front: '正面',
  unknown: '未确定',
}

export const RACKET_SIDE_LABELS: Record<DominantRacketSide, string> = {
  left: '左手挥拍侧',
  right: '右手挥拍侧',
  unknown: '挥拍侧未确定',
}

export const FRONT_VIEW_PROFILES = new Set<ViewProfile>(['front', 'front_left_oblique', 'front_right_oblique'])

export const HARD_REJECT_REASONS = new Set<FlowErrorCode>([
  'body_not_detected',
  'subject_too_small_or_cropped',
  'poor_lighting_or_occlusion',
])

export function now() {
  return new Date().toISOString()
}

export function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function clampUnit(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

export function roundDebugValue(value: number, digits = 4) {
  return Number(value.toFixed(digits))
}

export function getViewLabel(viewProfile?: ViewProfile) {
  return VIEW_PROFILE_LABELS[viewProfile ?? 'unknown'] ?? VIEW_PROFILE_LABELS.unknown
}

export function getRacketSideLabel(dominantRacketSide?: DominantRacketSide) {
  return RACKET_SIDE_LABELS[dominantRacketSide ?? 'unknown'] ?? RACKET_SIDE_LABELS.unknown
}

export function getFeatureSummary(summary: PoseAnalysisResult['summary'], key: string) {
  return summary.specializedFeatureSummary?.[key]
}

export function uniqueReasons(reasons: FlowErrorCode[]) {
  return [...new Set(reasons)]
}

export function addLowConfidenceReason(reasons: FlowErrorCode[], notes: string[], code: FlowErrorCode, note: string) {
  reasons.push(code)
  notes.push(note)
}

function shouldDowngradeCoverageFailure(summary: PoseAnalysisResult['summary']) {
  return summary.usableFrameCount >= MIN_SOFT_COVERAGE_FRAME_COUNT
    && summary.coverageRatio >= MIN_SOFT_COVERAGE_RATIO
    && summary.medianStabilityScore >= MIN_SOFT_COVERAGE_STABILITY
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
    )
    return
  }

  hardRejectReasons.push('insufficient_pose_coverage')
}

export function getAnalysisDisposition(poseResult: PoseAnalysisResult) {
  const hardRejectReasons: FlowErrorCode[] = []
  const lowConfidenceReasons: FlowErrorCode[] = []
  const confidencePenaltyNotes: string[] = []

  for (const reason of poseResult.summary.rejectionReasons) {
    if (reason === 'insufficient_pose_coverage') {
      classifyCoverageReason(poseResult.summary, hardRejectReasons, lowConfidenceReasons, confidencePenaltyNotes)
      continue
    }

    if (HARD_REJECT_REASONS.has(reason)) {
      hardRejectReasons.push(reason)
      continue
    }

    lowConfidenceReasons.push(reason)
  }

  const viewProfile = poseResult.summary.viewProfile ?? 'unknown'
  const unknownViewCount = poseResult.summary.debugCounts?.unknownViewCount ?? 0
  const usableFrameCount = Math.max(1, poseResult.summary.usableFrameCount)
  const unknownViewRatio = unknownViewCount / usableFrameCount
  const weakViewConfidence = (poseResult.summary.viewConfidence ?? 0) < 0.62
  const frontOrUnknownView = FRONT_VIEW_PROFILES.has(viewProfile) || viewProfile === 'unknown'

  if (frontOrUnknownView || weakViewConfidence || unknownViewRatio >= 0.45) {
    addLowConfidenceReason(
      lowConfidenceReasons,
      confidencePenaltyNotes,
      'invalid_camera_angle',
      '当前机位降低了置信度，但不直接代表动作更差。',
    )
  }

  if (poseResult.summary.scoreVariance >= 0.03 && poseResult.summary.coverageRatio >= 0.6) {
    addLowConfidenceReason(
      lowConfidenceReasons,
      confidencePenaltyNotes,
      'insufficient_action_evidence',
      '当前样本复现证据偏散，建议同机位再录一条确认动作是否稳定。',
    )
  }

  return {
    hardRejectReasons: uniqueReasons(hardRejectReasons),
    lowConfidenceReasons: uniqueReasons(lowConfidenceReasons),
    confidencePenaltyNotes: [...new Set(confidencePenaltyNotes)],
  }
}

export function buildRecognitionContext(summary: PoseAnalysisResult['summary'], engine: string): RecognitionContext {
  return {
    viewProfile: summary.viewProfile,
    viewLabel: getViewLabel(summary.viewProfile),
    viewConfidence: summary.viewConfidence,
    dominantRacketSide: summary.dominantRacketSide,
    dominantRacketSideLabel: getRacketSideLabel(summary.dominantRacketSide),
    racketSideConfidence: summary.racketSideConfidence,
    engine,
  }
}

export function buildVisualEvidence(task: AnalysisTaskRecord, poseResult: PoseAnalysisResult): VisualEvidence {
  const sampledFrames = task.artifacts.preprocess?.artifacts?.sampledFrames ?? []
  const frameMap = new Map(poseResult.frames.map((frame) => [frame.frameIndex, frame]))
  const bestFrameIndex = poseResult.summary.bestFrameIndex ?? sampledFrames[0]?.index ?? null
  const bestRawFrame = sampledFrames.find((item) => item.index === bestFrameIndex) ?? sampledFrames[0]
  const bestPoseFrame = bestFrameIndex !== null && bestFrameIndex !== undefined ? frameMap.get(bestFrameIndex) : undefined

  return {
    bestFrameIndex,
    bestFrameImagePath: bestRawFrame?.relativePath,
    bestFrameOverlayPath: poseResult.summary.bestFrameOverlayRelativePath ?? bestPoseFrame?.overlayRelativePath,
    overlayFrames: sampledFrames.map((frame) => {
      const poseFrame = frameMap.get(frame.index)
      return {
        index: frame.index,
        timestampSeconds: frame.timestampSeconds,
        rawImagePath: frame.relativePath,
        overlayImagePath: poseFrame?.overlayRelativePath,
        status: poseFrame?.status,
      }
    }),
  }
}

export function buildFeatureGroupScore(
  features: WeightedFeature[],
  fallbackScore: number,
  fallbackLabel: string,
  scoreFormula: string,
  fallbackFormula: string,
) {
  const available = features.filter((feature) => typeof feature.value === 'number')
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
    }
  }

  const totalWeight = available.reduce((sum, feature) => sum + feature.weight, 0)
  const normalizedScore = totalWeight > 0
    ? available.reduce((sum, feature) => sum + (feature.value ?? 0) * feature.weight, 0) / totalWeight
    : 0
  const observableCoverage = features.length > 0 ? available.length / features.length : 0
  const inputs = Object.fromEntries(features.map((feature) => [feature.key, feature.value === null ? null : roundDebugValue(feature.value)]))

  return {
    score: clampScore(25 + normalizedScore * 75),
    normalizedScore,
    observableCoverage,
    source: available.map((feature) => `${feature.key}=${roundDebugValue(feature.value ?? 0)}`).join(', '),
    formula: scoreFormula,
    inputs,
    fallbacks: [],
    usedFallback: false,
  }
}

export function getDetectedPhaseScore(candidate?: NonNullable<PoseAnalysisResult['summary']['phaseCandidates']>[ReportPhaseKey]) {
  if (!candidate || candidate.detectionStatus !== 'detected' || typeof candidate.score !== 'number') {
    return null
  }
  return candidate.score
}

export function buildDimensionEvidenceMap<T extends { key: string }>(entries: T[]) {
  return new Map(entries.map((entry) => [entry.key, entry]))
}

export function compactEvidenceRefs<T>(...refs: Array<T | undefined>) {
  return refs.filter((ref): ref is T => Boolean(ref))
}

export function toDimensionEvidenceRef(entry?: {
  key: string
  label: string
  score: number
  confidence?: number | null
  source: string
}) {
  if (!entry) return undefined
  return {
    dimensionKey: entry.key,
    label: entry.label,
    score: entry.score,
    confidence: entry.confidence ?? null,
    reference: entry.source,
  }
}

export function toFeatureEvidenceRef(feature?: {
  key: string
  label: string
  value: number | null
  observableCoverage?: number
  reference?: string
}) {
  if (!feature) return undefined
  return {
    featureKey: feature.key,
    label: feature.label,
    score: feature.value === null ? null : clampScore(feature.value * 100),
    confidence: feature.observableCoverage ?? null,
    reference: feature.reference,
  }
}

export function getPhaseCandidate(summary: PoseAnalysisResult['summary'], phaseKey: ReportPhaseKey) {
  return summary.phaseCandidates?.[phaseKey]
}

export function getPhaseDetectedFrom(summary: PoseAnalysisResult['summary'], phaseKey: ReportPhaseKey) {
  const candidate = getPhaseCandidate(summary, phaseKey)
  if (!candidate) return undefined
  return {
    anchorFrameIndex: candidate.anchorFrameIndex,
    windowStartFrameIndex: candidate.windowStartFrameIndex,
    windowEndFrameIndex: candidate.windowEndFrameIndex,
    sourceMetric: candidate.sourceMetric,
    detectionStatus: candidate.detectionStatus,
    missingReason: candidate.missingReason,
  }
}

export function buildPhaseAssessment(
  phaseKey: ReportPhaseKey,
  label: string,
  status: ReportPhaseAssessmentStatus,
  summaryText: string,
  summary: PoseAnalysisResult['summary'],
  evidenceRefs: Array<{
    label?: string
    score?: number | null
  }>,
): ReportPhaseAssessment {
  return {
    phaseKey,
    label,
    status,
    summary: summaryText,
    evidenceRefs,
    detectedFrom: getPhaseDetectedFrom(summary, phaseKey),
  }
}

export function buildEvidenceSentence<T extends { label?: string; score?: number | null }>(
  evidenceRefs: T[],
  formatScore: (score?: number | null) => string,
) {
  const refs = evidenceRefs
    .filter((ref) => ref.label)
    .slice(0, 2)
    .map((ref) => `${ref.label} ${formatScore(ref.score)}`)

  return refs.length > 0 ? `当前证据更直接落在 ${refs.join('、')}。` : ''
}

export function getWeakestFeature<T extends { value: number | null }>(features: T[]) {
  const available = features.filter((feature) => typeof feature.value === 'number')
  if (available.length > 0) {
    return [...available].sort((left, right) => (left.value ?? 1) - (right.value ?? 1))[0]
  }
  return features[0]
}

export function shouldSuggestCaptureAdvice(
  confidenceScore: number,
  cameraSuitability: number,
  dimensionConfidence?: number | null,
  lowConfidenceThreshold = 70,
) {
  return confidenceScore < lowConfidenceThreshold
    || cameraSuitability < 70
    || (dimensionConfidence ?? 1) < 0.68
}

export function buildSuggestionDraft<T extends { ruleKey: string; suggestionType: string }>(
  ruleKey: T['ruleKey'],
  suggestionType: T['suggestionType'],
  suggestion: Omit<T, 'ruleKey' | 'suggestionType'>,
): T {
  return {
    ...suggestion,
    ruleKey,
    suggestionType,
  } as T
}
