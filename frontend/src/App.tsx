import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type TaskStatus = 'created' | 'uploaded' | 'processing' | 'completed' | 'failed'
type PreprocessStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed'

type ReportResult = {
  taskId: string
  actionType: string
  totalScore: number
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

const API_BASE = 'http://127.0.0.1:8787'
const STATUS_LABELS: Record<TaskStatus, string> = {
  created: '已创建',
  uploaded: '已上传',
  processing: '分析中',
  completed: '已完成',
  failed: '失败',
}
const PREPROCESS_LABELS: Record<PreprocessStatus, string> = {
  idle: '未开始',
  queued: '排队中',
  processing: '预处理中',
  completed: '预处理完成',
  failed: '预处理失败',
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
}

function formatFileSize(size?: number) {
  if (!size) return '—'
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function buildAssetUrl(relativePath?: string) {
  if (!relativePath) return ''
  return `${API_BASE}/${relativePath}`
}

function getErrorCopy(errorCode?: string, fallback?: string) {
  if (errorCode && ERROR_COPY[errorCode]) return ERROR_COPY[errorCode]
  return {
    title: '处理失败',
    message: fallback ?? '这次处理没有成功，你可以换一段更规范的视频再试一次。',
  }
}

function App() {
  const [actionType, setActionType] = useState('clear')
  const [taskId, setTaskId] = useState('')
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [preprocessStatus, setPreprocessStatus] = useState<PreprocessStatus>('idle')
  const [report, setReport] = useState<ReportResult | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [errorState, setErrorState] = useState<{ errorCode?: string; title: string; message: string } | null>(null)
  const pollingRef = useRef<number | null>(null)

  const canUpload = Boolean(taskId && file && (status === 'created' || status === 'uploaded'))
  const canAnalyze = Boolean(taskId && status === 'uploaded')
  const canFetchResult = Boolean(taskId && status === 'completed')

  const selectedActionLabel = useMemo(() => {
    return actionType === 'smash' ? '杀球' : '正手高远球'
  }, [actionType])

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
      setReport(null)
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
      appendLog(`上传完成：${data.fileName}`)
    } catch (error) {
      appendLog(`上传失败：${error instanceof Error ? error.message : '网络异常'}`)
    } finally {
      setIsBusy(false)
    }
  }

  async function fetchResult(showSuccessLog = true) {
    if (!taskId) {
      appendLog('请先创建任务')
      return null
    }

    const res = await fetch(`${API_BASE}/api/tasks/${taskId}/result`)
    const data = await res.json()
    if (!res.ok) {
      appendLog(`结果未就绪：${data.error ?? '未知错误'}`)
      return null
    }
    setReport(data)
    setErrorState(null)
    if (showSuccessLog) appendLog('已自动拉取分析结果')
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
    if (data.status === 'failed' && data.errorCode) {
      setFriendlyError(data.errorCode, data.errorMessage)
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
      setErrorState(null)
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/analyze`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setStatus('failed')
        setPreprocessStatus(data.preprocessStatus ?? 'failed')
        setFriendlyError(data.errorCode, data.error)
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
    return () => stopPolling()
  }, [])

  return (
    <div className="app">
      <div className="phone-shell">
        <div className="phone-status-bar">
          <span>Badminton AI PoC</span>
          <span>{isPolling ? '自动轮询中' : '本地联调'}</span>
        </div>

        <div className="screen">
          <header className="hero-card">
            <p className="eyebrow">羽毛球动作分析 · React H5 PoC</p>
            <h1>上传视频后，自动跑完整条分析链路</h1>
            <p className="subtitle">
              现在主流程已经收口成：创建任务 → 上传视频 → 预处理 → 启动分析 → 自动轮询 → 自动展示结果。
            </p>
          </header>

          <section className="panel">
            <div className="panel-header">
              <h2>1. 创建任务</h2>
              <span className={`status-pill ${status || 'idle'}`}>{status ? STATUS_LABELS[status as TaskStatus] : '未开始'}</span>
            </div>

            <label className="field-label">动作类型</label>
            <select value={actionType} onChange={(e) => setActionType(e.target.value)} disabled={isBusy || isPolling}>
              <option value="clear">正手高远球</option>
              <option value="smash">杀球</option>
            </select>

            <button className="primary-button" onClick={createTask} disabled={isBusy || isPolling}>
              {taskId ? '重新创建任务' : '创建任务'}
            </button>

            <div className="meta-card">
              <div>
                <span className="meta-label">Task ID</span>
                <strong>{taskId || '未创建'}</strong>
              </div>
              <div>
                <span className="meta-label">当前动作</span>
                <strong>{selectedActionLabel}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>2. 上传视频</h2>
              <span className="panel-tip">支持本地真实文件</span>
            </div>

            <label className="upload-box">
              <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={isBusy || isPolling} />
              <span className="upload-title">{file ? file.name : '点击选择视频文件'}</span>
              <span className="upload-subtitle">建议先用 5~15 秒、单人、固定机位视频做联调验证</span>
            </label>

            <div className="button-group">
              <button className="primary-button" onClick={uploadVideo} disabled={!canUpload || isBusy || isPolling}>
                上传视频
              </button>
              <button className="primary-button secondary" onClick={analyze} disabled={!canAnalyze || isBusy || isPolling}>
                启动分析
              </button>
            </div>

            <div className="button-group compact">
              <button className="ghost-button" onClick={() => refreshStatus()} disabled={!taskId || isBusy}>
                手动查状态
              </button>
              <button className="ghost-button" onClick={() => fetchResult()} disabled={!canFetchResult || isBusy}>
                手动取结果
              </button>
            </div>

            <div className="preprocess-strip">
              <span className={`status-pill ${preprocessStatus}`}>{PREPROCESS_LABELS[preprocessStatus]}</span>
              <span className="panel-tip">预处理会先做基础校验和抽帧生成</span>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>3. 分析结果</h2>
              <span className="panel-tip">完成后自动展示</span>
            </div>

            {errorState ? (
              <div className="error-state-card">
                <strong>{errorState.title}</strong>
                <p>{errorState.message}</p>
                <span>建议重新按拍摄规范录制：单人、5~15 秒、侧后方或正后方、全身尽量完整入镜。</span>
              </div>
            ) : null}

            {!report ? (
              <div className="empty-state">
                <strong>{isPolling ? '系统正在自动轮询状态…' : '还没有结果'}</strong>
                <p>{isPolling ? '分析完成后会自动拉取结果，不用手动刷新。' : '先完成创建、上传、启动分析这三步。'}</p>
              </div>
            ) : (
              <div className="result-stack">
                <div className="score-card">
                  <span className="meta-label">总分</span>
                  <strong>{report.totalScore}</strong>
                  <p>{report.actionType === 'smash' ? '杀球动作' : '正手高远球'} · 模拟结构化报告</p>
                </div>

                {report.preprocess?.metadata ? (
                  <div className="result-card">
                    <h3>预处理摘要</h3>
                    <ul>
                      <li><span>文件名</span><strong>{report.preprocess.metadata.fileName}</strong></li>
                      <li><span>文件大小</span><strong>{formatFileSize(report.preprocess.metadata.fileSizeBytes)}</strong></li>
                      <li><span>视频时长</span><strong>{report.preprocess.metadata.durationSeconds ?? '—'} 秒</strong></li>
                      <li><span>估算帧数</span><strong>{report.preprocess.metadata.estimatedFrames ?? '—'}</strong></li>
                      <li><span>分辨率</span><strong>{report.preprocess.metadata.width} × {report.preprocess.metadata.height}</strong></li>
                      <li><span>元数据来源</span><strong>{report.preprocess.metadata.metadataSource ?? '—'}</strong></li>
                    </ul>
                  </div>
                ) : null}

                {report.preprocess?.artifacts?.framePlan ? (
                  <div className="result-card">
                    <h3>抽帧计划</h3>
                    <ul>
                      <li><span>策略</span><strong>{report.preprocess.artifacts.framePlan.strategy}</strong></li>
                      <li><span>目标帧数</span><strong>{report.preprocess.artifacts.framePlan.targetFrameCount}</strong></li>
                      <li><span>实际帧清单</span><strong>{report.preprocess.artifacts.sampledFrames?.length ?? 0} 个</strong></li>
                    </ul>
                  </div>
                ) : null}

                {report.preprocess?.artifacts?.sampledFrames?.length ? (
                  <div className="result-card">
                    <h3>关键帧调试视图</h3>
                    <div className="frame-grid">
                      {report.preprocess.artifacts.sampledFrames.map((frame) => (
                        <div key={frame.fileName} className="frame-card">
                          <img src={buildAssetUrl(frame.relativePath)} alt={`关键帧 ${frame.index}`} />
                          <div className="frame-meta">
                            <strong>帧 {frame.index}</strong>
                            <span>{frame.timestampSeconds}s</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="result-card">
                  <h3>维度分数</h3>
                  <ul>
                    {report.dimensionScores.map((item) => (
                      <li key={item.name}>
                        <span>{item.name}</span>
                        <strong>{item.score}</strong>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="result-card">
                  <h3>核心问题</h3>
                  <ul>
                    {report.issues.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                        <span>{item.impact}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="result-card">
                  <h3>训练建议</h3>
                  <ul>
                    {report.suggestions.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="retest-card">
                  <span className="meta-label">复测建议</span>
                  <p>{report.retestAdvice}</p>
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>4. 操作日志</h2>
              <span className="panel-tip">方便联调</span>
            </div>

            <div className="log">
              {log.length === 0 ? <p className="muted">还没有操作记录。</p> : log.map((item, idx) => <div key={idx} className="log-item">{item}</div>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default App
