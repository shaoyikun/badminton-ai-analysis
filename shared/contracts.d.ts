export type ActionType = 'clear' | 'smash';

export type ErrorCategory =
  | 'request_validation'
  | 'domain_state'
  | 'media_validation'
  | 'pipeline_execution'
  | 'internal_recovery';

export type FlowErrorCode =
  | 'invalid_action_type'
  | 'unsupported_action_scope'
  | 'file_required'
  | 'task_not_found'
  | 'invalid_task_state'
  | 'result_not_ready'
  | 'comparison_action_mismatch'
  | 'unsupported_file_type'
  | 'upload_failed'
  | 'invalid_duration'
  | 'multi_person_detected'
  | 'body_not_detected'
  | 'subject_too_small_or_cropped'
  | 'poor_lighting_or_occlusion'
  | 'invalid_camera_angle'
  | 'insufficient_pose_coverage'
  | 'insufficient_action_evidence'
  | 'preprocess_failed'
  | 'pose_failed'
  | 'report_generation_failed'
  | 'task_recovery_failed'
  | 'internal_error';

export type FlowActionTarget = 'upload' | 'guide';

export type TaskStatus = 'created' | 'uploaded' | 'processing' | 'completed' | 'failed';
export type TaskStage =
  | 'upload_pending'
  | 'uploaded'
  | 'validating'
  | 'extracting_frames'
  | 'estimating_pose'
  | 'generating_report'
  | 'completed'
  | 'failed';

export type PreprocessStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
export type PoseStatus = 'idle' | 'processing' | 'completed' | 'failed';
export type ViewProfile =
  | 'rear'
  | 'rear_left_oblique'
  | 'rear_right_oblique'
  | 'left_side'
  | 'right_side'
  | 'front_left_oblique'
  | 'front_right_oblique'
  | 'front'
  | 'unknown';

export type DominantRacketSide = 'left' | 'right' | 'unknown';

export interface UploadConstraints {
  minDurationSeconds: number;
  maxDurationSeconds: number;
  minFileSizeBytes: number;
  defaultMaxFileSizeBytes: number;
  minWidth: number;
  minHeight: number;
  supportedExtensions: string[];
  recommendedAngles: string[];
  supportedActionLabels: Record<ActionType, string>;
  captureChecklist: string[];
}

export interface FlowErrorCatalogItem {
  title: string;
  summary: string;
  explanation: string;
  suggestions: string[];
  uploadBanner: string;
  primaryAction: FlowActionTarget;
  secondaryAction: FlowActionTarget;
}

export interface UploadFlowConfig {
  constraints: UploadConstraints;
  errorCatalog: Record<string, FlowErrorCatalogItem>;
}

export interface ErrorSnapshot {
  code: FlowErrorCode;
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  occurredAt: string;
}

export interface ErrorResponse {
  error: ErrorSnapshot;
}

export interface DimensionScore {
  name: string;
  score: number;
  available?: boolean;
  confidence?: number;
  note?: string;
}

export interface ReportEvidenceRef {
  dimensionKey?: string;
  featureKey?: string;
  label?: string;
  score?: number | null;
  confidence?: number | null;
  reference?: string;
}

export interface IssueItem {
  title: string;
  description: string;
  impact: string;
  issueType?: 'action_gap' | 'evidence_gap';
  issueCategory?: string;
  targetDimensionKey?: string;
  confidenceImpact?: 'low' | 'medium' | 'high';
  observation?: string;
  whyItMatters?: string;
  nextTrainingFocus?: string;
  captureAdvice?: string;
  evidenceRefs?: ReportEvidenceRef[];
}

export interface SuggestionItem {
  title: string;
  description: string;
  suggestionType?: 'capture_fix' | 'technique_focus' | 'retest_check';
  targetDimensionKey?: string;
  recommendedNextCapture?: string;
  focusPoint?: string;
  linkedIssueCategory?: string;
  evidenceRefs?: ReportEvidenceRef[];
}

export interface VideoMetadata {
  fileName: string;
  fileSizeBytes: number;
  mimeType?: string;
  extension?: string;
  durationSeconds?: number;
  estimatedFrames?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  metadataSource?: 'mock-estimate' | 'ffprobe' | 'manual';
}

