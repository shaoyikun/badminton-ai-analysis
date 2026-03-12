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
  CreateTaskRequest,
  ErrorResponse,
  FlowActionTarget,
  FlowErrorCode,
  HistoryDetailResponse,
  HistoryListResponse,
  PoseAnalysisResult,
  PoseStatus,
  PreprocessStatus,
  ReportResult,
  RetestComparison,
  TaskHistoryItem,
  TaskStage,
  TaskStatus,
  TaskStatusResponse,
  UploadTaskResponse,
} from '../../../shared/contracts'
import {
  getActionLabel,
  getErrorCatalogItem,
  getErrorRouteAction,
  type LocalVideoSummary,
} from '../features/upload/uploadFlow'

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

export const API_BASE = import.meta.env.VITE_API_BASE || ''

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

type SessionSnapshot = {
  actionType: ActionType
  taskId: string
  latestCompletedTaskId: string
  selectedCompareTaskId: string
  selectedVideoSummary: LocalVideoSummary | null
  uploadChecklistConfirmed: boolean
  errorState: ErrorState
  debugEnabled: boolean
}

type FlowResult =
  | { ok: true }
  | { ok: false; reason: 'validation' | 'network' | 'server'; message?: string }

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
  selectedCompareTaskId: string
  setSelectedCompareTaskId: (value: string) => void
  selectedHistoryReport: ReportResult | null
  file: File | null
  selectedVideoSummary: LocalVideoSummary | null
  setSelectedVideoSummary: (value: LocalVideoSummary | null) => void
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
  analyze: (targetTaskId?: string) => Promise<boolean>
  startAnalysisFlow: () => Promise<FlowResult>
  refreshStatus: (options?: { silent?: boolean; targetTaskId?: string }) => Promise<TaskStatus | null>
  fetchResult: (targetTaskId?: string, showSuccessLog?: boolean) => Promise<ReportResult | null>
  ensureLatestReportLoaded: () => Promise<ReportResult | null>
  fetchHistory: (nextActionType?: ActionType) => Promise<TaskHistoryItem[]>
  fetchHistoryReport: (targetTaskId: string) => Promise<ReportResult | null>
  fetchComparison: (currentTaskId?: string, previousTaskId?: string) => Promise<RetestComparison | null>
  applyCustomComparison: (previousTaskId: string) => Promise<RetestComparison | null>
  analyzeHistoryTrend: () => string
  appendLog: (text: string) => void
}

const SESSION_STORAGE_KEY = 'badminton-ai-analysis-session'

const AnalysisSessionContext = createContext<AnalysisSessionContextValue | null>(null)

function readSessionSnapshot(): SessionSnapshot {
  if (typeof window === 'undefined') {
    return {
      actionType: 'clear',
      taskId: '',
      latestCompletedTaskId: '',
      selectedCompareTaskId: '',
      selectedVideoSummary: null,
      uploadChecklistConfirmed: false,
      errorState: null,
      debugEnabled: false,
    }
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) throw new Error('missing session')
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>
    return {
      actionType: 'clear',
      taskId: parsed.taskId ?? '',
      latestCompletedTaskId: parsed.latestCompletedTaskId ?? '',
      selectedCompareTaskId: parsed.selectedCompareTaskId ?? '',
      selectedVideoSummary: parsed.selectedVideoSummary ?? null,
      uploadChecklistConfirmed: Boolean(parsed.uploadChecklistConfirmed),
      errorState: parsed.errorState ?? null,
      debugEnabled: Boolean(parsed.debugEnabled),
    }
  } catch {
    return {
      actionType: 'clear',
      taskId: '',
      latestCompletedTaskId: '',
      selectedCompareTaskId: '',
      selectedVideoSummary: null,
      uploadChecklistConfirmed: false,
      errorState: null,
      debugEnabled: false,
    }
  }
}

function parseErrorPayload(data: ErrorResponse | { error?: ErrorResponse['error'] } | { error?: string }) {
  if (!data || typeof data !== 'object' || !('error' in data) || !data.error) {
    return undefined
  }
  return typeof data.error === 'string' ? undefined : data.error
}

