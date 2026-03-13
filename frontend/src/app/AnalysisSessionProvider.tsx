/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  ActionType,
  ComparisonResponse,
  FlowErrorCode,
  PoseAnalysisResult,
  PoseStatus,
  PreprocessStatus,
  ReportResult,
  RetestComparison,
  SegmentSelectionWindow,
  SegmentScanSummary,
  TaskHistoryItem,
  TaskStage,
  TaskStatus,
  TaskStatusResponse,
} from '../../../shared/contracts'
import {
  getActionLabel,
  getErrorCatalogItem,
  getErrorRouteAction,
  type LocalVideoSummary,
} from '../features/upload/uploadFlow'
import {
  createTaskRequest,
  fetchDebugPose,
  fetchHistoryDetail,
  fetchHistoryList,
  fetchTaskComparison,
  fetchTaskResult,
  fetchTaskStatus,
  getFallbackErrorCode,
  startTaskAnalysis,
  uploadTaskVideo,
} from './analysis-session/api'
import {
  deriveStageStatuses,
  getSegmentWindowForId,
  runScanVideoFlow,
  runStartAnalysisFlow,
  runStartSelectedSegmentFlow,
  startPollingTask,
  stopPollingTask,
} from './analysis-session/flow'
import { readSessionSnapshot, writeSessionSnapshot } from './analysis-session/storage'
import type { ActionTaskStateMap, ErrorState, FlowResult, SessionSnapshot } from './analysis-session/types'

export type {
  ActionType,
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
export type { ErrorState } from './analysis-session/types'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  created: '待上传',
  uploaded: '已上传',
  processing: '分析中',
  completed: '已完成',
  failed: '失败',
}

export const PREPROCESS_LABELS: Record<PreprocessStatus, string> = {
  idle: '未开始',
  queued: '待处理',
  processing: '校验与抽帧中',
  completed: '已完成',
  failed: '预处理失败',
}

export const POSE_LABELS: Record<PoseStatus, string> = {
  idle: '未开始',
  processing: '识别中',
  completed: '已完成',
  failed: '识别失败',
}


type AnalysisSessionContextValue = {
  actionType: ActionType
  setActionType: (value: ActionType) => void
  taskId: string
  latestCompletedTaskId: string
  status: TaskStatus | ''
  stage: TaskStage | ''
  progressPercent: number
  preprocessStatus: PreprocessStatus
  poseStatus: PoseStatus
  report: ReportResult | null
  poseResult: PoseAnalysisResult | null
  history: TaskHistoryItem[]
  comparison: RetestComparison | null
  comparisonUnavailableReason: ComparisonResponse['unavailableReason'] | null
  selectedCompareTaskId: string
  setSelectedCompareTaskId: (value: string) => void
  selectedHistoryReport: ReportResult | null
  file: File | null
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
  setFile: (value: File | null) => void
  log: string[]
  isBusy: boolean
  isPolling: boolean
  isHydratingReport: boolean
  errorState: ErrorState
  setErrorState: (value: ErrorState) => void
  clearErrorState: () => void
  debugEnabled: boolean
  setDebugEnabled: (value: boolean) => void
  selectedActionLabel: string
  canOpenReportTab: boolean
  createTask: () => Promise<string | null>
  uploadVideo: (targetTaskId?: string) => Promise<boolean>
  analyze: (targetTaskId?: string, selectedSegmentId?: string, selectedWindowOverride?: SegmentSelectionWindow | null) => Promise<boolean>
  scanVideoFlow: () => Promise<FlowResult>
  startSelectedSegmentFlow: () => Promise<FlowResult>
  startAnalysisFlow: () => Promise<FlowResult>
  refreshStatus: (options?: { silent?: boolean; targetTaskId?: string }) => Promise<TaskStatus | null>
  fetchResult: (targetTaskId?: string, showSuccessLog?: boolean) => Promise<ReportResult | null>
  ensureLatestReportLoaded: () => Promise<ReportResult | null>
  fetchHistory: (nextActionType?: ActionType) => Promise<TaskHistoryItem[]>
  fetchHistoryReport: (targetTaskId: string) => Promise<ReportResult | null>
  fetchComparison: (currentTaskId?: string, previousTaskId?: string) => Promise<ComparisonResponse | null>
  applyCustomComparison: (previousTaskId: string) => Promise<ComparisonResponse | null>
  analyzeHistoryTrend: () => string
  appendLog: (text: string) => void
}

