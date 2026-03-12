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
  CreateTaskResponse,
  HistoryDetailResponse,
  HistoryListResponse,
  PoseAnalysisResult,
  PoseStatus,
  PreprocessStatus,
  ReportResult,
  RetestComparison,
  TaskHistoryItem,
  TaskStatus,
  TaskStatusResponse,
  UploadTaskResponse,
} from '../../../shared/contracts'

export type {
  ActionType,
  PoseAnalysisResult as PoseResult,
  PoseStatus,
  PreprocessStatus,
  ReportResult,
  RetestComparison,
  TaskHistoryItem,
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
  queued: '排队中',
  processing: '校验与抽帧中',
  completed: '校验完成',
  failed: '预处理失败',
}

export const POSE_LABELS: Record<PoseStatus, string> = {
  idle: '未开始',
  processing: '识别中',
  completed: '已完成',
  failed: '识别失败',
}

export type ErrorState = {
  errorCode?: string
  title: string
  message: string
} | null

type SessionSnapshot = {
  actionType: ActionType
  taskId: string
  latestCompletedTaskId: string
  selectedCompareTaskId: string
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

const ERROR_COPY: Record<string, { title: string; message: string }> = {
  upload_failed: {
    title: '视频暂时不能处理',
    message: '请确认上传的是清晰、完整且可正常播放的视频文件，再重新上传。',
  },
  invalid_duration: {
    title: '视频时长不符合要求',
    message: '请控制在 5~15 秒之间，并保留完整准备、击球和收拍过程。',
  },
  multi_person_detected: {
    title: '检测到多人同框',
    message: '请只保留一个主体出镜，避免其他人干扰画面。',
  },
  body_not_detected: {
    title: '未识别到清晰人体',
    message: '请让人物全身尽量完整入镜，并确保动作过程没有被裁切。',
  },
  poor_lighting_or_occlusion: {
    title: '画面质量不足',
    message: '请调整光线、减少遮挡，并确保人物在画面中足够清晰。',
  },
  invalid_camera_angle: {
    title: '机位不利于分析',
    message: '建议改为侧后方或正后方机位重新拍摄。',
  },
  preprocess_failed: {
    title: '预处理失败',
    message: '这段视频没能顺利通过预处理，请更换一段更规范的视频重试。',
  },
  pose_failed: {
    title: '姿态识别失败',
    message: '视频已上传并完成预处理，但姿态识别阶段失败。你可以先查看拍摄规范，再换一段视频重试。',
  },
  result_not_ready: {
    title: '结果暂未就绪',
    message: '分析任务已经启动，但报告结果还没准备好，请稍后再试。',
  },
}

const AnalysisSessionContext = createContext<AnalysisSessionContextValue | null>(null)

function readSessionSnapshot(): SessionSnapshot {
  if (typeof window === 'undefined') {
    return {
      actionType: 'clear',
      taskId: '',
      latestCompletedTaskId: '',
      selectedCompareTaskId: '',
      errorState: null,
      debugEnabled: false,
    }
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) throw new Error('missing session')
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>
    return {
      actionType: parsed.actionType === 'smash' ? 'smash' : 'clear',
      taskId: parsed.taskId ?? '',
      latestCompletedTaskId: parsed.latestCompletedTaskId ?? '',
      selectedCompareTaskId: parsed.selectedCompareTaskId ?? '',
      errorState: parsed.errorState ?? null,
      debugEnabled: Boolean(parsed.debugEnabled),
    }
  } catch {
    return {
      actionType: 'clear',
      taskId: '',
      latestCompletedTaskId: '',
      selectedCompareTaskId: '',
      errorState: null,
      debugEnabled: false,
    }
  }
}

function getErrorCopy(errorCode?: string, fallback?: string) {
  if (errorCode && ERROR_COPY[errorCode]) return ERROR_COPY[errorCode]
  return {
    title: '处理失败',
    message: fallback ?? '这次处理没有成功，你可以换一段更规范的视频再试一次。',
  }
}

export function getErrorRouteActions(errorCode?: string) {
  switch (errorCode) {
    case 'multi_person_detected':
    case 'body_not_detected':
    case 'poor_lighting_or_occlusion':
    case 'invalid_camera_angle':
      return {
        primary: { label: '查看拍摄规范', to: '/guide' },
        secondary: { label: '重新上传', to: '/upload' },
      }
    case 'upload_failed':
    case 'invalid_duration':
    case 'preprocess_failed':
    case 'pose_failed':
    default:
      return {
        primary: { label: '重新上传', to: '/upload' },
        secondary: { label: '查看拍摄规范', to: '/guide' },
      }
  }
}