export interface PreprocessFrameItem {
  index: number;
  timestampSeconds: number;
  fileName: string;
  relativePath: string;
}

export type SwingSegmentQualityFlag =
  | 'motion_too_weak'
  | 'too_short'
  | 'too_long'
  | 'edge_clipped_start'
  | 'edge_clipped_end'
  | 'subject_maybe_small'
  | 'motion_maybe_occluded';

export interface SwingSegmentCandidate {
  segmentId: string;
  startTimeMs: number;
  endTimeMs: number;
  startFrame?: number;
  endFrame?: number;
  durationMs: number;
  motionScore: number;
  confidence: number;
  rankingScore: number;
  coarseQualityFlags: SwingSegmentQualityFlag[];
  detectionSource: 'coarse_motion_scan_v1';
}

export interface SegmentSelectionWindow {
  startTimeMs: number;
  endTimeMs: number;
  startFrame?: number;
  endFrame?: number;
}

export type SegmentSelectionMode = 'auto_recommended' | 'full_video_fallback';

export interface SegmentScanSummary {
  status: 'completed';
  segmentDetectionVersion: string;
  swingSegments: SwingSegmentCandidate[];
  recommendedSegmentId: string;
  selectedSegmentId?: string;
  segmentSelectionMode?: SegmentSelectionMode;
}

export interface PreprocessArtifacts {
  normalizedFileName: string;
  metadataExtractedAt: string;
  artifactsDir: string;
  manifestPath: string;
  segmentDetectionVersion?: string;
  swingSegments?: SwingSegmentCandidate[];
  recommendedSegmentId?: string;
  segmentSelectionMode?: SegmentSelectionMode;
  selectedSegmentId?: string;
  framePlan: {
    strategy: string;
    targetFrameCount: number;
    sampleTimestamps: number[];
    sourceWindow?: SegmentSelectionWindow;
  };
  sampledFrames: PreprocessFrameItem[];
}

export interface PreprocessInfo {
  status: PreprocessStatus;
  startedAt?: string;
  completedAt?: string;
  errorCode?: FlowErrorCode;
  errorMessage?: string;
  metadata?: VideoMetadata;
  segmentScan?: SegmentScanSummary;
  artifacts?: PreprocessArtifacts;
}

