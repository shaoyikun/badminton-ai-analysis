import { randomUUID } from 'node:crypto';
import type { ActionType, ErrorCategory, ErrorSnapshot, FlowErrorCode, TaskStage } from '../types/task';
import type { AnalysisTaskRecord, ArtifactRefs } from '../types/task';

function now() {
  return new Date().toISOString();
}

export const stageProgress: Record<TaskStage, number> = {
  upload_pending: 0,
  uploaded: 10,
  validating: 25,
  extracting_frames: 45,
  estimating_pose: 70,
  generating_report: 90,
  completed: 100,
  failed: 100,
};

export function createTaskRecord(actionType: ActionType, baselineTaskId?: string): AnalysisTaskRecord {
  const createdAt = now();
  return {
    taskId: `task_${randomUUID().slice(0, 8)}`,
    actionType,
    status: 'created',
    stage: 'upload_pending',
    progressPercent: stageProgress.upload_pending,
    baselineTaskId,
    createdAt,
    updatedAt: createdAt,
    artifacts: {},
  };
}

function assertMutable(task: AnalysisTaskRecord) {
  if (task.status === 'completed' || task.status === 'failed') {
    throw new Error(`task ${task.taskId} is already terminal`);
  }
}

export function markTaskUploaded(task: AnalysisTaskRecord, upload: ArtifactRefs['upload'], sourceFilePath: string): AnalysisTaskRecord {
  if (task.status !== 'created' || task.stage !== 'upload_pending') {
    throw new Error(`task ${task.taskId} cannot accept upload from ${task.status}/${task.stage}`);
  }

  const updatedAt = now();
  return {
    ...task,
    status: 'uploaded',
    stage: 'uploaded',
    progressPercent: stageProgress.uploaded,
    updatedAt,
    artifacts: {
      ...task.artifacts,
      upload,
      sourceFilePath,
    },
    error: undefined,
  };
}

export function markTaskStarted(task: AnalysisTaskRecord): AnalysisTaskRecord {
  if (task.status !== 'uploaded' || task.stage !== 'uploaded') {
    throw new Error(`task ${task.taskId} cannot start from ${task.status}/${task.stage}`);
  }

  const startedAt = now();
  return {
    ...task,
    status: 'processing',
    stage: 'validating',
    progressPercent: stageProgress.validating,
    startedAt,
    updatedAt: startedAt,
    error: undefined,
  };
}

export function enterStage(task: AnalysisTaskRecord, stage: Extract<TaskStage, 'validating' | 'extracting_frames' | 'estimating_pose' | 'generating_report'>): AnalysisTaskRecord {
  assertMutable(task);
  const updatedAt = now();
  return {
    ...task,
    status: 'processing',
    stage,
    progressPercent: stageProgress[stage],
    startedAt: task.startedAt ?? updatedAt,
    updatedAt,
    error: undefined,
  };
}

export function mergeArtifacts(task: AnalysisTaskRecord, patch: Partial<ArtifactRefs>): AnalysisTaskRecord {
  return {
    ...task,
    artifacts: {
      ...task.artifacts,
      ...patch,
    },
  };
}

export function failTask(task: AnalysisTaskRecord, error: ErrorSnapshot): AnalysisTaskRecord {
  const updatedAt = now();
  return {
    ...task,
    status: 'failed',
    stage: 'failed',
    progressPercent: stageProgress.failed,
    error,
    updatedAt,
    completedAt: updatedAt,
  };
}

export function completeTask(task: AnalysisTaskRecord, reportPath: string): AnalysisTaskRecord {
  assertMutable(task);
  const completedAt = now();
  return {
    ...task,
    status: 'completed',
    stage: 'completed',
    progressPercent: stageProgress.completed,
    updatedAt: completedAt,
    completedAt,
    artifacts: {
      ...task.artifacts,
      reportPath,
    },
    error: undefined,
  };
}

export function createErrorSnapshot(
  code: FlowErrorCode,
  category: ErrorCategory,
  message: string,
  retryable: boolean,
): ErrorSnapshot {
  return {
    code,
    category,
    message,
    retryable,
    occurredAt: now(),
  };
}
