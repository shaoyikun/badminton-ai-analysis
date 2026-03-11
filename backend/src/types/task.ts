export type TaskStatus = 'created' | 'uploaded' | 'processing' | 'completed' | 'failed';
export type PreprocessStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed';

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
  durationSeconds?: number;
  estimatedFrames?: number;
  width?: number;
  height?: number;
}

export interface PreprocessArtifacts {
  normalizedFileName: string;
  metadataExtractedAt: string;
  framePlan: {
    strategy: string;
    targetFrameCount: number;
    sampleTimestamps: number[];
  };
}

export interface PreprocessInfo {
  status: PreprocessStatus;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  metadata?: VideoMetadata;
  artifacts?: PreprocessArtifacts;
}

export interface ReportResult {
  taskId: string;
  actionType: string;
  totalScore: number;
  dimensionScores: DimensionScore[];
  issues: IssueItem[];
  suggestions: SuggestionItem[];
  compareSummary?: string;
  retestAdvice: string;
  createdAt?: string;
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
  createdAt: string;
  updatedAt: string;
}