export interface PoseKeypoint {
  name: string;
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseSpecializedFrameMetrics {
  shoulderHipRotationScore: number | null;
  trunkCoilScore: number | null;
  sideOnReadinessScore: number | null;
  chestOpeningScore: number | null;
  elbowExtensionScore: number | null;
  hittingArmPreparationScore: number | null;
  racketSideElbowHeightScore: number | null;
  wristAboveShoulderConfidence: number | null;
  headStabilityScore: number | null;
  contactPreparationScore: number | null;
  nonRacketArmBalanceScore: number | null;
}

export interface PoseFeatureObservability {
  observable: boolean;
  reasons: string[];
}

export interface PoseSpecializedDebug {
  selectedRacketSide?: DominantRacketSide;
  selectedRacketSideSource?: string;
  observability?: Record<string, PoseFeatureObservability>;
  components?: Record<string, unknown>;
}

export interface PoseSpecializedFeatureSummaryItem {
  median: number | null;
  peak: number | null;
  observableFrameCount: number;
  observableCoverage: number;
  peakFrameIndex: number | null;
}

export type PosePhaseDetectionStatus = 'detected' | 'missing';

export type PosePhaseMissingReason =
  | 'no_usable_frames'
  | 'insufficient_preparation_evidence'
  | 'no_pre_contact_frames'
  | 'contact_not_separable'
  | 'no_post_contact_frames';

export type PosePhaseSourceMetric =
  | 'contactPreparationScore'
  | 'hittingArmPreparationScore'
  | 'compositeScore'
  | 'bestFrameIndex'
  | 'postContactMotionScore';

export interface PosePhaseCandidate {
  anchorFrameIndex: number | null;
  windowStartFrameIndex: number | null;
  windowEndFrameIndex: number | null;
  score: number | null;
  sourceMetric: PosePhaseSourceMetric;
  detectionStatus: PosePhaseDetectionStatus;
  missingReason?: PosePhaseMissingReason;
}

export interface PosePhaseCandidates {
  preparation: PosePhaseCandidate;
  backswing: PosePhaseCandidate;
  contactCandidate: PosePhaseCandidate;
  followThrough: PosePhaseCandidate;
}

export interface PoseFrameMetrics {
  stabilityScore: number;
  shoulderSpan: number | null;
  hipSpan: number | null;
  bodyTurnScore: number | null;
  racketArmLiftScore: number | null;
  specialized?: PoseSpecializedFrameMetrics;
  subjectScale?: number | null;
  compositeScore?: number;
  debug?: {
    torsoHeight?: number | null;
    shoulderDepthGap?: number | null;
    hipDepthGap?: number | null;
    leftArmLiftScore?: number | null;
    rightArmLiftScore?: number | null;
    visibilities?: Record<string, number>;
    subjectScaleSource?: {
      dominantMetric?: 'shoulderSpan' | 'hipSpan' | 'torsoHeight' | 'unknown';
      values?: {
        shoulderSpan?: number | null;
        hipSpan?: number | null;
        torsoHeight?: number | null;
      };
    };
    frameInference?: {
      viewProfile?: ViewProfile;
      viewConfidence?: number;
      dominantRacketSide?: DominantRacketSide;
      racketSideConfidence?: number;
    };
    specialized?: PoseSpecializedDebug;
    statusReasons?: string[];
  };
  summaryText: string;
}

export interface PoseFrameResult {
  frameIndex: number;
  fileName: string;
  status: string;
  keypoints: PoseKeypoint[];
  metrics: PoseFrameMetrics | null;
  overlayRelativePath?: string;
  viewProfile?: ViewProfile;
  viewConfidence?: number;
  dominantRacketSide?: DominantRacketSide;
  racketSideConfidence?: number;
}

export interface PoseRejectionReasonDetail {
  code: FlowErrorCode;
  triggered: boolean;
  observed: number | string | boolean | null | Record<string, number | string | boolean | null>;
  threshold: number | string | boolean | null | Record<string, number | string | boolean | null>;
  comparator: string;
  explanation: string;
}

export interface PoseOverallSummary {
  bestFrameIndex: number | null;
  bestPreparationFrameIndex?: number | null;
  phaseCandidates?: PosePhaseCandidates;
  usableFrameCount: number;
  coverageRatio: number;
  medianStabilityScore: number;
  medianBodyTurnScore: number;
  medianRacketArmLiftScore: number;
  scoreVariance: number;
  temporalConsistency?: number;
  motionContinuity?: number;
  rejectionReasons: FlowErrorCode[];
  rejectionReasonDetails?: PoseRejectionReasonDetail[];
  humanSummary: string;
  viewProfile?: ViewProfile;
  viewConfidence?: number;
  viewStability?: number;
  dominantRacketSide?: DominantRacketSide;
  racketSideConfidence?: number;
  specializedFeatureSummary?: Record<string, PoseSpecializedFeatureSummaryItem>;
  bestFrameOverlayRelativePath?: string;
  overlayFrameCount?: number;
  debugCounts?: {
    tooSmallCount?: number;
    lowStabilityCount?: number;
    unknownViewCount?: number;
    usableFrameCount?: number;
    detectedFrameCount?: number;
  };
}

export interface PoseAnalysisResult {
  engine: string;
  frameCount: number;
  detectedFrameCount: number;
  summary: PoseOverallSummary;
  frames: PoseFrameResult[];
}

export interface PoseInfo {
  status: PoseStatus;
  startedAt?: string;
  completedAt?: string;
  errorCode?: FlowErrorCode;
  errorMessage?: string;
  resultPath?: string;
  summary?: {
    engine: string;
    frameCount: number;
    detectedFrameCount: number;
    usableFrameCount?: number;
    coverageRatio?: number;
    bestFrameIndex?: number | null;
    bestPreparationFrameIndex?: number | null;
    phaseCandidates?: PosePhaseCandidates;
    medianStabilityScore?: number;
    medianBodyTurnScore?: number;
    medianRacketArmLiftScore?: number;
    scoreVariance?: number;
    temporalConsistency?: number;
    motionContinuity?: number;
    rejectionReasons?: FlowErrorCode[];
    rejectionReasonDetails?: PoseRejectionReasonDetail[];
    humanSummary?: string;
    viewProfile?: ViewProfile;
    viewConfidence?: number;
    viewStability?: number;
    dominantRacketSide?: DominantRacketSide;
    racketSideConfidence?: number;
    specializedFeatureSummary?: Record<string, PoseSpecializedFeatureSummaryItem>;
    bestFrameOverlayRelativePath?: string;
    overlayFrameCount?: number;
    debugCounts?: {
      tooSmallCount?: number;
      lowStabilityCount?: number;
      unknownViewCount?: number;
      usableFrameCount?: number;
      detectedFrameCount?: number;
    };
  };
}

export interface RetestDeltaItem {
  name: string;
  previousScore: number;
  currentScore: number;
  delta: number;
}

export interface RetestCoachReview {
  headline: string;
  progressNote: string;
  keepDoing?: string;
  regressionNote?: string;
  nextFocus: string;
  nextCheck: string;
  focusDimensions?: string[];
}

export type ReportPhaseKey = 'preparation' | 'backswing' | 'contactCandidate' | 'followThrough';

export type ReportPhaseAssessmentStatus = 'ok' | 'attention' | 'insufficient_evidence';

export interface ReportPhaseAssessment {
  phaseKey: ReportPhaseKey;
  label: string;
  status: ReportPhaseAssessmentStatus;
  summary: string;
  evidenceRefs?: ReportEvidenceRef[];
  detectedFrom?: {
    anchorFrameIndex?: number | null;
    windowStartFrameIndex?: number | null;
    windowEndFrameIndex?: number | null;
    sourceMetric?: PosePhaseSourceMetric;
    detectionStatus?: PosePhaseDetectionStatus;
    missingReason?: PosePhaseMissingReason;
  };
}

export interface ReportPhaseDelta {
  phaseKey: ReportPhaseKey;
  label: string;
  previousStatus: ReportPhaseAssessmentStatus;
  currentStatus: ReportPhaseAssessmentStatus;
  changed: boolean;
  summary: string;
}

export interface RetestComparison {
  previousTaskId: string;
  previousCreatedAt?: string;
  currentTaskId: string;
  currentCreatedAt?: string;
  totalScoreDelta: number;
  improvedDimensions: RetestDeltaItem[];
  declinedDimensions: RetestDeltaItem[];
  unchangedDimensions: RetestDeltaItem[];
  phaseDeltas: ReportPhaseDelta[];
  summaryText: string;
  coachReview: RetestCoachReview;
}

export interface TaskHistoryItem {
  taskId: string;
  actionType: ActionType;
  createdAt?: string;
  completedAt: string;
  totalScore?: number;
  summaryText?: string;
  poseBased?: boolean;
}

export interface StandardReferenceFrame {
  title: string;
  cue: string;
  imageLabel: string;
  imagePath?: string;
  sourceType?: 'illustration' | 'real-sample';
}

export interface StandardPhaseFrame {
  phase: string;
  title: string;
  imagePath: string;
  cue: string;
}

export interface StandardComparison {
  sectionTitle: string;
  summaryText: string;
  currentFrameLabel: string;
  standardFrameLabel: string;
  viewProfile?: ViewProfile;
  standardReference: StandardReferenceFrame;
  phaseFrames?: StandardPhaseFrame[];
  differences: string[];
}

export interface RecognitionContext {
  viewProfile?: ViewProfile;
  viewLabel: string;
  viewConfidence?: number;
  dominantRacketSide?: DominantRacketSide;
  dominantRacketSideLabel: string;
  racketSideConfidence?: number;
  engine?: string;
}

export interface VisualEvidenceFrame {
  index: number;
  timestampSeconds?: number;
  rawImagePath?: string;
  overlayImagePath?: string;
  status?: string;
}

export interface VisualEvidence {
  bestFrameIndex?: number | null;
  bestFrameImagePath?: string;
  bestFrameOverlayPath?: string;
  overlayFrames: VisualEvidenceFrame[];
}

export interface ReportResult {
  taskId: string;
  actionType: ActionType;
  totalScore: number;
  confidenceScore?: number;
  summaryText?: string;
  dimensionScores: DimensionScore[];
  issues: IssueItem[];
  suggestions: SuggestionItem[];
  compareSummary?: string;
  retestAdvice: string;
  evidenceNotes?: string[];
  createdAt?: string;
  poseBased?: boolean;
  swingSegments?: SwingSegmentCandidate[];
  recommendedSegmentId?: string;
  segmentDetectionVersion?: string;
  segmentSelectionMode?: SegmentSelectionMode;
  selectedSegmentId?: string;
  recognitionContext?: RecognitionContext;
  phaseBreakdown?: ReportPhaseAssessment[];
  visualEvidence?: VisualEvidence;
  standardComparison?: StandardComparison;
  scoringEvidence?: {
    scoringModelVersion?: string;
    analysisDisposition?: 'rejected' | 'low_confidence' | 'analyzable';
    frameCount?: number;
    detectedFrameCount?: number;
    usableFrameCount?: number;
    coverageRatio?: number;
    medianStabilityScore?: number;
    medianBodyTurnScore?: number;
    medianRacketArmLiftScore?: number;
    scoreVariance?: number;
    temporalConsistency?: number;
    motionContinuity?: number;
    bestFrameIndex?: number | null;
    rejectionReasons?: FlowErrorCode[];
    dimensionScoresByKey?: Record<string, number>;
    cameraSuitability?: number;
    fallbacksUsed?: string[];
    confidenceBreakdown?: {
      rawConfidenceScore?: number;
      finalConfidenceScore?: number;
      evidenceQuality?: number;
      cameraSuitability?: number;
      observabilityScore?: number;
      contributions?: Array<{
        key: string;
        label: string;
        score: number;
        weight: number;
        weightedScore: number;
      }>;
      penalties?: Array<{
        key: string;
        label: string;
        amount: number;
        reason: string;
      }>;
    };
    rejectionDecision?: {
      hardRejectReasons?: FlowErrorCode[];
      lowConfidenceReasons?: FlowErrorCode[];
      confidencePenaltyNotes?: string[];
    };
    metricScores?: Record<string, number>;
    totalScoreBreakdown?: {
      rawWeightedTotal?: number;
      finalTotalScore?: number;
      contributions?: Array<{
        key: string;
        label: string;
        score: number;
        weight: number;
        weightedScore: number;
      }>;
    };
    dimensionEvidence?: Array<{
      key: string;
      label: string;
      score: number;
      available?: boolean;
      confidence?: number;
      source: string;
      inputs?: Record<string, number | string | boolean | null>;
      formula?: string;
      adjustments?: Record<string, number | string | boolean | null>;
      fallbacks?: string[];
    }>;
    humanSummary?: string;
  };
  preprocess?: {
    metadata?: VideoMetadata;
    artifacts?: PreprocessArtifacts;
  };
}

export interface TaskResource {
  taskId: string;
  actionType: ActionType;
  status: TaskStatus;
  stage: TaskStage;
  progressPercent: number;
  error?: ErrorSnapshot;
  baselineTaskId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  segmentScan?: SegmentScanSummary;
}

export interface CreateTaskRequest {
  actionType: ActionType;
}

export interface StartTaskRequest {
  selectedSegmentId?: string;
}

export interface CreateTaskResponse extends TaskResource {}

export interface HistoryListQuery {
  actionType?: ActionType;
  cursor?: string;
  limit?: number;
}

export interface HistoryListResponse {
  items: TaskHistoryItem[];
  nextCursor?: string;
}

export interface UploadTaskResponse extends TaskResource {
  fileName?: string;
}

export interface TaskStatusResponse extends TaskResource {}

export interface HistoryDetailResponse {
  task: TaskResource;
  report: ReportResult;
}

export interface ComparisonResponse {
  currentTask: TaskResource;
  baselineTask: TaskResource;
  comparison: RetestComparison | null;
  unavailableReason?: 'scoring_model_mismatch';
}
