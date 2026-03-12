import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type TaskStatus = 'created' | 'uploaded' | 'processing' | 'completed' | 'failed'
export type PreprocessStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed'
export type PoseStatus = 'idle' | 'processing' | 'completed' | 'failed'

export type TaskHistoryItem = {
  taskId: string
  actionType: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
  totalScore?: number
  summaryText?: string
  poseBased?: boolean
}

export type RetestDeltaItem = {
  name: string
  previousScore: number
  currentScore: number
  delta: number
}

export type RetestComparison = {
  previousTaskId: string
  previousCreatedAt?: string
  currentTaskId: string
  currentCreatedAt?: string
  totalScoreDelta: number
  improvedDimensions: RetestDeltaItem[]
  declinedDimensions: RetestDeltaItem[]
  unchangedDimensions: RetestDeltaItem[]
  summaryText: string
  coachReview: {
    headline: string
    progressNote: string
    keepDoing?: string
    regressionNote?: string
    nextFocus: string
    nextCheck: string
  }
}

export type ReportResult = {
  taskId: string
  actionType: string
  totalScore: number
  summaryText?: string
  poseBased?: boolean
  compareSummary?: string
  comparison?: RetestComparison
  history?: TaskHistoryItem[]
  standardComparison?: {
    sectionTitle: string
    summaryText: string
    currentFrameLabel: string
    standardFrameLabel: string
    standardReference: {
      title: string
      cue: string
      imageLabel: string
      imagePath?: string
      sourceType?: 'illustration' | 'real-sample'
    }
    phaseFrames?: {
      phase: string
      title: string
      imagePath: string
      cue: string
    }[]
    differences: string[]
  }
  scoringEvidence?: {
    detectedFrameCount?: number
    frameCount?: number
    avgStabilityScore?: number
    avgBodyTurnScore?: number
    avgRacketArmLiftScore?: number
    bestFrameIndex?: number | null
    humanSummary?: string
  }
  dimensionScores: { name: string; score: number }[]
  issues: { title: string; description: string; impact: string }[]
  suggestions: { title: string; description: string }[]
  retestAdvice: string
  preprocess?: {
    metadata?: {
      fileName: string
      fileSizeBytes: number
      durationSeconds?: number
      estimatedFrames?: number
      width?: number
      height?: number
      frameRate?: number
      metadataSource?: string
    }
    artifacts?: {
      framePlan?: {
        strategy: string
        targetFrameCount: number
      }
      sampledFrames?: { index: number; timestampSeconds: number; fileName: string; relativePath?: string }[]
    }
  }
}

export type PoseResult = {
  engine: string
  frameCount: number
  detectedFrameCount: number
  summary: {
    bestFrameIndex: number | null
    stableFrameCount: number
    avgStabilityScore: number
    avgBodyTurnScore: number
    avgRacketArmLiftScore: number
    humanSummary: string
  }
  frames: {
    frameIndex: number
    fileName: string
    status: string
    metrics: {
      stabilityScore: number
      bodyTurnScore: number | null
      racketArmLiftScore: number | null
      summaryText: string
    } | null
  }[]
}

export const API_BASE = import.meta.env.VITE_API_BASE || ''
export const STATUS_LABELS: Record<TaskStatus, string> = {
  created: '已创建',
  uploaded: '已上传',
  processing: '分析中',
  completed: '已完成',
  failed: '失败',
}
export const PREPROCESS_LABELS: Record<PreprocessStatus, string> = {
  idle: '未开始',
  queued: '排队中',
  processing: '预处理中',
  completed: '预处理完成',
  failed: '预处理失败',
}
export const POSE_LABELS: Record<PoseStatus, string> = {
  idle: '未开始',
  processing: '识别中',
  completed: '已完成',
  failed: '识别失败',
}
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
    message: '视频已上传并完成预处理，但姿态识别阶段失败。你可以先查看预处理结果，或换一段视频重试。',
  },
  result_not_ready: {
    title: '结果暂未就绪',
    message: '分析任务已经启动，但报告结果还没准备好，请稍后再试。',
  },
}

function getErrorCopy(errorCode?: string, fallback?: string) {
  if (errorCode && ERROR_COPY[errorCode]) return ERROR_COPY[errorCode]
  return {
    title: '处理失败',
    message: fallback ?? '这次处理没有成功，你可以换一段更规范的视频再试一次。',
  }
}

