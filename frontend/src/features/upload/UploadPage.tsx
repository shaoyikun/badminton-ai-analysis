import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatFileSize } from '../../components/result-views/utils'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { Notice } from '../../components/ui/Notice'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import {
  buildLocalVideoSummary,
  buildUploadReadinessItems,
  getUploadBlockingReasons,
  UPLOAD_CONSTRAINTS,
} from './uploadFlow'

function formatDuration(seconds?: number) {
  if (seconds === undefined) return '读取中'
  return `${Math.round(seconds)} 秒`
}

export function UploadPage() {
  const navigate = useNavigate()
  const {
    file,
    setFile,
    selectedVideoSummary,
    setSelectedVideoSummary,
    uploadChecklistConfirmed,
    setUploadChecklistConfirmed,
    isBusy,
    errorState,
    clearErrorState,
    selectedActionLabel,
    startAnalysisFlow,
  } = useAnalysisTask()
  const [submissionError, setSubmissionError] = useState('')
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])

  const currentVideoSummary = file ? selectedVideoSummary : null
  const readinessItems = useMemo(
    () => buildUploadReadinessItems(file, currentVideoSummary),
    [currentVideoSummary, file],
  )
  const blockingReasons = useMemo(
    () => getUploadBlockingReasons(readinessItems, uploadChecklistConfirmed),
    [readinessItems, uploadChecklistConfirmed],
  )
  const submissionDisabled = isBusy || blockingReasons.length > 0

  useEffect(() => {
    if (!previewUrl || !file) return

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = previewUrl
    video.onloadedmetadata = () => {
      setSelectedVideoSummary(buildLocalVideoSummary(file, video.duration))
    }
    video.onerror = () => {
      setSelectedVideoSummary(buildLocalVideoSummary(file))
    }

    return () => {
      URL.revokeObjectURL(previewUrl)
    }
  }, [file, previewUrl, setSelectedVideoSummary])

  async function handleStartAnalysis() {
    setSubmissionError('')

    if (submissionDisabled) {
      setSubmissionError('请先完成当前页面的检查项，再开始分析。')
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

    setSubmissionError(result.message ?? '启动分析失败，请稍后再试。')
  }

  const previousAttemptSummary = !file && selectedVideoSummary ? selectedVideoSummary : null

  return (
    <div className="page-stack">
      {errorState ? (
        <Notice tone="warning" title={`上次失败原因: ${errorState.title}`}>
          {errorState.uploadBanner}
        </Notice>
      ) : null}

      <section className="surface-card">
        <div className="section-head">
          <h2>当前分析动作</h2>
        </div>
        <div className="pill-row">
          <span className="choice-pill active">正手高远球</span>
        </div>
        <p className="muted-copy">当前为了保证结果可信度，只开放 {selectedActionLabel} 的正式分析。</p>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>上传约束提示</h2>
        </div>
        <div className="info-list compact">
          <div className="list-row">当前正式支持：正手高远球；一段视频只分析一种动作</div>
          <div className="list-row">时长：{UPLOAD_CONSTRAINTS.minDurationSeconds}~{UPLOAD_CONSTRAINTS.maxDurationSeconds} 秒</div>
          <div className="list-row">机位：优先 {UPLOAD_CONSTRAINTS.recommendedAngles.join(' 或 ')}</div>
          <div className="list-row">画面：单人出镜、全身尽量完整入镜、避免逆光和遮挡</div>
          <div className="list-row">文件：{UPLOAD_CONSTRAINTS.supportedExtensions.join(' / ')}，建议小于 {Math.round(UPLOAD_CONSTRAINTS.defaultMaxFileSizeBytes / 1024 / 1024)}MB</div>
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>上传视频</h2>
        </div>
        <label className="upload-field">
          <input
            type="file"
            accept="video/*,.mp4,.mov,.m4v,.webm"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null
              setSubmissionError('')
              clearErrorState()
              setUploadChecklistConfirmed(false)
              setFile(nextFile)
              setSelectedVideoSummary(nextFile ? buildLocalVideoSummary(nextFile) : null)
            }}
            disabled={isBusy}
          />
          <span className="upload-title">{file ? file.name : '点击选择视频文件'}</span>
          <span className="upload-subtitle">建议先用真实训练视频验证主链路，确保准备、击球和收拍都完整拍到。</span>
        </label>

        {previewUrl ? (
          <div className="video-preview-card">
            <video controls playsInline src={previewUrl} />
          </div>
        ) : null}

        {currentVideoSummary ? (
          <div className="info-list compact">
            <div className="list-row">文件名：{currentVideoSummary.fileName}</div>
            <div className="list-row">大小：{formatFileSize(currentVideoSummary.fileSizeBytes)}</div>
            <div className="list-row">时长：{formatDuration(currentVideoSummary.durationSeconds)}</div>
            <div className="list-row">格式：{currentVideoSummary.mimeType || currentVideoSummary.extension || '未知格式'}</div>
          </div>
        ) : null}

        {previousAttemptSummary ? (
          <div className="surface-card inset upload-summary-inset">
            <span className="badge neutral">上次尝试的视频</span>
            <div className="info-list compact">
              <div className="list-row">文件名：{previousAttemptSummary.fileName}</div>
              <div className="list-row">大小：{formatFileSize(previousAttemptSummary.fileSizeBytes)}</div>
              <div className="list-row">时长：{formatDuration(previousAttemptSummary.durationSeconds)}</div>
              <div className="list-row">说明：这只是上次失败时保留的摘要，重新提交前仍需重新选择文件。</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>当前就绪检查</h2>
        </div>
        <div className="checklist-stack">
          {readinessItems.map((item) => (
            <div key={item.id} className={`checklist-row ${item.status}`}>
              <span className={`checklist-badge ${item.status}`}>
                {item.status === 'pass' ? '通过' : item.status === 'fail' ? '未通过' : '待确认'}
              </span>
              <div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>上传前确认</h2>
        </div>
        <div className="info-list compact">
          <div className="list-row">动作：{selectedActionLabel}</div>
          <div className="list-row">提交后会自动创建任务、上传视频，并进入分步骤分析流程</div>
          <div className="list-row">如果服务端判断视频不适合分析，会返回明确失败原因、重拍建议和重新上传入口</div>
        </div>

        <label className="confirm-check">
          <input
            checked={uploadChecklistConfirmed}
            onChange={(event) => {
              setSubmissionError('')
              setUploadChecklistConfirmed(event.target.checked)
            }}
            type="checkbox"
          />
          <span>我已确认这段视频只包含当前动作，主体清晰、完整，且基本符合拍摄要求。</span>
        </label>
      </section>

      {blockingReasons.length > 0 ? (
        <Notice tone="warning" title="当前还不能提交">
          <ul className="inline-error-list">
            {blockingReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {submissionError ? (
        <Notice compact tone="error" title="提交失败">
          {submissionError}
        </Notice>
      ) : null}

      <BottomCTA
        sticky={false}
        primary={{
          label: '确认并开始分析',
          onClick: () => void handleStartAnalysis(),
          disabled: submissionDisabled,
          loading: isBusy,
        }}
        secondary={{ label: '查看拍摄规范', to: '/guide', tone: 'secondary' }}
      />
    </div>
  )
}