export function AnalysisSessionProvider({ children }: { children: ReactNode }) {
  const initialSession = readSessionSnapshot()
  const [actionType, setActionType] = useState<ActionType>(initialSession.actionType)
  const [taskId, setTaskId] = useState(initialSession.taskId)
  const [latestCompletedTaskId, setLatestCompletedTaskId] = useState(initialSession.latestCompletedTaskId)
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [preprocessStatus, setPreprocessStatus] = useState<PreprocessStatus>('idle')
  const [poseStatus, setPoseStatus] = useState<PoseStatus>('idle')
  const [report, setReport] = useState<ReportResult | null>(null)
  const [poseResult, setPoseResult] = useState<PoseAnalysisResult | null>(null)
  const [history, setHistory] = useState<TaskHistoryItem[]>([])
  const [comparison, setComparison] = useState<RetestComparison | null>(null)
  const [selectedCompareTaskId, setSelectedCompareTaskId] = useState(initialSession.selectedCompareTaskId)
  const [selectedHistoryReport, setSelectedHistoryReport] = useState<ReportResult | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [isHydratingReport, setIsHydratingReport] = useState(false)
  const [errorState, setErrorState] = useState<ErrorState>(initialSession.errorState)
  const [debugEnabled, setDebugEnabled] = useState(initialSession.debugEnabled)
  const pollingRef = useRef<number | null>(null)
  const lastFailureReasonRef = useRef<'server' | 'network' | null>(null)

  const selectedActionLabel = actionType === 'smash' ? '杀球' : '正手高远球'
  const canOpenReportTab = Boolean(latestCompletedTaskId)

  const appendLog = useCallback((text: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString('zh-CN', { hour12: false })} · ${text}`, ...prev].slice(0, 40))
  }, [])

  const clearErrorState = useCallback(() => setErrorState(null), [])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setIsPolling(false)
  }, [])

  const setFriendlyError = useCallback((errorCode?: string, fallback?: string) => {
    lastFailureReasonRef.current = 'server'
    const copy = getErrorCopy(errorCode, fallback)
    setErrorState({ errorCode, ...copy })
    appendLog(`${copy.title}：${copy.message}`)
  }, [appendLog])

  const fetchHistory = useCallback(async (nextActionType?: ActionType) => {
    const nextType = nextActionType ?? actionType
    const response = await fetch(`${API_BASE}/api/history?actionType=${nextType}`)
    const data = await response.json() as HistoryListResponse
    if (!response.ok) {
      appendLog('获取历史记录失败')
      return []
    }
    setHistory(data.items ?? [])
    return data.items ?? []
  }, [actionType, appendLog])

  const fetchPoseResult = useCallback(async (targetTaskId?: string, silent = false) => {
    const currentTaskId = targetTaskId ?? taskId
    if (!currentTaskId) return null

    const response = await fetch(`${API_BASE}/api/tasks/${currentTaskId}/pose`)
    const data = await response.json() as PoseAnalysisResult & { error?: string }
    if (!response.ok) {
      if (!silent && poseStatus === 'failed') {
        setFriendlyError('pose_failed', data.error)
      }
      return null
    }

    setPoseResult(data)
    setPoseStatus('completed')
    if (!silent) appendLog('已获取姿态摘要结果')
    return data
  }, [appendLog, poseStatus, setFriendlyError, taskId])

  const fetchComparison = useCallback(async (currentTaskId?: string, previousTaskId?: string) => {
    const activeTaskId = currentTaskId ?? report?.taskId ?? latestCompletedTaskId ?? taskId
    if (!activeTaskId) return null

    const url = previousTaskId
      ? `${API_BASE}/api/tasks/${activeTaskId}/comparison?previousTaskId=${previousTaskId}`
      : `${API_BASE}/api/tasks/${activeTaskId}/comparison`

    const response = await fetch(url)
    const data = await response.json() as ComparisonResponse & { error?: string }
    if (!response.ok) {
      setComparison(null)
      if (previousTaskId) appendLog(`自定义对比失败：${data.error ?? '未知错误'}`)
      return null
    }

    setComparison(data.comparison ?? null)
    if (data.history) setHistory(data.history)
    if (data.comparison?.previousTaskId) {
      setSelectedCompareTaskId(data.comparison.previousTaskId)
    }
    return data.comparison ?? null
  }, [appendLog, latestCompletedTaskId, report?.taskId, taskId])

  const fetchResult = useCallback(async (targetTaskId?: string, showSuccessLog = true) => {
    const activeTaskId = targetTaskId ?? taskId
    if (!activeTaskId) {
      appendLog('请先创建任务')
      return null
    }

    const response = await fetch(`${API_BASE}/api/tasks/${activeTaskId}/result`)
    const data = await response.json() as ReportResult & { error?: string }
    if (!response.ok) {
      setFriendlyError('result_not_ready', data.error)
      return null
    }

    setTaskId(activeTaskId)
    setStatus('completed')
    setReport(data)
    setErrorState(null)
    setComparison(data.comparison ?? null)
    setHistory(data.history ?? [])
    setLatestCompletedTaskId(activeTaskId)
    setSelectedCompareTaskId(data.comparison?.previousTaskId ?? selectedCompareTaskId)
    if (showSuccessLog) appendLog('已获取分析结果')
    await fetchPoseResult(activeTaskId, true)
    await fetchComparison(activeTaskId, data.comparison?.previousTaskId)
    return data
  }, [appendLog, fetchComparison, fetchPoseResult, selectedCompareTaskId, setFriendlyError, taskId])

  const refreshStatus = useCallback(async (options?: { silent?: boolean; targetTaskId?: string }) => {
    const activeTaskId = options?.targetTaskId ?? taskId
    if (!activeTaskId) {
      if (!options?.silent) appendLog('请先创建任务')
      return null
    }

    const response = await fetch(`${API_BASE}/api/tasks/${activeTaskId}`)
    const data = await response.json() as TaskStatusResponse & { error?: string }
    if (!response.ok) {
      if (!options?.silent) appendLog(`查询状态失败：${data.error ?? '未知错误'}`)
      return null
    }

    setTaskId(activeTaskId)
    setStatus((prev) => {
      if (!options?.silent && prev !== data.status) {
        appendLog(`状态更新：${STATUS_LABELS[data.status]}`)
      }
      return data.status
    })
    setPreprocessStatus(data.preprocessStatus ?? 'idle')
    setPoseStatus(data.poseStatus ?? 'idle')

    if (data.status === 'failed' && data.errorCode) {
      setFriendlyError(data.errorCode, data.errorMessage)
    }

    if (data.status === 'completed') {
      setLatestCompletedTaskId(activeTaskId)
    }

    return data.status
  }, [appendLog, setFriendlyError, taskId])

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
      const data = await response.json() as CreateTaskResponse & { error?: string }
      if (!response.ok) {
        appendLog(`创建任务失败：${data.error ?? '未知错误'}`)
        return null
      }

      setTaskId(data.taskId)
      setStatus(data.status)
      setPreprocessStatus('idle')
      setPoseStatus('idle')
      appendLog(`任务已创建：${data.taskId}（${selectedActionLabel}）`)
      await fetchHistory(actionType)
      return data.taskId
    } catch (error) {
      lastFailureReasonRef.current = 'network'
      appendLog(`创建任务失败：${error instanceof Error ? error.message : '网络异常'}`)
      return null
    } finally {
      setIsBusy(false)
    }
  }, [actionType, appendLog, fetchHistory, selectedActionLabel, stopPolling])

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
      const data = await response.json() as UploadTaskResponse & { error?: string; errorCode?: string }
      if (!response.ok) {
        setFriendlyError(data.errorCode, data.error)
        return false
      }

      setTaskId(activeTaskId)
      setStatus(data.status)
      setPreprocessStatus(data.preprocessStatus ?? 'idle')
      setPoseStatus('idle')
      appendLog(`上传完成：${data.fileName ?? file.name}`)
      return true
    } catch (error) {
      lastFailureReasonRef.current = 'network'
      appendLog(`上传失败：${error instanceof Error ? error.message : '网络异常'}`)
      return false
    } finally {
      setIsBusy(false)
    }
  }, [appendLog, file, setFriendlyError, taskId])

  const analyze = useCallback(async (targetTaskId?: string) => {
    const activeTaskId = targetTaskId ?? taskId
    if (!activeTaskId) return false

    try {
      lastFailureReasonRef.current = null
      setIsBusy(true)
      setErrorState(null)
      const response = await fetch(`${API_BASE}/api/tasks/${activeTaskId}/analyze`, { method: 'POST' })
      const data = await response.json() as {
        status?: TaskStatus
        preprocessStatus?: PreprocessStatus
        error?: string
        errorCode?: string
      }

      if (!response.ok) {
        setStatus('failed')
        setPreprocessStatus(data.preprocessStatus ?? 'failed')
        setFriendlyError(data.errorCode ?? 'preprocess_failed', data.error)
        return false
      }

      setTaskId(activeTaskId)
      setStatus(data.status ?? 'processing')
      setPreprocessStatus(data.preprocessStatus ?? 'idle')
      setPoseStatus('idle')
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
  }, [appendLog, setFriendlyError, startPolling, taskId])

  const startAnalysisFlow = useCallback(async (): Promise<FlowResult> => {
    if (!file) {
      return { ok: false, reason: 'validation', message: '请先选择视频文件。' }
    }

    const createdTaskId = await createTask()
    if (!createdTaskId) {
      return { ok: false, reason: 'network', message: '创建任务失败，请稍后再试。' }
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
    const data = await response.json() as HistoryDetailResponse & { error?: string }
    if (!response.ok) {
      appendLog(`历史样本详情获取失败：${data.error ?? '未知错误'}`)
      return null
    }

    setSelectedHistoryReport(data.report ?? null)
    appendLog('已打开历史样本详情')
    return data.report
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
      errorState,
      debugEnabled,
    } satisfies SessionSnapshot))
  }, [actionType, debugEnabled, errorState, latestCompletedTaskId, selectedCompareTaskId, taskId])

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
