import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SegmentSelectionWindow, SwingSegmentCandidate } from '../../../../shared/contracts'
import { formatFileSize } from '../../components/result-views/utils'
import { ActionTypeSelector } from '../../components/ui/ActionTypeSelector'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { Notice } from '../../components/ui/Notice'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import {
  ACTION_SPECIAL_REMINDER_COPY,
  buildLocalVideoSummary,
  buildUploadReadinessItems,
  getUploadBlockingReasons,
  UPLOAD_CONSTRAINTS,
} from './uploadFlow'

const SEGMENT_ADJUST_STEP_MS = 120
const MIN_SELECTED_SEGMENT_WINDOW_MS = 420
const MAX_SELECTED_SEGMENT_WINDOW_MS = 3200

function formatDuration(seconds?: number) {
  if (seconds === undefined) return '读取中'
  return `${Math.round(seconds)} 秒`
}

function formatSegmentTimestamp(timeMs: number) {
  return `${(timeMs / 1000).toFixed(2)}s`
}

function formatSegmentDuration(durationMs: number) {
  return `${(durationMs / 1000).toFixed(2)}s`
}

function formatQualityFlag(flag: string) {
  switch (flag) {
    case 'motion_too_weak':
      return '运动偏弱'
    case 'too_short':
      return '时长偏短'
    case 'too_long':
      return '时长偏长'
    case 'edge_clipped_start':
      return '起始可能截断'
    case 'edge_clipped_end':
      return '结尾可能截断'
    case 'preparation_maybe_clipped':
      return '准备段可能被截掉'
    case 'follow_through_maybe_clipped':
      return '随挥可能被截掉'
    case 'subject_maybe_small':
      return '主体可能偏小'
    case 'motion_maybe_occluded':
      return '疑似遮挡'
    default:
      return flag
  }
}

function normalizeWindow(window: SegmentSelectionWindow, videoDurationMs: number) {
  const requestedStart = Math.max(0, Math.min(window.startTimeMs, Math.max(0, videoDurationMs - 1)))
  const requestedEnd = Math.max(requestedStart + 1, Math.min(window.endTimeMs, videoDurationMs))
  let startTimeMs = requestedStart
  let endTimeMs = requestedEnd

  if ((endTimeMs - startTimeMs) < MIN_SELECTED_SEGMENT_WINDOW_MS) {
    const needed = MIN_SELECTED_SEGMENT_WINDOW_MS - (endTimeMs - startTimeMs)
    const expandBefore = Math.min(startTimeMs, Math.ceil(needed / 2))
    startTimeMs -= expandBefore
    endTimeMs = Math.min(videoDurationMs, endTimeMs + (needed - expandBefore))
    if ((endTimeMs - startTimeMs) < MIN_SELECTED_SEGMENT_WINDOW_MS) {
      startTimeMs = Math.max(0, endTimeMs - MIN_SELECTED_SEGMENT_WINDOW_MS)
    }
  }

  if ((endTimeMs - startTimeMs) > MAX_SELECTED_SEGMENT_WINDOW_MS) {
    endTimeMs = startTimeMs + MAX_SELECTED_SEGMENT_WINDOW_MS
  }

  return {
    ...window,
    startTimeMs,
    endTimeMs,
  } satisfies SegmentSelectionWindow
}

