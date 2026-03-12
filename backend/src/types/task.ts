export type {
  ActionType,
  CreateTaskRequest,
  CreateTaskResponse,
  ComparisonResponse,
  DimensionScore,
  FlowErrorCode,
  HistoryDetailResponse,
  HistoryListQuery,
  HistoryListResponse,
  IssueItem,
  PoseAnalysisResult,
  PoseFrameMetrics,
  PoseFrameResult,
  PoseInfo,
  PoseKeypoint,
  PoseOverallSummary,
  PoseStatus,
  PreprocessArtifacts,
  PreprocessFrameItem,
  PreprocessInfo,
  PreprocessStatus,
  ReportResult,
  RetestCoachReview,
  RetestComparison,
  RetestDeltaItem,
  StandardComparison,
  StandardPhaseFrame,
  StandardReferenceFrame,
  SuggestionItem,
  TaskHistoryItem,
  TaskStatus,
  TaskStatusResponse,
  UploadTaskResponse,
  VideoMetadata,
} from '../../../shared/contracts';
import type { ActionType, FlowErrorCode, PoseInfo, PreprocessInfo, TaskStatus } from '../../../shared/contracts';

export interface TaskRecord {
  taskId: string;
  actionType: ActionType;
  status: TaskStatus;
  fileName?: string;
  mimeType?: string;
  uploadPath?: string;
  resultPath?: string;
  errorCode?: FlowErrorCode;
  preprocess?: PreprocessInfo;
  pose?: PoseInfo;
  previousCompletedTaskId?: string;
  createdAt: string;
  updatedAt: string;
}
