export type TaskStatus = 'created' | 'uploaded' | 'processing' | 'completed' | 'failed';

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

export interface ReportResult {
  taskId: string;
  actionType: string;
  totalScore: number;
  dimensionScores: DimensionScore[];
  issues: IssueItem[];
  suggestions: SuggestionItem[];
  retestAdvice: string;
}

export interface TaskRecord {
  taskId: string;
  actionType: string;
  status: TaskStatus;
  fileName?: string;
  uploadPath?: string;
  resultPath?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}