function SegmentPreviewVideo({
  src,
  startTimeMs,
  endTimeMs,
  posterLabel,
  emphasized = false,
}: {
  src: string
  startTimeMs: number
  endTimeMs: number
  posterLabel: string
  emphasized?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const startSeconds = Math.max(0, startTimeMs / 1000)
  const endSeconds = Math.max(startSeconds + 0.12, endTimeMs / 1000)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    let cancelled = false

    const seekToSegmentStart = () => {
      if (!video || cancelled) return
      try {
        video.currentTime = startSeconds
      } catch {
        // Ignore early seek failures until metadata is ready.
      }
    }

    const keepLoopingInsideSegment = () => {
      if (video.currentTime >= endSeconds) {
        video.currentTime = startSeconds
      }
    }

    const tryPlay = async () => {
      try {
        await video.play()
      } catch {
        // Mobile browsers may block autoplay; controls are intentionally hidden.
      }
    }

    video.pause()
    seekToSegmentStart()

    video.addEventListener('loadedmetadata', seekToSegmentStart)
    video.addEventListener('timeupdate', keepLoopingInsideSegment)
    video.addEventListener('canplay', tryPlay)

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', seekToSegmentStart)
      video.removeEventListener('timeupdate', keepLoopingInsideSegment)
      video.removeEventListener('canplay', tryPlay)
      video.pause()
    }
  }, [endSeconds, src, startSeconds])

  return (
    <div className={`segment-preview ${emphasized ? 'emphasized' : ''}`}>
      <video
        ref={videoRef}
        autoPlay
        disablePictureInPicture
        muted
        playsInline
        preload="metadata"
        src={src}
      />
      <span className="segment-preview-label">{posterLabel}</span>
    </div>
  )
}