export function useAnalysisTask() {
  const [actionType, setActionType] = useState('clear')
  const [taskId, setTaskId] = useState('')
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [preprocessStatus, setPreprocessStatus] = useState<PreprocessStatus>('idle')
  const [poseStatus, setPoseStatus] = useState<PoseStatus>('idle')
  const [report, setReport] = useState<ReportResult | null>(null)
  const [poseResult, setPoseResult] = useState<PoseResult | null>(null)
  const [history, setHistory] = useState<TaskHistoryItem[]>([])
  const [comparison, setComparison] = useState<RetestComparison | null>(null)
  const [selectedCompareTaskId, setSelectedCompareTaskId] = useState('')
  const [selectedHistoryReport, setSelectedHistoryReport] = useState<ReportResult | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [errorState, setErrorState] = useState<{ errorCode?: string; title: string; message: string } | null>(null)
  const pollingRef = useRef<number | null>(null)

  const canUpload = Boolean(taskId && file && (status === 'created' || status === 'uploaded'))
  const canAnalyze = Boolean(taskId && status === 'uploaded')
  const canFetchResult = Boolean(taskId && status === 'completed')
  const selectedActionLabel = useMemo(() => (actionType === 'smash' ? '杀球' : '正手高远球'), [actionType])

  const appendLog = (text: string) => setLog((prev) => [`${new Date().toLocaleTimeString('zh-CN', { hour12: false })} · ${text}`, ...prev])

  function stopPolling() {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setIsPolling(false)
  }

  function setFriendlyError(errorCode?: string, fallback?: string) {
    const copy = getErrorCopy(errorCode, fallback)
    setErrorState({ errorCode, ...copy })
    appendLog(`${copy.title}：${copy.message}`)
  }

  const fetchHistory = useCallback(async (nextActionType?: string) => {
    const action = nextActionType ?? actionType
    const res = await fetch(`${API_BASE}/api/history?actionType=${action}`)
    const data = await res.json()
    if (!res.ok) return []
    const items = data.items ?? []
    setHistory(items)
    return items as TaskHistoryItem[]
  }, [actionType])

  async function fetchComparison(currentTaskId?: string, previousTaskId?: string) {
    const targetTaskId = currentTaskId ?? taskId
    if (!targetTaskId) return null

    const url = previousTaskId
      ? `${API_BASE}/api/tasks/${targetTaskId}/comparison?previousTaskId=${previousTaskId}`
      : `${API_BASE}/api/tasks/${targetTaskId}/comparison`

    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok) {
      setComparison(null)
      if (previousTaskId) appendLog(`自定义对比失败：${data.error ?? '未知错误'}`)
      return null
    }
    setComparison(data.comparison ?? null)
    if (data.history) setHistory(data.history)
    if (data.comparison?.previousTaskId) setSelectedCompareTaskId(data.comparison.previousTaskId)
    return data.comparison as RetestComparison | null
  }

  async function applyCustomComparison(previousTaskId: string) {
    if (!taskId || !previousTaskId) return
    setSelectedCompareTaskId(previousTaskId)
    await fetchComparison(taskId, previousTaskId)
    appendLog('已切换到自定义历史样本对比')
  }

  async function fetchHistoryReport(targetTaskId: string) {
    const res = await fetch(`${API_BASE}/api/history/${targetTaskId}`)
    const data = await res.json()
    if (!res.ok) {
      appendLog(`历史样本详情获取失败：${data.error ?? '未知错误'}`)
      return null
    }
    setSelectedHistoryReport(data.report ?? null)
    appendLog('已打开历史样本详情')
    return data.report as ReportResult | null
  }

  async function createTask() {
    try {
      setIsBusy(true)
      stopPolling()
      setErrorState(null)
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType }),
      })
      const data = await res.json()
      if (!res.ok) {
        appendLog(`创建任务失败：${data.error ?? '未知错误'}`)
        return
      }
      setTaskId(data.taskId)
      setStatus(data.status)
      setPreprocessStatus('idle')
      setPoseStatus('idle')
      setReport(null)
      setPoseResult(null)
      setComparison(null)
      setSelectedCompareTaskId('')
      setSelectedHistoryReport(null)
      await fetchHistory(actionType)
      appendLog(`任务已创建：${data.taskId}（${selectedActionLabel}）`)
    } catch (error) {
      appendLog(`创建任务失败：${error instanceof Error ? error.message : '网络异常'}`)
    } finally {
      setIsBusy(false)
    }
  }

  async function uploadVideo() {
    if (!taskId) return appendLog('请先创建任务')
    if (!file) return appendLog('请先选择视频文件')

    try {
      setIsBusy(true)
      setErrorState(null)
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/upload`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) {
        setFriendlyError(data.errorCode, data.error)
        return
      }
      setStatus(data.status)
      setPreprocessStatus(data.preprocessStatus ?? 'idle')
      setPoseStatus('idle')
      setPoseResult(null)
      setComparison(null)
      setSelectedCompareTaskId('')
      setSelectedHistoryReport(null)
      appendLog(`上传完成：${data.fileName}`)
    } catch (error) {
      appendLog(`上传失败：${error instanceof Error ? error.message : '网络异常'}`)
    } finally {
      setIsBusy(false)
    }
  }

  async function fetchPoseResult(silent = false) {
    if (!taskId) return null
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}/pose`)
    const data = await res.json()
    if (!res.ok) {
      if (poseStatus === 'failed') {
        setFriendlyError('pose_failed', data.error)
      } else if (!silent) {
        appendLog(`姿态结果未就绪：${data.error ?? '未知错误'}`)
      }
      return null
    }
    setPoseResult(data)
    setPoseStatus('completed')
    if (!silent) appendLog('已获取姿态摘要结果')
    return data as PoseResult
  }

  async function fetchResult(showSuccessLog = true) {
    if (!taskId) {
      appendLog('请先创建任务')
      return null
    }

    const res = await fetch(`${API_BASE}/api/tasks/${taskId}/result`)
    const data = await res.json()
    if (!res.ok) {
      setFriendlyError('result_not_ready', data.error)
      return null
    }
    setReport(data)
    setErrorState(null)
    setComparison(data.comparison ?? null)
    setHistory(data.history ?? [])
    setSelectedCompareTaskId(data.comparison?.previousTaskId ?? '')
    if (showSuccessLog) appendLog('已自动拉取分析结果')
    await fetchPoseResult(true)
    await fetchComparison(taskId, data.comparison?.previousTaskId)
    return data as ReportResult
  }

  async function refreshStatus(options?: { silent?: boolean }) {
    if (!taskId) {
      if (!options?.silent) appendLog('请先创建任务')
      return null
    }

    const res = await fetch(`${API_BASE}/api/tasks/${taskId}`)
    const data = await res.json()
    if (!res.ok) {
      if (!options?.silent) appendLog(`查询状态失败：${data.error ?? '未知错误'}`)
      return null
    }

    setPreprocessStatus(data.preprocessStatus ?? 'idle')
    setPoseStatus(data.poseStatus ?? 'idle')
    if (data.status === 'failed' && data.errorCode) {
      setFriendlyError(data.errorCode, data.errorMessage)
    }
    if (data.poseStatus === 'failed') {
      setFriendlyError('pose_failed', data.poseSummary?.humanSummary ?? data.errorMessage)
    }
    setStatus((prev) => {
      if (prev !== data.status && !options?.silent) {
        appendLog(`状态更新：${STATUS_LABELS[data.status as TaskStatus] ?? data.status}`)
      }
      return data.status
    })

    return data.status as TaskStatus
  }

  function startPolling() {
    stopPolling()
    setIsPolling(true)
    appendLog('开始自动轮询任务状态')

    pollingRef.current = window.setInterval(async () => {
      const nextStatus = await refreshStatus({ silent: true })
      if (nextStatus === 'completed') {
        stopPolling()
        appendLog('分析已完成，正在自动获取结果')
        await fetchResult(false)
      }
      if (nextStatus === 'failed') {
        stopPolling()
      }
    }, 1500)
  }

  async function analyze() {
    if (!taskId) return appendLog('请先创建任务')
    if (status !== 'uploaded') return appendLog('请先上传视频后再启动分析')

    try {
      setIsBusy(true)
      setReport(null)
      setPoseResult(null)
      setComparison(null)
      setSelectedCompareTaskId('')
      setSelectedHistoryReport(null)
      setErrorState(null)
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/analyze`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setStatus('failed')
        setPreprocessStatus(data.preprocessStatus ?? 'failed')
        setFriendlyError(data.errorCode ?? 'preprocess_failed', data.error)
        return
      }
      setStatus(data.status)
      setPreprocessStatus(data.preprocessStatus ?? 'idle')
      appendLog('已启动分析')
      startPolling()
    } catch (error) {
      appendLog(`启动分析失败：${error instanceof Error ? error.message : '网络异常'}`)
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    fetchHistory(actionType)
  }, [actionType, fetchHistory])

  useEffect(() => {
    return () => stopPolling()
  }, [])

  return {
    actionType,
    setActionType,
    taskId,
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
    errorState,
    canUpload,
    canAnalyze,
    canFetchResult,
    selectedActionLabel,
    createTask,
    uploadVideo,
    analyze,
    refreshStatus,
    fetchResult,
    fetchHistory,
    fetchComparison,
    fetchHistoryReport,
    applyCustomComparison,
  }
}