function summarizeResponseText(rawText: string) {
  return rawText
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

function buildHttpErrorResponse(response: Response, rawText?: string): ErrorResponse {
  const summary = rawText ? summarizeResponseText(rawText) : ''
  return {
    error: {
      code: 'internal_error',
      category: 'internal_recovery',
      retryable: response.status >= 500,
      message: summary
        ? `HTTP ${response.status} ${response.statusText}: ${summary}`
        : `HTTP ${response.status} ${response.statusText}`,
      occurredAt: new Date().toISOString(),
    },
  }
}

async function readApiPayload<T>(response: Response): Promise<T | ErrorResponse> {
  const rawText = await response.text()

  if (!rawText) {
    if (response.ok) {
      throw new Error(`empty response body (${response.status})`)
    }
    return buildHttpErrorResponse(response)
  }

  try {
    return JSON.parse(rawText) as T | ErrorResponse
  } catch {
    if (response.ok) {
      throw new Error(`unexpected response format (${response.status})`)
    }
    return buildHttpErrorResponse(response, rawText)
  }
}

function getFallbackErrorCode(error: ReturnType<typeof parseErrorPayload>, fallbackCode: FlowErrorCode) {
  return !error?.code || error.code === 'internal_error' ? fallbackCode : error.code
}

function deriveStageStatuses(stage: TaskStage | '', status: TaskStatus | '', errorCode?: string): { preprocessStatus: PreprocessStatus; poseStatus: PoseStatus } {
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
  const [actionType, setActionType] = useState<ActionType>(initialSession.actionType)
  const [taskId, setTaskId] = useState(initialSession.taskId)
  const [latestCompletedTaskId, setLatestCompletedTaskId] = useState(initialSession.latestCompletedTaskId)
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [stage, setStage] = useState<TaskStage | ''>('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [preprocessStatus, setPreprocessStatus] = useState<PreprocessStatus>('idle')
  const [poseStatus, setPoseStatus] = useState<PoseStatus>('idle')
  const [report, setReport] = useState<ReportResult | null>(null)
  const [poseResult, setPoseResult] = useState<PoseAnalysisResult | null>(null)
  const [history, setHistory] = useState<TaskHistoryItem[]>([])
  const [comparison, setComparison] = useState<RetestComparison | null>(null)
  const [selectedCompareTaskId, setSelectedCompareTaskId] = useState(initialSession.selectedCompareTaskId)
  const [selectedHistoryReport, setSelectedHistoryReport] = useState<ReportResult | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [selectedVideoSummary, setSelectedVideoSummary] = useState<LocalVideoSummary | null>(initialSession.selectedVideoSummary)
  const [uploadChecklistConfirmed, setUploadChecklistConfirmed] = useState(initialSession.uploadChecklistConfirmed)
  const [log, setLog] = useState<string[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [isHydratingReport, setIsHydratingReport] = useState(false)
  const [errorState, setErrorState] = useState<ErrorState>(initialSession.errorState)
  const [debugEnabled, setDebugEnabled] = useState(initialSession.debugEnabled)
  const pollingRef = useRef<number | null>(null)
  const lastFailureReasonRef = useRef<'server' | 'network' | null>(null)

  const selectedActionLabel = getActionLabel(actionType)
  const canOpenReportTab = Boolean(latestCompletedTaskId)

  const appendLog = useCallback((text: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString('zh-CN', { hour12: false })} · ${text}`, ...prev].slice(0, 40))
  }, [])

  const clearErrorState = useCallback(() => setErrorState(null), [])

  const resetUploadDraft = useCallback(() => {
    setFile(null)
    setUploadChecklistConfirmed(false)
  }, [])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setIsPolling(false)
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
    setSelectedCompareTaskId('')
    setSelectedHistoryReport(null)
    setFile(null)
    setSelectedVideoSummary(null)
    setUploadChecklistConfirmed(false)
    setErrorState(null)
  }, [stopPolling])

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
    const derivedStatuses = deriveStageStatuses(snapshot.stage, snapshot.status, snapshot.error?.code)
    setPreprocessStatus(derivedStatuses.preprocessStatus)
    setPoseStatus(derivedStatuses.poseStatus)

    if (snapshot.status === 'completed') {
      setLatestCompletedTaskId(snapshot.taskId)
    }

    if (snapshot.error) {
      setFriendlyError(snapshot.error.code, snapshot.error.message)
    }
  }, [appendLog, setFriendlyError])

  const fetchHistory = useCallback(async (nextActionType?: ActionType) => {
    const nextType = nextActionType ?? actionType
    const response = await fetch(`${API_BASE}/api/history?actionType=${nextType}`)
    const data = await readApiPayload<HistoryListResponse>(response)
    if (!response.ok) {
      const error = parseErrorPayload(data as ErrorResponse)
      appendLog(`获取历史记录失败：${error?.message ?? '未知错误'}`)
      return []
    }
    const payload = data as HistoryListResponse
    setHistory(payload.items ?? [])
    return payload.items ?? []
  }, [actionType, appendLog])

  const fetchPoseResult = useCallback(async (targetTaskId?: string, silent = false) => {
    const currentTaskId = targetTaskId ?? taskId
    if (!currentTaskId) return null

    const response = await fetch(`${API_BASE}/api/debug/tasks/${currentTaskId}/pose`)
    const data = await readApiPayload<PoseAnalysisResult>(response)
    if (!response.ok) {
      if (!silent && poseStatus === 'failed') {
        const error = parseErrorPayload(data as ErrorResponse)
        setFriendlyError(getFallbackErrorCode(error, 'pose_failed'), error?.message)
      }
      return null
    }

    setPoseResult(data as PoseAnalysisResult)
    if (!silent) appendLog('已获取姿态摘要结果')
    return data as PoseAnalysisResult
  }, [appendLog, poseStatus, setFriendlyError, taskId])

  const fetchComparison = useCallback(async (currentTaskId?: string, previousTaskId?: string) => {
    const activeTaskId = currentTaskId ?? report?.taskId ?? latestCompletedTaskId ?? taskId
    if (!activeTaskId) return null

    const url = previousTaskId
      ? `${API_BASE}/api/tasks/${activeTaskId}/comparison?baselineTaskId=${previousTaskId}`
      : `${API_BASE}/api/tasks/${activeTaskId}/comparison`

    const response = await fetch(url)
    const data = await readApiPayload<ComparisonResponse>(response)
    if (!response.ok) {
      setComparison(null)
      const error = parseErrorPayload(data as ErrorResponse)
      if (previousTaskId) appendLog(`自定义对比失败：${error?.message ?? '未知错误'}`)
      return null
    }

    const payload = data as ComparisonResponse
    setComparison(payload.comparison ?? null)
    setSelectedCompareTaskId(payload.baselineTask.taskId)
    return payload.comparison ?? null
  }, [appendLog, latestCompletedTaskId, report?.taskId, taskId])

  const fetchResult = useCallback(async (targetTaskId?: string, showSuccessLog = true) => {
    const activeTaskId = targetTaskId ?? taskId
    if (!activeTaskId) {
      appendLog('请先创建任务')
      return null
    }

    const response = await fetch(`${API_BASE}/api/tasks/${activeTaskId}/result`)
    const data = await readApiPayload<ReportResult>(response)
    if (!response.ok) {
      const error = parseErrorPayload(data as ErrorResponse)
      setFriendlyError(getFallbackErrorCode(error, 'result_not_ready'), error?.message)
      return null
    }

    const reportPayload = data as ReportResult
    setTaskId(activeTaskId)
    setStatus('completed')
    setStage('completed')
    setProgressPercent(100)
    setReport(reportPayload)
    setErrorState(null)
    setLatestCompletedTaskId(activeTaskId)
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

    const response = await fetch(`${API_BASE}/api/tasks/${activeTaskId}`)
    const data = await readApiPayload<TaskStatusResponse>(response)
    if (!response.ok) {
      const error = parseErrorPayload(data)
      if (!options?.silent) appendLog(`查询状态失败：${error?.message ?? '未知错误'}`)
      return null
    }

    applyTaskSnapshot(data as TaskStatusResponse, Boolean(options?.silent))
    return (data as TaskStatusResponse).status
  }, [appendLog, applyTaskSnapshot, taskId])

  const startPolling = useCallback((nextTaskId: string) => {
    stopPolling()
    setIsPolling(true)
    appendLog('开始自动轮询任务状态')

    pollingRef.current = window.setInterval(async () => {
      const nextStatus = await refreshStatus({ silent: true, targetTaskId: nextTaskId })
      if (nextStatus === 'completed') {
        stopPolling()
        appendLog('分析已完成，正在进入报告')
        await fetchResult(nextTaskId, false)
      }
      if (nextStatus === 'failed') {
        stopPolling()
      }
    }, 1500)
  }, [appendLog, fetchResult, refreshStatus, stopPolling])

  const createTask = useCallback(async () => {
    try {
      lastFailureReasonRef.current = null
      setIsBusy(true)
      stopPolling()
      setErrorState(null)
      setReport(null)
      setPoseResult(null)
      setComparison(null)
      setSelectedHistoryReport(null)
      setSelectedCompareTaskId('')

      const response = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType } satisfies CreateTaskRequest),
      })
      const data = await readApiPayload<TaskStatusResponse>(response)
      if (!response.ok) {
        const error = parseErrorPayload(data)
        lastFailureReasonRef.current = 'server'
        setFriendlyError(getFallbackErrorCode(error, 'internal_error'), error?.message)
        appendLog(`创建任务失败：${error?.message ?? '未知错误'}`)
        return null
      }

      applyTaskSnapshot(data as TaskStatusResponse, true)
      appendLog(`任务已创建：${(data as TaskStatusResponse).taskId}（${selectedActionLabel}）`)
      await fetchHistory(actionType)
      return (data as TaskStatusResponse).taskId
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
      const form = new FormData()
      form.append('file', file)
      const response = await fetch(`${API_BASE}/api/tasks/${activeTaskId}/upload`, {
        method: 'POST',
        body: form,
      })
      const data = await readApiPayload<UploadTaskResponse>(response)
      if (!response.ok) {
        const error = parseErrorPayload(data)
        setFriendlyError(getFallbackErrorCode(error, 'upload_failed'), error?.message)
        return false
      }

      applyTaskSnapshot(data as TaskStatusResponse, true)
      appendLog(`上传完成：${(data as UploadTaskResponse).fileName ?? file.name}`)
      return true
    } catch (error) {
      lastFailureReasonRef.current = 'network'
      appendLog(`上传失败：${error instanceof Error ? error.message : '网络异常'}`)
      return false
    } finally {
      setIsBusy(false)
    }
  }, [appendLog, applyTaskSnapshot, file, setFriendlyError, taskId])

  const analyze = useCallback(async (targetTaskId?: string) => {
    const activeTaskId = targetTaskId ?? taskId
    if (!activeTaskId) return false

    try {
      lastFailureReasonRef.current = null
      setIsBusy(true)
      setErrorState(null)
      const response = await fetch(`${API_BASE}/api/tasks/${activeTaskId}/start`, { method: 'POST' })
      const data = await readApiPayload<TaskStatusResponse>(response)

      if (!response.ok) {
        const error = parseErrorPayload(data)
        setStatus('failed')
        setStage('failed')
        setFriendlyError(getFallbackErrorCode(error, 'internal_error'), error?.message)
        return false
      }

      applyTaskSnapshot(data as TaskStatusResponse, true)
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
  }, [appendLog, applyTaskSnapshot, setFriendlyError, startPolling, taskId])

  const startAnalysisFlow = useCallback(async (): Promise<FlowResult> => {
    if (!file) {
      return { ok: false, reason: 'validation', message: '请先选择视频文件。' }
    }

    const createdTaskId = await createTask()
    if (!createdTaskId) {
      return {
        ok: false,
        reason: lastFailureReasonRef.current === 'server' ? 'server' : 'network',
        message: '创建任务失败，请稍后再试。',
      }
    }

    const uploaded = await uploadVideo(createdTaskId)
    if (!uploaded) {
      return {
        ok: false,
        reason: lastFailureReasonRef.current === 'server' ? 'server' : 'network',
        message: '上传失败，请稍后再试。',
      }
    }

    const started = await analyze(createdTaskId)
    if (!started) {
      return {
        ok: false,
        reason: lastFailureReasonRef.current === 'server' ? 'server' : 'network',
        message: '启动分析失败，请稍后再试。',
      }
    }

    return { ok: true }
  }, [analyze, createTask, file, uploadVideo])

  const fetchHistoryReport = useCallback(async (targetTaskId: string) => {
    const response = await fetch(`${API_BASE}/api/history/${targetTaskId}`)
    const data = await readApiPayload<HistoryDetailResponse>(response)
    if (!response.ok) {
      const error = parseErrorPayload(data as ErrorResponse)
      appendLog(`历史样本详情获取失败：${error?.message ?? '未知错误'}`)
      return null
    }

    const payload = data as HistoryDetailResponse
    setSelectedHistoryReport(payload.report ?? null)
    appendLog('已打开历史样本详情')
    return payload.report
  }, [appendLog])

  const applyCustomComparison = useCallback(async (previousTaskId: string) => {
    const currentTaskId = report?.taskId ?? latestCompletedTaskId ?? taskId
    if (!currentTaskId || !previousTaskId) return null
    setSelectedCompareTaskId(previousTaskId)
    const result = await fetchComparison(currentTaskId, previousTaskId)
    if (result) appendLog('已切换到自定义历史样本对比')
    return result
  }, [appendLog, fetchComparison, latestCompletedTaskId, report?.taskId, taskId])

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
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      actionType,
      taskId,
      latestCompletedTaskId,
      selectedCompareTaskId,
      selectedVideoSummary,
      uploadChecklistConfirmed,
      errorState,
      debugEnabled,
    } satisfies SessionSnapshot))
  }, [
    actionType,
    debugEnabled,
    errorState,
    latestCompletedTaskId,
    selectedCompareTaskId,
    selectedVideoSummary,
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
    selectedCompareTaskId,
    setSelectedCompareTaskId,
    selectedHistoryReport,
    file,
    selectedVideoSummary,
    setSelectedVideoSummary,
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
