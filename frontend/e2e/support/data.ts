import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  ActionType,
  ComparisonResponse,
  ErrorResponse,
  FlowErrorCode,
  HistoryDetailResponse,
  HistoryListResponse,
  PoseAnalysisResult,
  SegmentScanSummary,
  TaskStatusResponse,
  UploadTaskResponse,
} from '../../../shared/contracts'

type SessionSnapshot = {
  actionType: ActionType
  taskId: string
  latestCompletedTaskIds: Partial<Record<ActionType, string>>
  selectedCompareTaskIds: Partial<Record<ActionType, string>>
  selectedVideoSummary: null
  uploadChecklistConfirmed: boolean
  errorState: {
    errorCode?: FlowErrorCode | string
    title: string
    summary: string
    explanation: string
    suggestions: string[]
    uploadBanner: string
    primaryAction: 'upload' | 'guide'
    secondaryAction: 'upload' | 'guide'
  } | null
  debugEnabled: boolean
}

type SessionSnapshotOverrides = Partial<SessionSnapshot> & {
  latestCompletedTaskId?: string
  selectedCompareTaskId?: string
}

function readJson<T>(filename: string) {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${filename}`, import.meta.url), 'utf8'),
  ) as T
}

export const historyResponse = readJson<HistoryListResponse>('history.json')
const rawHistoryDetailResponse = readJson<HistoryDetailResponse>('history-detail.json')
const segmentFields = {
  swingSegments: [
    {
      segmentId: 'segment-01',
      startTimeMs: 1180,
      endTimeMs: 2080,
      startFrame: 10,
      endFrame: 19,
      durationMs: 900,
      motionScore: 0.54,
      confidence: 0.68,
      rankingScore: 0.6,
      coarseQualityFlags: ['too_short'],
      detectionSource: 'coarse_motion_scan_v1',
    },
    {
      segmentId: 'segment-02',
      startTimeMs: 6320,
      endTimeMs: 8120,
      startFrame: 48,
      endFrame: 62,
      durationMs: 1800,
      motionScore: 0.84,
      confidence: 0.87,
      rankingScore: 0.82,
      coarseQualityFlags: [],
      detectionSource: 'coarse_motion_scan_v1',
    },
  ],
  recommendedSegmentId: 'segment-02',
  selectedSegmentId: 'segment-02',
  segmentDetectionVersion: 'coarse_motion_scan_v1',
  segmentSelectionMode: 'auto_recommended',
} as const

const uploadSegmentScan: SegmentScanSummary = {
  status: 'completed',
  segmentDetectionVersion: segmentFields.segmentDetectionVersion,
  recommendedSegmentId: segmentFields.recommendedSegmentId,
  selectedSegmentId: segmentFields.recommendedSegmentId,
  segmentSelectionMode: segmentFields.segmentSelectionMode,
  swingSegments: [...segmentFields.swingSegments],
}

export const historyDetailResponse: HistoryDetailResponse = {
  ...rawHistoryDetailResponse,
  report: {
    ...rawHistoryDetailResponse.report,
    ...segmentFields,
  },
}
export const reportResponse = historyDetailResponse.report
export const comparisonResponse = readJson<ComparisonResponse>('comparison.json')

export const currentTaskId = reportResponse.taskId
export const comparisonBaselineTaskId = comparisonResponse.baselineTask.taskId
export const comparisonHistoryTaskId = historyResponse.items[1]?.taskId ?? comparisonBaselineTaskId

export const validVideoPath = fileURLToPath(new URL('../fixtures/valid-clear.mp4', import.meta.url))
export const invalidImagePath = fileURLToPath(new URL('../fixtures/invalid-image.jpg', import.meta.url))

export const reportTaskStatus: TaskStatusResponse = {
  ...historyDetailResponse.task,
}

export const processingLifecycle = {
  created: {
    taskId: 'task_e2e_processing',
    actionType: 'clear',
    status: 'created',
    stage: 'upload_pending',
    progressPercent: 0,
    createdAt: '2026-03-13T01:20:00.000Z',
    updatedAt: '2026-03-13T01:20:00.000Z',
  } satisfies TaskStatusResponse,
  uploaded: {
    taskId: 'task_e2e_processing',
    actionType: 'clear',
    status: 'uploaded',
    stage: 'uploaded',
    progressPercent: 18,
    createdAt: '2026-03-13T01:20:00.000Z',
    updatedAt: '2026-03-13T01:20:02.000Z',
  } satisfies TaskStatusResponse,
  processing: {
    taskId: 'task_e2e_processing',
    actionType: 'clear',
    status: 'processing',
    stage: 'uploaded',
    progressPercent: 18,
    createdAt: '2026-03-13T01:20:00.000Z',
    updatedAt: '2026-03-13T01:20:03.000Z',
    startedAt: '2026-03-13T01:20:03.000Z',
    segmentScan: uploadSegmentScan,
  } satisfies TaskStatusResponse,
  completed: {
    ...reportTaskStatus,
  } satisfies TaskStatusResponse,
  failed: {
    taskId: 'task_e2e_failed',
    actionType: 'clear',
    status: 'failed',
    stage: 'failed',
    progressPercent: 100,
    createdAt: '2026-03-13T01:22:00.000Z',
    updatedAt: '2026-03-13T01:22:10.000Z',
    startedAt: '2026-03-13T01:22:01.000Z',
    error: {
      code: 'poor_lighting_or_occlusion',
      category: 'media_validation',
      message: '光线、清晰度或遮挡影响了关键动作识别。',
      retryable: true,
      occurredAt: '2026-03-13T01:22:10.000Z',
    },
  } satisfies TaskStatusResponse,
}

export const uploadTaskResponse: UploadTaskResponse = {
  ...processingLifecycle.uploaded,
  fileName: 'valid-clear.mp4',
  segmentScan: uploadSegmentScan,
}

export const poseResponse: PoseAnalysisResult = {
  engine: 'mediapipe-pose',
  frameCount: 9,
  detectedFrameCount: 9,
  summary: {
    bestFrameIndex: 7,
    usableFrameCount: 9,
    coverageRatio: 1,
    medianStabilityScore: 0.9897,
    medianBodyTurnScore: 0.8647,
    medianRacketArmLiftScore: 0.5546,
    scoreVariance: 0.0022,
    rejectionReasons: [],
    humanSummary: '当前样本已经完成姿态摘要计算，可用于联调与报告加载。',
    viewProfile: 'front_right_oblique',
    viewConfidence: 1,
    dominantRacketSide: 'right',
    racketSideConfidence: 0.0468,
    bestFrameOverlayRelativePath: reportResponse.visualEvidence?.bestFrameOverlayPath,
    overlayFrameCount: reportResponse.visualEvidence?.overlayFrames.length,
  },
  frames: [],
}

export function buildSessionSnapshot(
  overrides: SessionSnapshotOverrides = {},
): SessionSnapshot {
  const actionType = overrides.actionType ?? 'clear'
  const latestCompletedTaskIds = overrides.latestCompletedTaskIds ?? (
    overrides.latestCompletedTaskId
      ? { [actionType]: overrides.latestCompletedTaskId }
      : {}
  )
  const selectedCompareTaskIds = overrides.selectedCompareTaskIds ?? (
    overrides.selectedCompareTaskId
      ? { [actionType]: overrides.selectedCompareTaskId }
      : {}
  )

  return {
    actionType,
    taskId: '',
    latestCompletedTaskIds,
    selectedCompareTaskIds,
    selectedVideoSummary: null,
    uploadChecklistConfirmed: false,
    errorState: null,
    debugEnabled: false,
    ...overrides,
  }
}

export function buildActionScenario(actionType: ActionType) {
  const label = actionType === 'smash' ? '杀球' : '正手高远球'
  const summaryText = actionType === 'smash'
    ? '这次杀球样本已经完成正式分析，可以继续回看加载、引拍和击球连贯性。'
    : reportResponse.summaryText

  const history: HistoryListResponse = {
    ...historyResponse,
    items: historyResponse.items.map((item, index) => ({
      ...item,
      actionType,
      summaryText: actionType === 'smash'
        ? `第 ${index + 1} 条${label}样本已完成分析，可继续做同动作复测。`
        : item.summaryText,
    })),
  }

  const report = {
    ...reportResponse,
    actionType,
    summaryText,
  }

  const historyDetail: HistoryDetailResponse = {
    ...historyDetailResponse,
    task: {
      ...historyDetailResponse.task,
      actionType,
    },
    report,
  }

  const comparison: ComparisonResponse = {
    ...comparisonResponse,
    currentTask: {
      ...comparisonResponse.currentTask,
      actionType,
    },
    baselineTask: {
      ...comparisonResponse.baselineTask,
      actionType,
    },
  }

  const reportTaskStatusByAction: TaskStatusResponse = {
    ...reportTaskStatus,
    actionType,
  }

  return {
    history,
    historyDetail,
    report,
    comparison,
    currentTaskStatus: reportTaskStatusByAction,
    createTaskResponse: {
      ...processingLifecycle.created,
      actionType,
    } satisfies TaskStatusResponse,
    uploadTaskResponse: {
      ...uploadTaskResponse,
      actionType,
      fileName: actionType === 'smash' ? 'valid-smash.mp4' : 'valid-clear.mp4',
      segmentScan: {
        ...uploadSegmentScan,
      },
    },
    startTaskResponse: {
      ...processingLifecycle.processing,
      actionType,
      segmentScan: {
        ...uploadSegmentScan,
      },
    } satisfies TaskStatusResponse,
  }
}

export function buildErrorResponse(
  code: FlowErrorCode,
  message: string,
): ErrorResponse {
  return {
    error: {
      code,
      category: 'internal_recovery',
      message,
      retryable: true,
      occurredAt: '2026-03-13T01:30:00.000Z',
    },
  }
}
