export type {
  ActionType,
  ComparisonResponse,
  CreateTaskRequest,
  CreateTaskResponse,
  DominantRacketSide,
  ErrorCategory,
  ErrorResponse,
  ErrorSnapshot,
  FlowErrorCode,
  HistoryDetailResponse,
  HistoryListQuery,
  HistoryListResponse,
  IssueItem,
  PoseAnalysisResult,
  PosePhaseCandidate,
  PosePhaseCandidates,
  PosePhaseDetectionStatus,
  PosePhaseMissingReason,
  PosePhaseSourceMetric,
  PoseFrameMetrics,
  PoseFrameResult,
  PoseInfo,
  PoseKeypoint,
  PoseOverallSummary,
  PoseRejectionReasonDetail,
  PoseStatus,
  PreprocessArtifacts,
  PreprocessFrameItem,
  PreprocessInfo,
  PreprocessStatus,
  RecognitionContext,
  ReportResult,
  RetestCoachReview,
  RetestComparison,
  RetestDeltaItem,
  StandardComparison,
  StandardPhaseFrame,
  StandardReferenceFrame,
  SuggestionItem,
  TaskHistoryItem,
  TaskResource,
  TaskStage,
  TaskStatus,
  TaskStatusResponse,
  UploadTaskResponse,
  VideoMetadata,
  ViewProfile,
  VisualEvidence,
} from '../../../shared/contracts';

import type {
  ActionType,
  ErrorSnapshot,
  PoseInfo,
  PreprocessInfo,
  ReportResult,
  TaskResource,
  TaskStage,
  TaskStatus,
  VideoMetadata,
} from '../../../shared/contracts';

export interface ArtifactRefs {
  sourceFilePath?: string;
  preprocessManifestPath?: string;
  poseResultPath?: string;
  reportPath?: string;
  upload?: VideoMetadata;
  poseSummary?: PoseInfo['summary'];
  preprocess?: PreprocessInfo;
}

export interface AnalysisTaskRecord extends TaskResource {
  artifacts: ArtifactRefs;
}

export interface TaskRow {
  task_id: string;
  action_type: ActionType;
  status: TaskStatus;
  stage: TaskStage;
  progress_percent: number;
  baseline_task_id: string | null;
  error_json: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  stage_started_at: string | null;
}

export interface ArtifactRow {
  task_id: string;
  source_file_path: string | null;
  preprocess_manifest_path: string | null;
  pose_result_path: string | null;
  report_path: string | null;
  upload_json: string | null;
  preprocess_json: string | null;
  pose_summary_json: string | null;
}

export interface ReportRow {
  task_id: string;
  total_score: number;
  summary_text: string | null;
  pose_based: number;
  report_json: string;
  created_at: string;
}

export interface ComparisonPayload {
  currentTask: TaskResource;
  baselineTask: TaskResource;
  currentReport: ReportResult;
  baselineReport: ReportResult;
}

export function parseJson<T>(value?: string | null): T | undefined {
  if (!value) return undefined;
  return JSON.parse(value) as T;
}

export function serializeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function toTaskResource(task: AnalysisTaskRecord): TaskResource {
  const resource: TaskResource = {
    taskId: task.taskId,
    actionType: task.actionType,
    status: task.status,
    stage: task.stage,
    progressPercent: task.progressPercent,
    baselineTaskId: task.baselineTaskId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };

  if (task.error) {
    resource.error = task.error as ErrorSnapshot;
  }

  return resource;
}
