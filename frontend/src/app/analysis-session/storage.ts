import type { ActionType } from '../../../../shared/contracts'
import type { LegacySessionSnapshot, SessionSnapshot } from './types'

export const SESSION_STORAGE_KEY = 'badminton-ai-analysis-session'

function buildEmptySessionSnapshot(): SessionSnapshot {
  return {
    actionType: 'clear',
    taskId: '',
    latestCompletedTaskIds: {},
    selectedCompareTaskIds: {},
    selectedVideoSummary: null,
    uploadChecklistConfirmed: false,
    segmentScan: null,
    selectedSegmentId: '',
    selectedSegmentWindow: null,
    errorState: null,
    debugEnabled: false,
  }
}

export function readSessionSnapshot(): SessionSnapshot {
  if (typeof window === 'undefined') {
    return buildEmptySessionSnapshot()
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) throw new Error('missing session')
    const parsed = JSON.parse(raw) as LegacySessionSnapshot
    const actionType = parsed.actionType === 'smash' ? 'smash' : 'clear'
    const latestCompletedTaskIds = parsed.latestCompletedTaskIds ?? (
      'latestCompletedTaskId' in parsed && typeof parsed.latestCompletedTaskId === 'string' && parsed.latestCompletedTaskId
        ? { [actionType as ActionType]: parsed.latestCompletedTaskId }
        : {}
    )
    const selectedCompareTaskIds = parsed.selectedCompareTaskIds ?? (
      'selectedCompareTaskId' in parsed && typeof parsed.selectedCompareTaskId === 'string' && parsed.selectedCompareTaskId
        ? { [actionType as ActionType]: parsed.selectedCompareTaskId }
        : {}
    )

    return {
      actionType,
      taskId: parsed.taskId ?? '',
      latestCompletedTaskIds,
      selectedCompareTaskIds,
      selectedVideoSummary: parsed.selectedVideoSummary ?? null,
      uploadChecklistConfirmed: Boolean(parsed.uploadChecklistConfirmed),
      segmentScan: parsed.segmentScan ?? null,
      selectedSegmentId: parsed.selectedSegmentId ?? '',
      selectedSegmentWindow: parsed.selectedSegmentWindow ?? parsed.segmentScan?.selectedSegmentWindow ?? null,
      errorState: parsed.errorState ?? null,
      debugEnabled: Boolean(parsed.debugEnabled),
    }
  } catch {
    return buildEmptySessionSnapshot()
  }
}

export function writeSessionSnapshot(snapshot: SessionSnapshot) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot))
}
