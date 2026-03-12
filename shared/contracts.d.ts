export type ActionType = 'clear' | 'smash';

export type ErrorCategory =
  | 'request_validation'
  | 'domain_state'
  | 'media_validation'
  | 'pipeline_execution'
  | 'internal_recovery';

export type FlowErrorCode =
  | 'invalid_action_type'
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
  | 'poor_lighting_or_occlusion'
  | 'invalid_camera_angle'
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
}

export interface IssueItem {
  title: string;
  description: string;
  impact: string;
}

export interface SuggestionItem {
  title: string;
  description: string;
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

export interface PreprocessArtifacts {
  normalizedFileName: string;
  metadataExtractedAt: string;
  artifactsDir: string;
  manifestPath: string;
  framePlan: {
    strategy: string;
    targetFrameCount: number;
    sampleTimestamps: number[];
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
  artifacts?: PreprocessArtifacts;
}

export interface PoseKeypoint {
  name: string;
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrameMetrics {
  stabilityScore: number;
  shoulderSpan: number | null;
  hipSpan: number | null;
  bodyTurnScore: number | null;
  racketArmLiftScore: number | null;
  summaryText: string;
}

export interface PoseFrameResult {
  frameIndex: number;
  fileName: string;
  status: string;
  keypoints: PoseKeypoint[];
  metrics: PoseFrameMetrics | null;
}

export interface PoseOverallSummary {
  bestFrameIndex: number | null;
  stableFrameCount: number;
  avgStabilityScore: number;
  avgBodyTurnScore: number;
  avgRacketArmLiftScore: number;
  humanSummary: string;
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
    bestFrameIndex?: number | null;
    humanSummary?: string;
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
  standardReference: StandardReferenceFrame;
  phaseFrames?: StandardPhaseFrame[];
  differences: string[];
}

export interface ReportResult {
  taskId: string;
  actionType: ActionType;
  totalScore: number;
  summaryText?: string;
  dimensionScores: DimensionScore[];
  issues: IssueItem[];
  suggestions: SuggestionItem[];
  compareSummary?: string;
  retestAdvice: string;
  createdAt?: string;
  poseBased?: boolean;
  standardComparison?: StandardComparison;
  scoringEvidence?: {
    detectedFrameCount?: number;
    frameCount?: number;
    avgStabilityScore?: number;
    avgBodyTurnScore?: number;
    avgRacketArmLiftScore?: number;
    bestFrameIndex?: number | null;
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
}

export interface CreateTaskRequest {
  actionType: ActionType;
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
  comparison: RetestComparison;
}