const AnalysisSessionContext = createContext<AnalysisSessionContextValue | null>(null)

export function getErrorRouteActions(errorState: ErrorState) {
  if (!errorState) {
    return {
      primary: getErrorRouteAction('upload'),
      secondary: getErrorRouteAction('guide'),
    }
  }

  return {
    primary: getErrorRouteAction(errorState.primaryAction),
    secondary: getErrorRouteAction(errorState.secondaryAction),
  }
}

export function AnalysisSessionProvider({ children }: { children: ReactNode }) {
  const initialSession = readSessionSnapshot()
  const [actionType, setActionTypeState] = useState<ActionType>(initialSession.actionType)
  const [taskId, setTaskId] = useState(initialSession.taskId)
  const [latestCompletedTaskIds, setLatestCompletedTaskIds] = useState<ActionTaskStateMap>(initialSession.latestCompletedTaskIds)
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [stage, setStage] = useState<TaskStage | ''>('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [preprocessStatus, setPreprocessStatus] = useState<PreprocessStatus>('idle')
  const [poseStatus, setPoseStatus] = useState<PoseStatus>('idle')
  const [report, setReport] = useState<ReportResult | null>(null)
  const [poseResult, setPoseResult] = useState<PoseAnalysisResult | null>(null)
  const [history, setHistory] = useState<TaskHistoryItem[]>([])
  const [comparison, setComparison] = useState<RetestComparison | null>(null)
  const [comparisonUnavailableReason, setComparisonUnavailableReason] = useState<ComparisonResponse['unavailableReason'] | null>(null)
  const [selectedCompareTaskIds, setSelectedCompareTaskIds] = useState<ActionTaskStateMap>(initialSession.selectedCompareTaskIds)
  const [selectedHistoryReport, setSelectedHistoryReport] = useState<ReportResult | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [selectedVideoSummary, setSelectedVideoSummary] = useState<LocalVideoSummary | null>(initialSession.selectedVideoSummary)
  const [segmentScan, setSegmentScan] = useState<SegmentScanSummary | null>(initialSession.segmentScan)
  const [selectedSegmentId, setSelectedSegmentId] = useState(initialSession.selectedSegmentId)
  const [selectedSegmentWindow, setSelectedSegmentWindow] = useState<SegmentSelectionWindow | null>(initialSession.selectedSegmentWindow)
  const [uploadChecklistConfirmed, setUploadChecklistConfirmed] = useState(initialSession.uploadChecklistConfirmed)
  const [log, setLog] = useState<string[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [isHydratingReport, setIsHydratingReport] = useState(false)
  const [errorState, setErrorState] = useState<ErrorState>(initialSession.errorState)
  const [debugEnabled, setDebugEnabled] = useState(initialSession.debugEnabled)
  const pollingRef = useRef<number | null>(null)
  const lastFailureReasonRef = useRef<'server' | 'network' | null>(null)

  const latestCompletedTaskId = latestCompletedTaskIds[actionType] ?? ''
  const selectedCompareTaskId = selectedCompareTaskIds[actionType] ?? ''
  const selectedActionLabel = getActionLabel(actionType)
  const canOpenReportTab = Boolean(latestCompletedTaskId)

  const appendLog = useCallback((text: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString('zh-CN', { hour12: false })} · ${text}`, ...prev].slice(0, 40))
  }, [])

  const clearErrorState = useCallback(() => setErrorState(null), [])

  const resetUploadDraft = useCallback(() => {
    setFile(null)
    setUploadChecklistConfirmed(false)
    setSegmentScan(null)
    setSelectedSegmentId('')
    setSelectedSegmentWindow(null)
  }, [])

  const stopPolling = useCallback(() => {
    stopPollingTask(pollingRef, setIsPolling)
  }, [])

  const prepareFreshUpload = useCallback(() => {
    stopPolling()
    setTaskId('')
    setStatus('')
    setStage('')
    setProgressPercent(0)
    setPreprocessStatus('idle')
    setPoseStatus('idle')
    setReport(null)
    setPoseResult(null)
    setComparison(null)
    setComparisonUnavailableReason(null)
    setSelectedHistoryReport(null)
    setFile(null)
    setSelectedVideoSummary(null)
    setUploadChecklistConfirmed(false)
    setSegmentScan(null)
    setSelectedSegmentId('')
    setSelectedSegmentWindow(null)
    setErrorState(null)
  }, [stopPolling])

  const setSelectedCompareTaskId = useCallback((value: string) => {
    setSelectedCompareTaskIds((prev) => ({
      ...prev,
      [actionType]: value,
    }))
  }, [actionType])

  const setActionType = useCallback((value: ActionType) => {
    if (value === actionType) return
    prepareFreshUpload()
    setActionTypeState(value)
  }, [actionType, prepareFreshUpload])

  const updateSelectedSegmentId = useCallback((value: string) => {
    setSelectedSegmentId(value)
    setSelectedSegmentWindow(getSegmentWindowForId(segmentScan, value))
  }, [segmentScan])

  const setFriendlyError = useCallback((errorCode?: FlowErrorCode | string, fallback?: string) => {
    lastFailureReasonRef.current = 'server'
    const copy = getErrorCatalogItem(errorCode, fallback)
    setErrorState({ errorCode, ...copy })
    setFile(null)
    setUploadChecklistConfirmed(false)
    appendLog(`${copy.title}：${copy.summary}`)
  }, [appendLog])

  const applyTaskSnapshot = useCallback((snapshot: TaskStatusResponse, silent = false) => {
    setTaskId(snapshot.taskId)
    setStatus((prev) => {
      if (!silent && prev !== snapshot.status) {
        appendLog(`状态更新：${STATUS_LABELS[snapshot.status]}`)
      }
      return snapshot.status
    })
    setStage(snapshot.stage)
    setProgressPercent(snapshot.progressPercent ?? 0)
    setSegmentScan(snapshot.segmentScan ?? null)
    setSelectedSegmentId(snapshot.segmentScan?.selectedSegmentId ?? snapshot.segmentScan?.recommendedSegmentId ?? '')
    setSelectedSegmentWindow(snapshot.segmentScan?.selectedSegmentWindow ?? null)
    const derivedStatuses = deriveStageStatuses(snapshot.stage, snapshot.status, snapshot.error?.code)
    setPreprocessStatus(derivedStatuses.preprocessStatus)
    setPoseStatus(derivedStatuses.poseStatus)

    if (snapshot.status === 'completed') {
      setLatestCompletedTaskIds((prev) => ({
        ...prev,
        [snapshot.actionType]: snapshot.taskId,
      }))
    }

    if (snapshot.error) {
      setFriendlyError(snapshot.error.code, snapshot.error.message)
    }
  }, [appendLog, setFriendlyError])

  const fetchHistory = useCallback(async (nextActionType?: ActionType) => {
    const nextType = nextActionType ?? actionType
    const result = await fetchHistoryList(nextType)
    if (!result.ok) {
      appendLog(`获取历史记录失败：${result.error?.message ?? '未知错误'}`)
      return []
    }
    const payload = result.data
    setHistory(payload.items ?? [])
    return payload.items ?? []
  }, [actionType, appendLog])

  const fetchPoseResult = useCallback(async (targetTaskId?: string, silent = false) => {
    const currentTaskId = targetTaskId ?? taskId
    if (!currentTaskId) return null

    const result = await fetchDebugPose(currentTaskId)
    if (!result.ok) {
      if (!silent && poseStatus === 'failed') {
        setFriendlyError(getFallbackErrorCode(result.error, 'pose_failed'), result.error?.message)
      }
      return null
    }

    setPoseResult(result.data)
    if (!silent) appendLog('已获取姿态摘要结果')
    return result.data
  }, [appendLog, poseStatus, setFriendlyError, taskId])

  const fetchComparison = useCallback(async (currentTaskId?: string, previousTaskId?: string) => {
    const activeTaskId = currentTaskId ?? report?.taskId ?? latestCompletedTaskId ?? taskId
    if (!activeTaskId) return null

    const result = await fetchTaskComparison(activeTaskId, previousTaskId)
    if (!result.ok) {
      setComparison(null)
      setComparisonUnavailableReason(null)
      if (previousTaskId) appendLog(`自定义对比失败：${result.error?.message ?? '未知错误'}`)
      return null
    }

    const payload = result.data
    setComparison(payload.comparison ?? null)
    setComparisonUnavailableReason(payload.unavailableReason ?? null)
    setSelectedCompareTaskIds((prev) => ({
      ...prev,
      [payload.currentTask.actionType]: payload.baselineTask.taskId,
    }))
    return payload
  }, [appendLog, latestCompletedTaskId, report?.taskId, taskId])

  const fetchResult = useCallback(async (targetTaskId?: string, showSuccessLog = true) => {
    const activeTaskId = targetTaskId ?? taskId
    if (!activeTaskId) {
      appendLog('请先创建任务')
      return null
    }

    const result = await fetchTaskResult(activeTaskId)
    if (!result.ok) {
      setFriendlyError(getFallbackErrorCode(result.error, 'result_not_ready'), result.error?.message)
      return null
    }

    const reportPayload = result.data
    setTaskId(activeTaskId)
    setStatus('completed')
    setStage('completed')
    setProgressPercent(100)
    setReport(reportPayload)
    setErrorState(null)
    setLatestCompletedTaskIds((prev) => ({
      ...prev,
      [reportPayload.actionType]: activeTaskId,
    }))
    if (showSuccessLog) appendLog('已获取分析结果')
    await fetchHistory(reportPayload.actionType)
    await fetchPoseResult(activeTaskId, true)
    await fetchComparison(activeTaskId)
    return reportPayload
  }, [appendLog, fetchComparison, fetchHistory, fetchPoseResult, setFriendlyError, taskId])

  const refreshStatus = useCallback(async (options?: { silent?: boolean; targetTaskId?: string }) => {
    const activeTaskId = options?.targetTaskId ?? taskId
    if (!activeTaskId) {
      if (!options?.silent) appendLog('请先创建任务')
      return null
    }

    const result = await fetchTaskStatus(activeTaskId)
    if (!result.ok) {
      if (!options?.silent) appendLog(`查询状态失败：${result.error?.message ?? '未知错误'}`)
      return null
    }

    applyTaskSnapshot(result.data, Boolean(options?.silent))
    return result.data.status
  }, [appendLog, applyTaskSnapshot, taskId])

  const startPolling = useCallback((nextTaskId: string) => {
    startPollingTask({
      pollingRef,
      setIsPolling,
      appendLog,
      stopPolling,
      onTick: async () => {
        const nextStatus = await refreshStatus({ silent: true, targetTaskId: nextTaskId })
        if (nextStatus === 'completed') {
          stopPolling()
          appendLog('分析已完成，正在进入报告')
          await fetchResult(nextTaskId, false)
        }
        if (nextStatus === 'failed') {
          stopPolling()
        }
      },
    })
  }, [appendLog, fetchResult, refreshStatus, stopPolling])

  const getLastFailureReason = useCallback(() => lastFailureReasonRef.current, [])

  const createTask = useCallback(async () => {
    try {
      lastFailureReasonRef.current = null
      setIsBusy(true)
      stopPolling()
      setErrorState(null)
      setReport(null)
      setPoseResult(null)
      setComparison(null)
      setComparisonUnavailableReason(null)
      setSelectedHistoryReport(null)
      setSegmentScan(null)
      setSelectedSegmentId('')
      setSelectedCompareTaskIds((prev) => ({
        ...prev,
        [actionType]: '',
      }))

      const result = await createTaskRequest(actionType)
      if (!result.ok) {
        lastFailureReasonRef.current = 'server'
        setFriendlyError(getFallbackErrorCode(result.error, 'internal_error'), result.error?.message)
        appendLog(`创建任务失败：${result.error?.message ?? '未知错误'}`)
        return null
      }

      applyTaskSnapshot(result.data, true)
      appendLog(`任务已创建：${result.data.taskId}（${selectedActionLabel}）`)
      await fetchHistory(actionType)
      return result.data.taskId
    } catch (error) {
      lastFailureReasonRef.current = 'network'
      appendLog(`创建任务失败：${error instanceof Error ? error.message : '网络异常'}`)
      return null
    } finally {
      setIsBusy(false)
    }
  }, [actionType, appendLog, applyTaskSnapshot, fetchHistory, selectedActionLabel, setFriendlyError, stopPolling])

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

      applyTaskSnapshot(result.data, true)
      const uploadedPayload = result.data
      setSegmentScan(uploadedPayload.segmentScan ?? null)
      setSelectedSegmentId(uploadedPayload.segmentScan?.selectedSegmentId ?? uploadedPayload.segmentScan?.recommendedSegmentId ?? '')
      setSelectedSegmentWindow(uploadedPayload.segmentScan?.selectedSegmentWindow ?? null)
      appendLog(`上传完成：${uploadedPayload.fileName ?? file.name}`)
      return true
    } catch (error) {
      lastFailureReasonRef.current = 'network'
      appendLog(`上传失败：${error instanceof Error ? error.message : '网络异常'}`)
      return false
    } finally {
      setIsBusy(false)
    }
  }, [appendLog, applyTaskSnapshot, file, setFriendlyError, taskId])

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
      const selectedSegmentIdForRequest = (nextSelectedSegmentId ?? selectedSegmentId) || undefined
      const selectedWindowOverrideForRequest = nextSelectedWindowOverride ?? selectedSegmentWindow
      const result = await startTaskAnalysis(activeTaskId, {
        selectedSegmentId: selectedSegmentIdForRequest,
        selectedWindowOverride: selectedWindowOverrideForRequest,
      })

      if (!result.ok) {
        setStatus('failed')
        setStage('failed')
        setFriendlyError(getFallbackErrorCode(result.error, 'internal_error'), result.error?.message)
        return false
      }

      applyTaskSnapshot(result.data, true)
      appendLog('已启动分析')
      startPolling(activeTaskId)
      return true
    } catch (error) {
      lastFailureReasonRef.current = 'network'
      appendLog(`启动分析失败：${error instanceof Error ? error.message : '网络异常'}`)
      return false
    } finally {
      setIsBusy(false)
    }
  }, [appendLog, applyTaskSnapshot, selectedSegmentId, selectedSegmentWindow, setFriendlyError, startPolling, taskId])

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
      selectedSegmentId,
      selectedSegmentWindow,
      analyze,
      getLastFailureReason,
    })
  }, [analyze, getLastFailureReason, segmentScan, selectedSegmentId, selectedSegmentWindow, taskId])

  const startAnalysisFlow = useCallback(async (): Promise<FlowResult> => {
    return runStartAnalysisFlow({
      scanVideoFlow,
      startSelectedSegmentFlow,
    })
  }, [scanVideoFlow, startSelectedSegmentFlow])

  const fetchHistoryReport = useCallback(async (targetTaskId: string) => {
    const result = await fetchHistoryDetail(targetTaskId)
    if (!result.ok) {
      appendLog(`历史样本详情获取失败：${result.error?.message ?? '未知错误'}`)
      return null
    }

    const payload = result.data
    setSelectedHistoryReport(payload.report ?? null)
    appendLog('已打开历史样本详情')
    return payload.report
  }, [appendLog])

  const applyCustomComparison = useCallback(async (previousTaskId: string) => {
    const currentTaskId = report?.taskId ?? latestCompletedTaskId ?? taskId
    if (!currentTaskId || !previousTaskId) return null
    setSelectedCompareTaskIds((prev) => ({
      ...prev,
      [actionType]: previousTaskId,
    }))
    const result = await fetchComparison(currentTaskId, previousTaskId)
    if (result) appendLog('已切换到自定义历史样本对比')
    return result
  }, [actionType, appendLog, fetchComparison, latestCompletedTaskId, report?.taskId, taskId])

  const ensureLatestReportLoaded = useCallback(async () => {
    const targetTaskId = latestCompletedTaskId || taskId
    if (!targetTaskId) return null
    if (report && report.taskId === targetTaskId) return report

    setIsHydratingReport(true)
    try {
      const nextStatus = await refreshStatus({ silent: true, targetTaskId })
      if (nextStatus !== 'completed') return null
      return await fetchResult(targetTaskId, false)
    } finally {
      setIsHydratingReport(false)
    }
  }, [fetchResult, latestCompletedTaskId, refreshStatus, report, taskId])

  const analyzeHistoryTrend = useCallback(() => {
    if (history.length < 2) return '先完成第一次分析，后续这里会开始告诉你最近训练方向是不是在起作用。'

    const withScores = history.filter((item) => typeof item.totalScore === 'number')
    if (withScores.length < 2) return `你已经有 ${history.length} 条同动作历史样本，继续复测后，这里会显示分数和结论变化。`

    const latest = withScores[0]
    const previous = withScores[1]
    const delta = (latest.totalScore ?? 0) - (previous.totalScore ?? 0)
    if (delta > 0) return `最近一次较上一条提升 +${delta}，说明训练方向在起作用。`
    if (delta < 0) return `最近一次较上一条回落 ${delta}，建议先回看上次样本确认哪里没稳住。`
    return '最近两次整体持平，建议继续盯住一个核心问题，不要同时改太多点。'
  }, [history])

  useEffect(() => {
    writeSessionSnapshot({
      actionType,
      taskId,
      latestCompletedTaskIds,
      selectedCompareTaskIds,
      selectedVideoSummary,
      uploadChecklistConfirmed,
      segmentScan,
      selectedSegmentId,
      selectedSegmentWindow,
      errorState,
      debugEnabled,
    } satisfies SessionSnapshot)
  }, [
    actionType,
    debugEnabled,
    errorState,
    latestCompletedTaskIds,
    selectedCompareTaskIds,
    selectedVideoSummary,
    segmentScan,
    selectedSegmentId,
    selectedSegmentWindow,
    taskId,
    uploadChecklistConfirmed,
  ])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const debugParam = params.get('debug')
    if (debugParam === '1') setDebugEnabled(true)
    if (debugParam === '0') setDebugEnabled(false)
  }, [])

  useEffect(() => {
    void fetchHistory(actionType)
  }, [actionType, fetchHistory])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  useEffect(() => {
    if (!taskId) return

    void (async () => {
      const nextStatus = await refreshStatus({ silent: true, targetTaskId: taskId })
      if (nextStatus === 'completed') {
        await fetchResult(taskId, false)
      } else if (nextStatus === 'processing') {
        startPolling(taskId)
      }
    })()
  }, [fetchResult, refreshStatus, startPolling, taskId])

  const value: AnalysisSessionContextValue = {
    actionType,
    setActionType,
    taskId,
    latestCompletedTaskId,
    status,
    stage,
    progressPercent,
    preprocessStatus,
    poseStatus,
    report,
    poseResult,
    history,
    comparison,
    comparisonUnavailableReason,
    selectedCompareTaskId,
    setSelectedCompareTaskId,
    selectedHistoryReport,
    file,
    selectedVideoSummary,
    setSelectedVideoSummary,
    segmentScan,
    selectedSegmentId,
    setSelectedSegmentId: updateSelectedSegmentId,
    selectedSegmentWindow,
    setSelectedSegmentWindow,
    uploadChecklistConfirmed,
    setUploadChecklistConfirmed,
    resetUploadDraft,
    prepareFreshUpload,
    setFile,
    log,
    isBusy,
    isPolling,
    isHydratingReport,
    errorState,
    setErrorState,
    clearErrorState,
    debugEnabled,
    setDebugEnabled,
    selectedActionLabel,
    canOpenReportTab,
    createTask,
    uploadVideo,
    analyze,
    scanVideoFlow,
    startSelectedSegmentFlow,
    startAnalysisFlow,
    refreshStatus,
    fetchResult,
    ensureLatestReportLoaded,
    fetchHistory,
    fetchHistoryReport,
    fetchComparison,
    applyCustomComparison,
    analyzeHistoryTrend,
    appendLog,
  }

  return (
    <AnalysisSessionContext.Provider value={value}>
      {children}
    </AnalysisSessionContext.Provider>
  )
}

export function useAnalysisTask() {
  const context = useContext(AnalysisSessionContext)
  if (!context) throw new Error('useAnalysisTask must be used within AnalysisSessionProvider')
  return context
}
