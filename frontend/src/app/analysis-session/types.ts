import type {
  ActionType,
  FlowActionTarget,
  FlowErrorCode,
  SegmentSelectionWindow,
  SegmentScanSummary,
} from '../../../../shared/contracts'
import type { LocalVideoSummary } from '../../features/upload/uploadFlow'

export type ErrorState = {
  errorCode?: FlowErrorCode | string
  title: string
  summary: string
  explanation: string
  suggestions: string[]
  uploadBanner: string
  primaryAction: FlowActionTarget
  secondaryAction: FlowActionTarget
} | null

export type ActionTaskStateMap = Partial<Record<ActionType, string>>

export type SessionSnapshot = {
  actionType: ActionType
  taskId: string
  latestCompletedTaskIds: ActionTaskStateMap
  selectedCompareTaskIds: ActionTaskStateMap
  selectedVideoSummary: LocalVideoSummary | null
  uploadChecklistConfirmed: boolean
  segmentScan: SegmentScanSummary | null
  selectedSegmentId: string
  selectedSegmentWindow: SegmentSelectionWindow | null
  errorState: ErrorState
  debugEnabled: boolean
}

export type LegacySessionSnapshot = Partial<SessionSnapshot> & {
  latestCompletedTaskId?: string
  selectedCompareTaskId?: string
}

export type FlowResult =
  | { ok: true }
  | { ok: false; reason: 'validation' | 'network' | 'server'; message?: string }