function SegmentSelectionCard({
  segments,
  recommendedSegmentId,
  selectedSegmentId,
  selectedWindow,
  onSelect,
  onAdjustWindow,
  onResetWindow,
  previewUrl,
  videoDurationMs,
}: {
  segments: SwingSegmentCandidate[]
  recommendedSegmentId?: string
  selectedSegmentId: string
  selectedWindow: SegmentSelectionWindow | null
  onSelect: (segmentId: string) => void
  onAdjustWindow: (nextWindow: SegmentSelectionWindow) => void
  onResetWindow: () => void
  previewUrl: string
  videoDurationMs: number
}) {
  const activeSegment =
    segments.find((segment) => segment.segmentId === selectedSegmentId) ??
    segments.find((segment) => segment.segmentId === recommendedSegmentId) ??
    segments[0]
  const baseWindow = activeSegment ? {
    startTimeMs: activeSegment.startTimeMs,
    endTimeMs: activeSegment.endTimeMs,
    startFrame: activeSegment.startFrame,
    endFrame: activeSegment.endFrame,
  } satisfies SegmentSelectionWindow : null
  const effectiveWindow = activeSegment ? normalizeWindow(selectedWindow ?? baseWindow ?? {
    startTimeMs: activeSegment.startTimeMs,
    endTimeMs: activeSegment.endTimeMs,
  }, videoDurationMs) : null
  const isWindowAdjusted = Boolean(
    baseWindow
    && effectiveWindow
    && (
      baseWindow.startTimeMs !== effectiveWindow.startTimeMs
      || baseWindow.endTimeMs !== effectiveWindow.endTimeMs
    )
  )

  function handleAdjust(boundary: 'start' | 'end', deltaMs: number) {
    if (!activeSegment || !effectiveWindow) return
    const nextWindow = normalizeWindow({
      ...effectiveWindow,
      startFrame: activeSegment.startFrame,
      endFrame: activeSegment.endFrame,
      ...(boundary === 'start'
        ? { startTimeMs: effectiveWindow.startTimeMs + deltaMs }
        : { endTimeMs: effectiveWindow.endTimeMs + deltaMs }),
    }, videoDurationMs)
    onAdjustWindow(nextWindow)
  }

  return (
    <section className="surface-card swing-segments-card">
      <div className="section-head">
        <div>
          <h2>选择要分析的挥拍片段</h2>
          <p className="muted-copy">系统已经先对整段视频做了粗扫。现在请从候选片段里选出这次真正要进入精分析的一段。</p>
        </div>
      </div>

      <div className="segment-summary-strip">
        <div className="segment-summary-item">
          <span>候选片段</span>
          <strong>{segments.length}</strong>
        </div>
        <div className="segment-summary-item">
          <span>推荐片段</span>
          <strong>{recommendedSegmentId ?? '—'}</strong>
        </div>
        <div className="segment-summary-item">
          <span>当前选择</span>
          <strong>{activeSegment?.segmentId ?? '—'}</strong>
        </div>
      </div>

      <div className="segment-chip-row">
        {segments.map((segment) => {
          const isActive = segment.segmentId === activeSegment?.segmentId
          const chipWindow = isActive && effectiveWindow ? effectiveWindow : {
            startTimeMs: segment.startTimeMs,
            endTimeMs: segment.endTimeMs,
          }
          return (
            <button
              key={segment.segmentId}
              className={`segment-chip ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(segment.segmentId)}
              type="button"
            >
              {previewUrl ? (
                <SegmentPreviewVideo
                  src={previewUrl}
                  startTimeMs={chipWindow.startTimeMs}
                  endTimeMs={chipWindow.endTimeMs}
                  posterLabel={`${formatSegmentTimestamp(chipWindow.startTimeMs)} - ${formatSegmentTimestamp(chipWindow.endTimeMs)}`}
                />
              ) : null}
              <strong>{segment.segmentId}</strong>
              <span>{formatSegmentTimestamp(chipWindow.startTimeMs)} - {formatSegmentTimestamp(chipWindow.endTimeMs)}</span>
              {segment.segmentId === recommendedSegmentId ? <em>推荐</em> : null}
              {segment.segmentId === selectedSegmentId ? <em>已选中</em> : null}
            </button>
          )
        })}
      </div>

      {activeSegment ? (
        <div className="segment-detail-card">
          {previewUrl && effectiveWindow ? (
            <SegmentPreviewVideo
              src={previewUrl}
              startTimeMs={effectiveWindow.startTimeMs}
              endTimeMs={effectiveWindow.endTimeMs}
              posterLabel={`当前选中片段预览 · ${formatSegmentTimestamp(effectiveWindow.startTimeMs)} - ${formatSegmentTimestamp(effectiveWindow.endTimeMs)}`}
              emphasized
            />
          ) : null}
          <div className="segment-detail-head">
            <div>
              <strong>{activeSegment.segmentId}</strong>
              {effectiveWindow ? (
                <p>{formatSegmentTimestamp(effectiveWindow.startTimeMs)} - {formatSegmentTimestamp(effectiveWindow.endTimeMs)}，时长 {formatSegmentDuration(effectiveWindow.endTimeMs - effectiveWindow.startTimeMs)}</p>
              ) : null}
            </div>
            <div className="segment-badge-row">
              {activeSegment.segmentId === recommendedSegmentId ? <span className="status-pill brand">系统推荐</span> : null}
              {activeSegment.segmentId === selectedSegmentId ? <span className="status-pill success">待进入精分析</span> : null}
              {isWindowAdjusted ? <span className="status-pill neutral">已微调</span> : null}
            </div>
          </div>

          <div className="score-grid three-up">
            <div className="score-tile"><span>运动强度</span><strong>{activeSegment.motionScore.toFixed(2)}</strong></div>
            <div className="score-tile"><span>推荐置信度</span><strong>{Math.round(activeSegment.confidence * 100)}%</strong></div>
            <div className="score-tile"><span>排序分</span><strong>{activeSegment.rankingScore.toFixed(2)}</strong></div>
          </div>

          <div className="segment-quality-flags">
            {activeSegment.coarseQualityFlags.length > 0 ? (
              activeSegment.coarseQualityFlags.map((flag) => (
                <span key={flag} className="segment-flag">{formatQualityFlag(flag)}</span>
              ))
            ) : (
              <span className="segment-flag positive">当前没有明显粗粒度风险标记</span>
            )}
          </div>

          {effectiveWindow && baseWindow ? (
            <div className="info-list compact">
              <div className="list-row">当前会送去精分析的时间窗：{formatSegmentTimestamp(effectiveWindow.startTimeMs)} - {formatSegmentTimestamp(effectiveWindow.endTimeMs)}</div>
              <div className="list-row">如果系统切得偏紧，可以只在这里轻微往前或往后补一点。</div>
            </div>
          ) : null}

          {effectiveWindow ? (
            <div className="segment-adjust-grid">
              <button type="button" className="secondary-btn" onClick={() => handleAdjust('start', -SEGMENT_ADJUST_STEP_MS)}>起点提前</button>
              <button type="button" className="secondary-btn" onClick={() => handleAdjust('start', SEGMENT_ADJUST_STEP_MS)}>起点后移</button>
              <button type="button" className="secondary-btn" onClick={() => handleAdjust('end', -SEGMENT_ADJUST_STEP_MS)}>终点前移</button>
              <button type="button" className="secondary-btn" onClick={() => handleAdjust('end', SEGMENT_ADJUST_STEP_MS)}>终点延后</button>
              <button type="button" className="secondary-btn" onClick={onResetWindow}>恢复系统切段</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export function UploadPage() {
  const navigate = useNavigate()
  const {
    actionType,
    taskId,
    latestCompletedTaskId,
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
    status,
    report,
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

  useEffect(() => {
    const isCompletedCarryover = Boolean(taskId) && taskId === latestCompletedTaskId
    if (!errorState && (status === 'completed' || report || isCompletedCarryover)) {
      prepareFreshUpload()
    }
  }, [errorState, latestCompletedTaskId, prepareFreshUpload, report, status, taskId])

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
      navigate('/error')
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
      navigate('/processing')
      return
    }

    if (result.reason === 'server') {
      navigate('/error')
      return
    }

    setSubmissionError(result.message ?? '启动分析失败，请稍后再试。')
  }

  const previousAttemptSummary = !file && errorState && selectedVideoSummary ? selectedVideoSummary : null
  const actionReminder = ACTION_SPECIAL_REMINDER_COPY[actionType]

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
        <ActionTypeSelector disabled={isBusy} />
        <p className="muted-copy">当前上传、分析和报告都会按 {selectedActionLabel} 的正式口径执行。</p>
      </section>

      {hasSegmentChoices ? (
        <section ref={segmentSelectionRef}>
          <Notice tone="info" title="粗扫完成">
            系统已经从整段视频里筛出 {segmentScan?.swingSegments.length ?? 0} 个疑似挥拍片段。请先确认要分析的片段，再启动最终分析。
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

      <section className="surface-card">
        <div className="section-head">
          <h2>上传约束提示</h2>
        </div>
        <div className="info-list compact">
          <div className="list-row">当前正式支持：正手高远球、杀球；一段视频只分析一种动作</div>
          <div className="list-row">时长：{UPLOAD_CONSTRAINTS.minDurationSeconds}~{UPLOAD_CONSTRAINTS.maxDurationSeconds} 秒</div>
          <div className="list-row">机位：优先 {UPLOAD_CONSTRAINTS.recommendedAngles.join(' 或 ')}</div>
          <div className="list-row">画面：单人出镜、全身尽量完整入镜、避免逆光和遮挡</div>
          <div className="list-row">文件：{UPLOAD_CONSTRAINTS.supportedExtensions.join(' / ')}，建议小于 {Math.round(UPLOAD_CONSTRAINTS.defaultMaxFileSizeBytes / 1024 / 1024)}MB</div>
          <div className="list-row">{actionReminder.title}专项：{actionReminder.description}</div>
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
              prepareFreshUpload()
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
            <div className="list-row">第 1 步会先上传完整视频，并只做粗粒度挥拍片段扫描</div>
            <div className="list-row">第 2 步由你从候选片段里确认真正要分析的那一段，再进入最终结果分析</div>
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
          label: hasSegmentChoices ? '确认片段并开始分析' : '上传并粗扫片段',
          onClick: () => void (hasSegmentChoices ? handleStartAnalysis() : handleScanVideo()),
          disabled: hasSegmentChoices ? startAnalysisDisabled : scanDisabled,
          loading: isBusy,
        }}
        secondary={hasSegmentChoices
          ? { label: '重新选择视频', onClick: prepareFreshUpload, tone: 'secondary' }
          : { label: '查看拍摄规范', to: '/guide', tone: 'secondary' }}
      />
    </div>
  )
}
