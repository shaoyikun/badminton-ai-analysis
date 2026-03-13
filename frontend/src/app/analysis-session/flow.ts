import type { MutableRefObject } from 'react'
import type {
  PoseStatus,
  PreprocessStatus,
  SegmentSelectionWindow,
  SegmentScanSummary,
  TaskStage,
  TaskStatus,
} from '../../../../shared/contracts'
import type { FlowResult } from './types'

type FailureReason = 'server' | 'network' | null

export function deriveStageStatuses(stage: TaskStage | '', status: TaskStatus | '', errorCode?: string): { preprocessStatus: PreprocessStatus; poseStatus: PoseStatus } {
  if (status === 'created' || stage === 'upload_pending' || !stage) {
    return { preprocessStatus: 'idle', poseStatus: 'idle' }
  }
  if (stage === 'uploaded') {
    return { preprocessStatus: 'queued', poseStatus: 'idle' }
  }
  if (stage === 'validating' || stage === 'extracting_frames') {
    return { preprocessStatus: 'processing', poseStatus: 'idle' }
  }
  if (stage === 'estimating_pose') {
    return { preprocessStatus: 'completed', poseStatus: 'processing' }
  }
  if (stage === 'generating_report' || stage === 'completed') {
    return { preprocessStatus: 'completed', poseStatus: 'completed' }
  }

  if (errorCode === 'pose_failed') {
    return { preprocessStatus: 'completed', poseStatus: 'failed' }
  }
  if (errorCode === 'report_generation_failed') {
    return { preprocessStatus: 'completed', poseStatus: 'completed' }
  }
  return { preprocessStatus: 'failed', poseStatus: 'idle' }
}

export function getSegmentWindowForId(scan: SegmentScanSummary | null, segmentId: string) {
  if (!scan?.swingSegments?.length || !segmentId) return null
  const matched = scan.swingSegments.find((segment) => segment.segmentId === segmentId)
  if (!matched) return null
  return {
    startTimeMs: matched.startTimeMs,
    endTimeMs: matched.endTimeMs,
    startFrame: matched.startFrame,
    endFrame: matched.endFrame,
  } satisfies SegmentSelectionWindow
}

function buildFlowFailure(lastFailureReason: FailureReason, message: string): FlowResult {
  return {
    ok: false,
    reason: lastFailureReason === 'server' ? 'server' : 'network',
    message,
  }
}

export async function runScanVideoFlow(options: {
  file: File | null
  createTask: () => Promise<string | null>
  uploadVideo: (targetTaskId?: string) => Promise<boolean>
  getLastFailureReason: () => FailureReason
}) {
  if (!options.file) {
    return { ok: false, reason: 'validation', message: '请先选择视频文件。' } satisfies FlowResult
  }

  const createdTaskId = await options.createTask()
  if (!createdTaskId) {
    return buildFlowFailure(options.getLastFailureReason(), '创建任务失败，请稍后再试。')
  }

  const uploaded = await options.uploadVideo(createdTaskId)
  if (!uploaded) {
    return buildFlowFailure(options.getLastFailureReason(), '上传或粗扫失败，请稍后再试。')
  }

  return { ok: true } satisfies FlowResult
}

export async function runStartSelectedSegmentFlow(options: {
  taskId: string
  segmentScan: SegmentScanSummary | null
  selectedSegmentId: string
  selectedSegmentWindow: SegmentSelectionWindow | null
  analyze: (targetTaskId?: string, selectedSegmentId?: string, selectedWindowOverride?: SegmentSelectionWindow | null) => Promise<boolean>
  getLastFailureReason: () => FailureReason
}) {
  if (!options.taskId) {
    return { ok: false, reason: 'validation', message: '请先完成视频上传和粗扫。' } satisfies FlowResult
  }

  if (!options.segmentScan?.swingSegments?.length) {
    return { ok: false, reason: 'validation', message: '当前还没有可供选择的挥拍片段。' } satisfies FlowResult
  }

  if (!options.selectedSegmentId) {
    return { ok: false, reason: 'validation', message: '请先选择一个要分析的片段。' } satisfies FlowResult
  }

  const started = await options.analyze(options.taskId, options.selectedSegmentId, options.selectedSegmentWindow)
  if (!started) {
    return buildFlowFailure(options.getLastFailureReason(), '启动分析失败，请稍后再试。')
  }

  return { ok: true } satisfies FlowResult
}

export async function runStartAnalysisFlow(options: {
  scanVideoFlow: () => Promise<FlowResult>
  startSelectedSegmentFlow: () => Promise<FlowResult>
}) {
  const scanResult = await options.scanVideoFlow()
  if (!scanResult.ok) {
    return scanResult
  }
  return options.startSelectedSegmentFlow()
}

export function stopPollingTask(pollingRef: MutableRefObject<number | null>, setIsPolling: (value: boolean) => void) {
  if (pollingRef.current) {
    window.clearInterval(pollingRef.current)
    pollingRef.current = null
  }
  setIsPolling(false)
}

export function startPollingTask(options: {
  pollingRef: MutableRefObject<number | null>
  setIsPolling: (value: boolean) => void
  appendLog: (text: string) => void
  stopPolling: () => void
  onTick: () => Promise<void>
  intervalMs?: number
}) {
  options.stopPolling()
  options.setIsPolling(true)
  options.appendLog('开始自动轮询任务状态')
  options.pollingRef.current = window.setInterval(() => {
    void options.onTick()
  }, options.intervalMs ?? 1500)
}
