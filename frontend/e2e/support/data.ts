import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  ComparisonResponse,
  ErrorResponse,
  FlowErrorCode,
  HistoryDetailResponse,
  HistoryListResponse,
  PoseAnalysisResult,
  TaskStatusResponse,
} from '../../../shared/contracts'

type SessionSnapshot = {
  actionType: 'clear'
  taskId: string
  latestCompletedTaskId: string
  selectedCompareTaskId: string
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

function readJson<T>(filename: string) {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${filename}`, import.meta.url), 'utf8'),
  ) as T
}

export const historyResponse = readJson<HistoryListResponse>('history.json')
export const historyDetailResponse = readJson<HistoryDetailResponse>('history-detail.json')
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
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    actionType: 'clear',
    taskId: '',
    latestCompletedTaskId: '',
    selectedCompareTaskId: '',
    selectedVideoSummary: null,
    uploadChecklistConfirmed: false,
    errorState: null,
    debugEnabled: false,
    ...overrides,
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
