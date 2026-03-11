export type TaskStatus = 'created' | 'uploaded' | 'processing' | 'completed' | 'failed';
export type PreprocessStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
export type PoseStatus = 'idle' | 'processing' | 'completed' | 'failed';

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
  errorCode?: string;
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
  regressionNote?: string;
  nextFocus: string;
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
  actionType: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  totalScore?: number;
  summaryText?: string;
  poseBased?: boolean;
}

export interface StandardReferenceFrame {
  title: string;
  cue: string;
  imageLabel: string;
}

export interface StandardComparison {
  sectionTitle: string;
  summaryText: string;
  currentFrameLabel: string;
  standardFrameLabel: string;
  standardReference: StandardReferenceFrame;
  differences: string[];
}

export interface ReportResult {
  taskId: string;
  actionType: string;
  totalScore: number;
  summaryText?: string;
  dimensionScores: DimensionScore[];
  issues: IssueItem[];
  suggestions: SuggestionItem[];
  compareSummary?: string;
  retestAdvice: string;
  createdAt?: string;
  poseBased?: boolean;
  comparison?: RetestComparison;
  history?: TaskHistoryItem[];
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

export interface TaskRecord {
  taskId: string;
  actionType: string;
  status: TaskStatus;
  fileName?: string;
  mimeType?: string;
  uploadPath?: string;
  resultPath?: string;
  errorCode?: string;
  preprocess?: PreprocessInfo;
  pose?: PoseInfo;
  previousCompletedTaskId?: string;
  createdAt: string;
  updatedAt: string;
}
