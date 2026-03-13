/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  ActionType,
  FlowErrorCode,
  SegmentSelectionWindow,
  SegmentScanSummary,
} from '../../../shared/contracts'
import {
  getActionLabel,
  getErrorCatalogItem,
  type LocalVideoSummary,
} from '../features/upload/uploadFlow'
import {
  createTaskRequest,
  getFallbackErrorCode,
  startTaskAnalysis,
  uploadTaskVideo,
} from './analysis-session/api'
import {
  getSegmentWindowForId,
  runScanVideoFlow,
  runStartAnalysisFlow,
  runStartSelectedSegmentFlow,
} from './analysis-session/flow'
import { readSessionSnapshot, writeSessionSnapshot } from './analysis-session/storage'
import type { ActionTaskStateMap, ErrorState, FlowResult } from './analysis-session/types'

type FailureReason = 'server' | 'network' | null

export type { ErrorState } from './analysis-session/types'
export type {
  ActionType,
  ComparisonResponse,
  FlowErrorCode,
  PoseAnalysisResult as PoseResult,
  PoseStatus,
  PreprocessStatus,
  ReportResult,
  RetestComparison,
  TaskHistoryItem,
  TaskStage,
  TaskStatus,
} from '../../../shared/contracts'
export { API_BASE } from './analysis-session/api'

type AnalysisSessionContextValue = {
  actionType: ActionType
  setActionType: (value: ActionType) => void
  selectedActionLabel: string
  taskId: string
  setTaskId: (value: string) => void
  latestCompletedTaskIds: ActionTaskStateMap
  latestCompletedTaskId: string
  rememberCompletedTask: (taskId: string, actionType: ActionType) => void
  selectedCompareTaskIds: ActionTaskStateMap
  selectedCompareTaskId: string
  setSelectedCompareTaskId: (value: string) => void
  file: File | null
  setFile: (value: File | null) => void
  selectedVideoSummary: LocalVideoSummary | null
  setSelectedVideoSummary: (value: LocalVideoSummary | null) => void
  segmentScan: SegmentScanSummary | null
  selectedSegmentId: string
  setSelectedSegmentId: (value: string) => void
  selectedSegmentWindow: SegmentSelectionWindow | null
  setSelectedSegmentWindow: (value: SegmentSelectionWindow | null) => void
  uploadChecklistConfirmed: boolean
  setUploadChecklistConfirmed: (value: boolean) => void
  resetUploadDraft: () => void
  prepareFreshUpload: () => void
  isBusy: boolean
  log: string[]
  appendLog: (text: string) => void
  errorState: ErrorState
  setErrorState: (value: ErrorState) => void
  setFriendlyError: (errorCode?: FlowErrorCode | string, fallback?: string) => void
  clearErrorState: () => void
  debugEnabled: boolean
  setDebugEnabled: (value: boolean) => void
  createTask: () => Promise<string | null>
  uploadVideo: (targetTaskId?: string) => Promise<boolean>
  analyze: (targetTaskId?: string, selectedSegmentId?: string, selectedWindowOverride?: SegmentSelectionWindow | null) => Promise<boolean>
  scanVideoFlow: () => Promise<FlowResult>
  startSelectedSegmentFlow: () => Promise<FlowResult>
  startAnalysisFlow: () => Promise<FlowResult>
  canOpenReportTab: boolean
}

const AnalysisSessionContext = createContext<AnalysisSessionContextValue | null>(null)

