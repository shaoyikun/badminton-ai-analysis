import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { Notice } from '../../components/ui/Notice'
import { ActionTypeSelector } from '../../components/ui/ActionTypeSelector'
import { buildProcessingRoute, ROUTES } from '../../app/routes'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import pageStyles from '../../styles/PageLayout.module.scss'
import styles from './UploadPage.module.scss'
import { SegmentSelectionCard } from './SegmentSelectionCard'
import {
  ACTION_SPECIAL_REMINDER_COPY,
  buildLocalVideoSummary,
  buildUploadReadinessItems,
  getUploadBlockingReasons,
  UPLOAD_CONSTRAINTS,
} from './uploadFlow'

function formatDuration(seconds?: number) {
  if (seconds === undefined) return '读取中'
  return `${Math.round(seconds)} 秒`
}

function formatFileSize(size?: number) {
  if (!size) return '—'
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

export function UploadPage() {
  const navigate = useNavigate()
  const {
    actionType,
    taskId,
    file,
    setFile,
    selectedVideoSummary,
    setSelectedVideoSummary,
    segmentScan,
    selectedSegmentId,
    setSelectedSegmentId,
    selectedSegmentWindow,
    setSelectedSegmentWindow,
    uploadChecklistConfirmed,
    setUploadChecklistConfirmed,
    isBusy,
    errorState,
    clearErrorState,
    prepareFreshUpload,
    selectedActionLabel,
    scanVideoFlow,
    startSelectedSegmentFlow,
  } = useAnalysisTask()
  const [submissionError, setSubmissionError] = useState('')
  const segmentSelectionRef = useRef<HTMLElement | null>(null)
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])

  const currentVideoSummary = file ? selectedVideoSummary : null
  const videoDurationMs = Math.max(
    1,
    Math.round((currentVideoSummary?.durationSeconds ?? 0) * 1000),
    ...(segmentScan?.swingSegments ?? []).map((segment) => segment.endTimeMs),
  )
  const readinessItems = useMemo(
    () => buildUploadReadinessItems(file, currentVideoSummary),
    [currentVideoSummary, file],
  )
  const blockingReasons = useMemo(
    () => getUploadBlockingReasons(readinessItems, uploadChecklistConfirmed),
    [readinessItems, uploadChecklistConfirmed],
  )
  const scanDisabled = isBusy || blockingReasons.length > 0
  const hasSegmentChoices = Boolean(segmentScan?.swingSegments?.length)
  const startAnalysisDisabled = isBusy || !hasSegmentChoices || !selectedSegmentId
  const previousAttemptSummary = !file && errorState && selectedVideoSummary ? selectedVideoSummary : null
  const actionReminder = ACTION_SPECIAL_REMINDER_COPY[actionType]

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

  useEffect(() => {
    if (!hasSegmentChoices || !segmentSelectionRef.current) return
    segmentSelectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hasSegmentChoices])

  async function handleScanVideo() {
    setSubmissionError('')

    if (scanDisabled) {
      setSubmissionError('请先完成当前页面的检查项，再上传并粗扫片段。')
      return
    }

    const result = await scanVideoFlow()
    if (result.ok) {
      return
    }

    if (result.reason === 'server') {
      navigate(ROUTES.error)
      return
    }

    setSubmissionError(result.message ?? '上传或粗扫失败，请稍后再试。')
  }

  async function handleStartAnalysis() {
    setSubmissionError('')

    if (startAnalysisDisabled) {
      setSubmissionError('请先从粗扫结果里选好一个要精分析的片段。')
      return
    }

    const result = await startSelectedSegmentFlow()
    if (result.ok) {
      navigate(buildProcessingRoute(taskId))
      return
    }

    if (result.reason === 'server') {
      navigate(ROUTES.error)
      return
    }

    setSubmissionError(result.message ?? '启动分析失败，请稍后再试。')
  }

  return (
    <div className={pageStyles.pageStack}>
      <section className={pageStyles.heroCard}>
        <span className={pageStyles.badge}>分析入口</span>
        <h1>先上传完整视频，再确认真正要分析的挥拍片段</h1>
        <p>
          第一步先上传整段视频并做候选片段粗扫；第二步再由你确认要精分析的那一拍。
          这样系统和你都能明确“这份报告到底分析了哪一段”。
        </p>
      </section>

      {errorState ? (
        <Notice tone="warning" title={`上次失败原因：${errorState.title}`}>
          {errorState.uploadBanner}
        </Notice>
      ) : null}

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>当前分析动作</h2>
          <p className={pageStyles.muted}>当前上传、分析和报告都会按 {selectedActionLabel} 的正式口径执行。</p>
        </div>
        <ActionTypeSelector disabled={isBusy} />
      </section>

      <section className={pageStyles.card}>
        <span className={pageStyles.eyebrow}>Step 1</span>
        <div className={pageStyles.sectionHeader}>
          <h2>先确认输入条件</h2>
          <p className={pageStyles.muted}>先把动作、时长、机位和文件状态确认好，再让系统去粗扫候选片段。</p>
        </div>

        <div className={pageStyles.infoList}>
          <div className={pageStyles.listRow}>当前正式支持：正手高远球、杀球；一段视频只分析一种动作</div>
          <div className={pageStyles.listRow}>时长：{UPLOAD_CONSTRAINTS.minDurationSeconds}~{UPLOAD_CONSTRAINTS.maxDurationSeconds} 秒</div>
          <div className={pageStyles.listRow}>机位：优先 {UPLOAD_CONSTRAINTS.recommendedAngles.join(' 或 ')}</div>
          <div className={pageStyles.listRow}>画面：单人出镜、全身尽量完整入镜、避免逆光和遮挡</div>
          <div className={pageStyles.listRow}>文件：{UPLOAD_CONSTRAINTS.supportedExtensions.join(' / ')}，建议小于 {Math.round(UPLOAD_CONSTRAINTS.defaultMaxFileSizeBytes / 1024 / 1024)}MB</div>
          <div className={pageStyles.listRow}>{actionReminder.title}专项：{actionReminder.description}</div>
        </div>

        <label className={styles.uploadField}>
          <input
            type="file"
            accept="video/*,.mp4,.mov,.m4v,.webm"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null
              setSubmissionError('')
              clearErrorState()
              prepareFreshUpload()
              setUploadChecklistConfirmed(false)
              setFile(nextFile)
              setSelectedVideoSummary(nextFile ? buildLocalVideoSummary(nextFile) : null)
            }}
            disabled={isBusy}
          />
          <span className={styles.uploadTitle}>{file ? file.name : '点击选择视频文件'}</span>
          <span className={styles.uploadSubtitle}>建议先用真实训练视频验证主链路，确保准备、击球和收拍都完整拍到。</span>
        </label>

        {previewUrl ? (
          <div className={styles.videoPreviewCard}>
            <video controls playsInline src={previewUrl} />
          </div>
        ) : null}

        {currentVideoSummary ? (
          <div className={pageStyles.infoList}>
            <div className={pageStyles.listRow}>文件名：{currentVideoSummary.fileName}</div>
            <div className={pageStyles.listRow}>大小：{formatFileSize(currentVideoSummary.fileSizeBytes)}</div>
            <div className={pageStyles.listRow}>时长：{formatDuration(currentVideoSummary.durationSeconds)}</div>
            <div className={pageStyles.listRow}>格式：{currentVideoSummary.mimeType || currentVideoSummary.extension || '未知格式'}</div>
          </div>
        ) : null}

        {previousAttemptSummary ? (
          <div className={styles.previousSummary}>
            <span className={pageStyles.badge}>上次尝试的视频</span>
            <div className={pageStyles.infoList}>
              <div className={pageStyles.listRow}>文件名：{previousAttemptSummary.fileName}</div>
              <div className={pageStyles.listRow}>大小：{formatFileSize(previousAttemptSummary.fileSizeBytes)}</div>
              <div className={pageStyles.listRow}>时长：{formatDuration(previousAttemptSummary.durationSeconds)}</div>
              <div className={pageStyles.listRow}>说明：这只是上次失败时保留的摘要，重新提交前仍需重新选择文件。</div>
            </div>
          </div>
        ) : null}

        <div className={styles.checklistStack}>
          {readinessItems.map((item) => (
            <div key={item.id} className={styles.checklistRow}>
              <span className={styles.checklistBadge}>
                {item.status === 'pass' ? '通过' : item.status === 'fail' ? '未通过' : '待确认'}
              </span>
              <div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={pageStyles.infoList}>
          <div className={pageStyles.listRow}>第 1 步会先上传完整视频，并只做粗粒度挥拍片段扫描。</div>
          <div className={pageStyles.listRow}>第 2 步由你从候选片段里确认真正要分析的那一段，再进入最终结果分析。</div>
          <div className={pageStyles.listRow}>如果服务端判断视频不适合分析，会返回明确失败原因、重拍建议和重新上传入口。</div>
        </div>

        <label className={styles.confirmCheck}>
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

        {blockingReasons.length > 0 ? (
          <Notice tone="warning" title="当前还不能提交">
            <ul className={styles.inlineErrorList}>
              {blockingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </section>

      {hasSegmentChoices ? (
        <section ref={segmentSelectionRef}>
          <Notice tone="info" title="Step 2：确认真正要进入精分析的片段">
            系统已经从整段视频里筛出 {segmentScan?.swingSegments.length ?? 0} 个疑似挥拍片段。
            请先确认要分析的片段，再启动最终分析。
          </Notice>

          <SegmentSelectionCard
            segments={segmentScan?.swingSegments ?? []}
            recommendedSegmentId={segmentScan?.recommendedSegmentId}
            selectedSegmentId={selectedSegmentId}
            selectedWindow={selectedSegmentWindow}
            onSelect={setSelectedSegmentId}
            onAdjustWindow={setSelectedSegmentWindow}
            onResetWindow={() => {
              const activeSegment = (segmentScan?.swingSegments ?? []).find((segment) => segment.segmentId === selectedSegmentId)
              if (!activeSegment) return

              setSelectedSegmentWindow({
                startTimeMs: activeSegment.startTimeMs,
                endTimeMs: activeSegment.endTimeMs,
                startFrame: activeSegment.startFrame,
                endFrame: activeSegment.endFrame,
              })
            }}
            previewUrl={previewUrl}
            videoDurationMs={videoDurationMs}
          />
        </section>
      ) : null}

      {submissionError ? (
        <Notice compact tone="error" title="提交失败">
          {submissionError}
        </Notice>
      ) : null}

      <BottomCTA
        sticky={false}
        primary={{
          label: hasSegmentChoices ? '确认片段并开始分析' : '上传并粗扫片段',
          onClick: () => void (hasSegmentChoices ? handleStartAnalysis() : handleScanVideo()),
          disabled: hasSegmentChoices ? startAnalysisDisabled : scanDisabled,
          loading: isBusy,
        }}
        secondary={hasSegmentChoices
          ? { label: '重新选择视频', onClick: prepareFreshUpload, tone: 'secondary' }
          : { label: '查看拍摄规范', to: ROUTES.guide, tone: 'secondary' }}
      />
    </div>
  )
}
