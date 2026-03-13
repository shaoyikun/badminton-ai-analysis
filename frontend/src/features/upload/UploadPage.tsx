import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { FlowStepHeader } from '../../components/ui/FlowStepHeader'
import { Notice } from '../../components/ui/Notice'
import { ActionTypeSelector } from '../../components/ui/ActionTypeSelector'
import { buildSegmentsRoute, ROUTES } from '../../app/routes'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import pageStyles from '../../styles/PageLayout.module.scss'
import styles from './UploadPage.module.scss'
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
    uploadChecklistConfirmed,
    setUploadChecklistConfirmed,
    isBusy,
    errorState,
    clearErrorState,
    prepareFreshUpload,
    scanVideoFlow,
  } = useAnalysisTask()
  const [submissionError, setSubmissionError] = useState('')
  const pendingSegmentsRouteRef = useRef(false)
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
  const scanDisabled = isBusy || blockingReasons.length > 0
  const hasSegmentChoices = Boolean(segmentScan?.swingSegments?.length)
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
    if (!pendingSegmentsRouteRef.current || !hasSegmentChoices || !taskId) return
    navigate(buildSegmentsRoute(taskId))
    pendingSegmentsRouteRef.current = false
  }, [hasSegmentChoices, navigate, taskId])

  async function handleScanVideo() {
    setSubmissionError('')

    if (scanDisabled) {
      setSubmissionError('请先完成当前页面的检查项，再上传并粗扫片段。')
      return
    }

    const result = await scanVideoFlow()
    if (result.ok) {
      pendingSegmentsRouteRef.current = true
      return
    }

    if (result.reason === 'server') {
      navigate(ROUTES.error)
      return
    }

    setSubmissionError(result.message ?? '上传或粗扫失败，请稍后再试。')
  }

  return (
    <div className={pageStyles.pageStack}>
      <FlowStepHeader
        badge="第 1 步"
        title="先把上传准备和输入条件确认好"
        description="这一页只负责动作、视频和基础校验。候选片段确认会在下一步单独承接，不再长期堆在同一页。"
        steps={[
          { key: 'prepare', label: '上传准备', hint: '确认动作、视频和拍摄条件', state: 'current' },
          { key: 'segments', label: '确认片段', hint: '粗扫后单独确认真正要分析的一段', state: 'upcoming' },
          { key: 'processing', label: '等待结果', hint: '系统自动进入分析并跳转报告', state: 'upcoming' },
        ]}
      />

      {errorState ? (
        <Notice tone="warning" title={`上次失败原因：${errorState.title}`}>
          {errorState.uploadBanner}
        </Notice>
      ) : null}

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>当前分析动作与拍摄重点</h2>
          <p className={pageStyles.muted}>先锁定本次分析动作，上传规则、候选解释和后续报告都会跟着这个动作切换。</p>
        </div>
        <ActionTypeSelector disabled={isBusy} />
        <Notice compact tone="info" title={`${actionReminder.title}专项提醒`}>
          {actionReminder.description}
        </Notice>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>上传前快速检查</h2>
          <p className={pageStyles.muted}>首屏只保留会直接影响粗扫质量的关键条件，细节解释尽量不和主操作抢层级。</p>
        </div>

        <div className={styles.constraintGrid}>
          <div className={pageStyles.keyItem}>
            <span>视频时长</span>
            <strong>{UPLOAD_CONSTRAINTS.minDurationSeconds}~{UPLOAD_CONSTRAINTS.maxDurationSeconds} 秒</strong>
            <p>尽量完整覆盖准备、击球和收拍。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>建议机位</span>
            <strong>{UPLOAD_CONSTRAINTS.recommendedAngles.join(' / ')}</strong>
            <p>优先保证主体稳定、全身尽量完整入镜。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>文件限制</span>
            <strong>{UPLOAD_CONSTRAINTS.supportedExtensions.join(' / ')}</strong>
            <p>建议小于 {Math.round(UPLOAD_CONSTRAINTS.defaultMaxFileSizeBytes / 1024 / 1024)}MB。</p>
          </div>
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>选择训练视频</h2>
          <p className={pageStyles.muted}>上传准备页只负责文件选择和基础摘要，不在这里常驻展示候选片段工作台。</p>
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
          <div className={styles.summaryGrid}>
            <div className={pageStyles.keyItem}>
              <span>文件名</span>
              <strong>{currentVideoSummary.fileName}</strong>
            </div>
            <div className={pageStyles.keyItem}>
              <span>大小</span>
              <strong>{formatFileSize(currentVideoSummary.fileSizeBytes)}</strong>
            </div>
            <div className={pageStyles.keyItem}>
              <span>时长</span>
              <strong>{formatDuration(currentVideoSummary.durationSeconds)}</strong>
            </div>
            <div className={pageStyles.keyItem}>
              <span>格式</span>
              <strong>{currentVideoSummary.mimeType || currentVideoSummary.extension || '未知格式'}</strong>
            </div>
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
        <Notice tone="info" title="粗扫已经完成，下一步去确认分析片段">
          系统已经筛出 {segmentScan?.swingSegments.length ?? 0} 个候选片段。下一步会进入独立的片段确认页，避免把选片和微调长期压在上传准备页里。
        </Notice>
      ) : null}

      {submissionError ? (
        <Notice compact tone="error" title="提交失败">
          {submissionError}
        </Notice>
      ) : null}

      <BottomCTA
        primary={{
          label: hasSegmentChoices ? '进入片段确认' : '上传并粗扫片段',
          onClick: () => void (hasSegmentChoices ? navigate(buildSegmentsRoute(taskId)) : handleScanVideo()),
          disabled: hasSegmentChoices ? !taskId : scanDisabled,
          loading: isBusy,
        }}
        secondary={hasSegmentChoices
          ? { label: '重新选择视频', onClick: prepareFreshUpload, tone: 'secondary' }
          : { label: '查看拍摄规范', to: ROUTES.guide, tone: 'secondary' }}
      />
    </div>
  )
}