export function AnalysisSessionProvider({ children }: { children: ReactNode }) {
  const initialSession = readSessionSnapshot()
  const [actionType, setActionTypeState] = useState<ActionType>(initialSession.actionType)
  const [taskId, setTaskIdState] = useState(initialSession.taskId)
  const [latestCompletedTaskIds, setLatestCompletedTaskIds] = useState<ActionTaskStateMap>(initialSession.latestCompletedTaskIds)
  const [selectedCompareTaskIds, setSelectedCompareTaskIds] = useState<ActionTaskStateMap>(initialSession.selectedCompareTaskIds)
  const [file, setFile] = useState<File | null>(null)
  const [selectedVideoSummary, setSelectedVideoSummary] = useState<LocalVideoSummary | null>(initialSession.selectedVideoSummary)
  const [segmentScan, setSegmentScan] = useState<SegmentScanSummary | null>(initialSession.segmentScan)
  const [selectedSegmentIdState, setSelectedSegmentIdState] = useState(initialSession.selectedSegmentId)
  const [selectedSegmentWindow, setSelectedSegmentWindowState] = useState<SegmentSelectionWindow | null>(initialSession.selectedSegmentWindow)
  const [uploadChecklistConfirmed, setUploadChecklistConfirmed] = useState(initialSession.uploadChecklistConfirmed)
  const [isBusy, setIsBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [errorState, setErrorState] = useState<ErrorState>(initialSession.errorState)
  const [debugEnabled, setDebugEnabled] = useState(initialSession.debugEnabled)
  const lastFailureReasonRef = useRef<FailureReason>(null)

  const latestCompletedTaskId = latestCompletedTaskIds[actionType] ?? ''
  const selectedCompareTaskId = selectedCompareTaskIds[actionType] ?? ''
  const selectedActionLabel = getActionLabel(actionType)
  const canOpenReportTab = Boolean(latestCompletedTaskId)

  const appendLog = useCallback((text: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString('zh-CN', { hour12: false })} · ${text}`, ...prev].slice(0, 40))
  }, [])

  const clearErrorState = useCallback(() => {
    setErrorState(null)
  }, [])

  const setFriendlyError = useCallback((errorCode?: FlowErrorCode | string, fallback?: string) => {
    lastFailureReasonRef.current = 'server'
    const copy = getErrorCatalogItem(errorCode, fallback)
    setErrorState({ errorCode, ...copy })
    setFile(null)
    setUploadChecklistConfirmed(false)
    appendLog(`${copy.title}：${copy.summary}`)
  }, [appendLog])

  const resetUploadDraft = useCallback(() => {
    setTaskIdState('')
    setFile(null)
    setSelectedVideoSummary(null)
    setSegmentScan(null)
    setSelectedSegmentIdState('')
    setSelectedSegmentWindowState(null)
    setUploadChecklistConfirmed(false)
  }, [])

  const prepareFreshUpload = useCallback(() => {
    resetUploadDraft()
    setErrorState(null)
  }, [resetUploadDraft])

  const rememberCompletedTask = useCallback((completedTaskId: string, nextActionType: ActionType) => {
    setLatestCompletedTaskIds((prev) => ({
      ...prev,
      [nextActionType]: completedTaskId,
    }))
  }, [])

  const setSelectedCompareTaskId = useCallback((value: string) => {
    setSelectedCompareTaskIds((prev) => ({
      ...prev,
      [actionType]: value,
    }))
  }, [actionType])

  const setActionType = useCallback((value: ActionType) => {
    if (value === actionType) return
    resetUploadDraft()
    setActionTypeState(value)
    setErrorState(null)
  }, [actionType, resetUploadDraft])

  const setTaskId = useCallback((value: string) => {
    setTaskIdState(value)
  }, [])

  const setSelectedSegmentId = useCallback((value: string) => {
    setSelectedSegmentIdState(value)
    setSelectedSegmentWindowState(getSegmentWindowForId(segmentScan, value))
  }, [segmentScan])

  const setSelectedSegmentWindow = useCallback((value: SegmentSelectionWindow | null) => {
    setSelectedSegmentWindowState(value)
  }, [])

  const getLastFailureReason = useCallback(() => lastFailureReasonRef.current, [])

  const createTask = useCallback(async () => {
    try {
      lastFailureReasonRef.current = null
      setIsBusy(true)
      setErrorState(null)
      setSegmentScan(null)
      setSelectedSegmentIdState('')
      setSelectedSegmentWindowState(null)
      const result = await createTaskRequest(actionType)
      if (!result.ok) {
        setFriendlyError(getFallbackErrorCode(result.error, 'internal_error'), result.error?.message)
        appendLog(`创建任务失败：${result.error?.message ?? '未知错误'}`)
        return null
      }

      setTaskIdState(result.data.taskId)
      appendLog(`任务已创建：${result.data.taskId}（${getActionLabel(result.data.actionType)}）`)
      return result.data.taskId
    } catch (error) {
      lastFailureReasonRef.current = 'network'
      appendLog(`创建任务失败：${error instanceof Error ? error.message : '网络异常'}`)
      return null
    } finally {
      setIsBusy(false)
    }
  }, [actionType, appendLog, setFriendlyError])

  const uploadVideo = useCallback(async (targetTaskId?: string) => {
    const activeTaskId = targetTaskId ?? taskId
    if (!activeTaskId || !file) return false

    try {
      lastFailureReasonRef.current = null
      setIsBusy(true)
      setErrorState(null)
      const result = await uploadTaskVideo(activeTaskId, file)
      if (!result.ok) {
        setFriendlyError(getFallbackErrorCode(result.error, 'upload_failed'), result.error?.message)
        return false
      }

      setTaskIdState(result.data.taskId)
      setSegmentScan(result.data.segmentScan ?? null)
      setSelectedSegmentIdState(result.data.segmentScan?.selectedSegmentId ?? result.data.segmentScan?.recommendedSegmentId ?? '')
      setSelectedSegmentWindowState(result.data.segmentScan?.selectedSegmentWindow ?? null)
      appendLog(`上传完成：${result.data.fileName ?? file.name}`)
      return true
    } catch (error) {
      lastFailureReasonRef.current = 'network'
      appendLog(`上传失败：${error instanceof Error ? error.message : '网络异常'}`)
      return false
    } finally {
      setIsBusy(false)
    }
  }, [appendLog, file, setFriendlyError, taskId])

  const analyze = useCallback(async (
    targetTaskId?: string,
    nextSelectedSegmentId?: string,
    nextSelectedWindowOverride?: SegmentSelectionWindow | null,
  ) => {
    const activeTaskId = targetTaskId ?? taskId
    if (!activeTaskId) return false

    try {
      lastFailureReasonRef.current = null
      setIsBusy(true)
      setErrorState(null)
      const result = await startTaskAnalysis(activeTaskId, {
        selectedSegmentId: nextSelectedSegmentId ?? selectedSegmentIdState,
        selectedWindowOverride: nextSelectedWindowOverride ?? selectedSegmentWindow,
      })

      if (!result.ok) {
        setFriendlyError(getFallbackErrorCode(result.error, 'internal_error'), result.error?.message)
        return false
      }

      setTaskIdState(result.data.taskId)
      appendLog('已启动分析')
      return true
    } catch (error) {
      lastFailureReasonRef.current = 'network'
      appendLog(`启动分析失败：${error instanceof Error ? error.message : '网络异常'}`)
      return false
    } finally {
      setIsBusy(false)
    }
  }, [appendLog, selectedSegmentIdState, selectedSegmentWindow, setFriendlyError, taskId])

  const scanVideoFlow = useCallback(async (): Promise<FlowResult> => {
    return runScanVideoFlow({
      file,
      createTask,
      uploadVideo,
      getLastFailureReason,
    })
  }, [createTask, file, getLastFailureReason, uploadVideo])

  const startSelectedSegmentFlow = useCallback(async (): Promise<FlowResult> => {
    return runStartSelectedSegmentFlow({
      taskId,
      segmentScan,
      selectedSegmentId: selectedSegmentIdState,
      selectedSegmentWindow,
      analyze,
      getLastFailureReason,
    })
  }, [analyze, getLastFailureReason, segmentScan, selectedSegmentIdState, selectedSegmentWindow, taskId])

  const startAnalysisFlow = useCallback(async (): Promise<FlowResult> => {
    return runStartAnalysisFlow({
      scanVideoFlow,
      startSelectedSegmentFlow,
    })
  }, [scanVideoFlow, startSelectedSegmentFlow])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const debugParam = params.get('debug')
    if (debugParam === '1') setDebugEnabled(true)
    if (debugParam === '0') setDebugEnabled(false)
  }, [])

  useEffect(() => {
    writeSessionSnapshot({
      actionType,
      taskId,
      latestCompletedTaskIds,
      selectedCompareTaskIds,
      selectedVideoSummary,
      uploadChecklistConfirmed,
      segmentScan,
      selectedSegmentId: selectedSegmentIdState,
      selectedSegmentWindow,
      errorState,
      debugEnabled,
    })
  }, [
    actionType,
    debugEnabled,
    errorState,
    latestCompletedTaskIds,
    segmentScan,
    selectedCompareTaskIds,
    selectedSegmentIdState,
    selectedSegmentWindow,
    selectedVideoSummary,
    taskId,
    uploadChecklistConfirmed,
  ])

  const value = useMemo<AnalysisSessionContextValue>(() => ({
    actionType,
    setActionType,
    selectedActionLabel,
    taskId,
    setTaskId,
    latestCompletedTaskIds,
    latestCompletedTaskId,
    rememberCompletedTask,
    selectedCompareTaskIds,
    selectedCompareTaskId,
    setSelectedCompareTaskId,
    file,
    setFile,
    selectedVideoSummary,
    setSelectedVideoSummary,
    segmentScan,
    selectedSegmentId: selectedSegmentIdState,
    setSelectedSegmentId,
    selectedSegmentWindow,
    setSelectedSegmentWindow,
    uploadChecklistConfirmed,
    setUploadChecklistConfirmed,
    resetUploadDraft,
    prepareFreshUpload,
    isBusy,
    log,
    appendLog,
    errorState,
    setErrorState,
    setFriendlyError,
    clearErrorState,
    debugEnabled,
    setDebugEnabled,
    createTask,
    uploadVideo,
    analyze,
    scanVideoFlow,
    startSelectedSegmentFlow,
    startAnalysisFlow,
    canOpenReportTab,
  }), [
    actionType,
    analyze,
    appendLog,
    canOpenReportTab,
    clearErrorState,
    createTask,
    debugEnabled,
    errorState,
    file,
    isBusy,
    latestCompletedTaskId,
    latestCompletedTaskIds,
    log,
    prepareFreshUpload,
    rememberCompletedTask,
    resetUploadDraft,
    scanVideoFlow,
    segmentScan,
    selectedActionLabel,
    selectedCompareTaskId,
    selectedCompareTaskIds,
    selectedSegmentIdState,
    selectedSegmentWindow,
    selectedVideoSummary,
    setActionType,
    setFile,
    setFriendlyError,
    setSelectedCompareTaskId,
    setSelectedSegmentId,
    setSelectedSegmentWindow,
    setSelectedVideoSummary,
    setTaskId,
    startAnalysisFlow,
    startSelectedSegmentFlow,
    taskId,
    uploadChecklistConfirmed,
    uploadVideo,
  ])

  return (
    <AnalysisSessionContext.Provider value={value}>
      {children}
    </AnalysisSessionContext.Provider>
  )
}

export function useAnalysisTask() {
  const context = useContext(AnalysisSessionContext)
  if (!context) {
    throw new Error('useAnalysisTask must be used within AnalysisSessionProvider')
  }
  return context
}
