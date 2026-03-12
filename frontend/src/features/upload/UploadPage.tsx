import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import { formatFileSize } from '../../components/result-views/utils'

function formatDuration(seconds?: number) {
  if (seconds === undefined) return '读取中'
  return `${Math.round(seconds)} 秒`
}

export function UploadPage() {
  const navigate = useNavigate()
  const {
    actionType,
    setActionType,
    file,
    setFile,
    isBusy,
    clearErrorState,
    selectedActionLabel,
    startAnalysisFlow,
  } = useAnalysisTask()
  const [durationSeconds, setDurationSeconds] = useState<number | undefined>()
  const [inlineError, setInlineError] = useState('')
  const [switchHint, setSwitchHint] = useState('')
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])

  useEffect(() => {
    if (!previewUrl) return

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = previewUrl
    video.onloadedmetadata = () => {
      setDurationSeconds(video.duration)
    }
    video.onerror = () => {
      setDurationSeconds(undefined)
    }

    return () => {
      URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const durationInvalid = durationSeconds !== undefined && (durationSeconds < 5 || durationSeconds > 15)
  const typeInvalid = Boolean(file && !file.type.startsWith('video/'))

  async function handleStartAnalysis() {
    clearErrorState()
    setInlineError('')

    if (!file) {
      setInlineError('请先选择一段视频，再开始分析。')
      return
    }

    if (typeInvalid) {
      setInlineError('当前只支持可正常识别的视频文件，请重新选择。')
      return
    }

    if (durationInvalid) {
      setInlineError('视频时长建议控制在 5~15 秒之间。')
      return
    }

    const result = await startAnalysisFlow()
    if (result.ok) {
      navigate('/processing')
      return
    }

    if (result.reason === 'server') {
      navigate('/error')
      return
    }

    setInlineError(result.message ?? '启动分析失败，请稍后再试。')
  }

  function handleActionChange(nextActionType: 'clear' | 'smash') {
    if (nextActionType === actionType) return

      setActionType(nextActionType)
    clearErrorState()
    setInlineError('')
    if (file) {
      setFile(null)
      setDurationSeconds(undefined)
      setSwitchHint('已切换动作类型，当前视频已清空，请重新选择。')
    } else {
      setSwitchHint('')
    }
  }

  return (
    <div className="page-stack">
      <section className="surface-card">
        <div className="section-head">
          <h2>选择动作类型</h2>
        </div>
        <div className="pill-row">
          <button className={`choice-pill ${actionType === 'clear' ? 'active' : ''}`} onClick={() => handleActionChange('clear')} type="button">
            正手高远球
          </button>
          <button className={`choice-pill ${actionType === 'smash' ? 'active' : ''}`} onClick={() => handleActionChange('smash')} type="button">
            杀球
          </button>
        </div>
        <p className="muted-copy">当前分析动作：{selectedActionLabel}。切换动作后，当前视频会被清空。</p>
        {switchHint ? <div className="inline-note">{switchHint}</div> : null}
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>上传视频</h2>
        </div>
        <label className="upload-field">
          <input
            type="file"
            accept="video/*"
            onChange={(event) => {
              setInlineError('')
              setSwitchHint('')
              clearErrorState()
              setFile(event.target.files?.[0] ?? null)
            }}
            disabled={isBusy}
          />
          <span className="upload-title">{file ? file.name : '点击选择视频文件'}</span>
          <span className="upload-subtitle">建议 5~15 秒、单人、固定机位，先用真实训练视频验证主流程。</span>
        </label>

        {previewUrl ? (
          <div className="video-preview-card">
            <video controls playsInline src={previewUrl} />
          </div>
        ) : null}

        {file ? (
          <div className="info-list compact">
            <div className="list-row">文件名：{file.name}</div>
            <div className="list-row">大小：{formatFileSize(file.size)}</div>
            <div className="list-row">时长：{formatDuration(durationSeconds)}</div>
            <div className="list-row">格式：{file.type || '未知格式'}</div>
          </div>
        ) : null}
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>上传前确认</h2>
        </div>
        <div className="info-list compact">
          <div className="list-row">动作：{selectedActionLabel}</div>
          <div className="list-row">机位：侧后方或正后方更稳定</div>
          <div className="list-row">目标：点击后会自动创建任务、上传视频并进入分析中</div>
        </div>
      </section>

      {inlineError ? (
        <div className="inline-error">
          <strong>还不能开始分析</strong>
          <p>{inlineError}</p>
        </div>
      ) : null}

      <div className="action-stack">
        <button className="primary-action button-reset" onClick={() => void handleStartAnalysis()} disabled={isBusy} type="button">
          {isBusy ? '处理中...' : '开始分析'}
        </button>
        <Link className="secondary-action" to="/guide">查看拍摄规范</Link>
      </div>
    </div>
  )
}
