import { useEffect, useRef } from 'react'
import { Collapse } from 'antd-mobile'
import type { SegmentSelectionWindow, SwingSegmentCandidate } from '../../../../shared/contracts'
import { StatusPill } from '../../components/ui/StatusPill'
import { cn } from '../../lib/cn'
import pageStyles from '../../styles/PageLayout.module.scss'
import styles from './SegmentSelectionCard.module.scss'

const SEGMENT_ADJUST_STEP_MS = 120
const MIN_SELECTED_SEGMENT_WINDOW_MS = 420
const MAX_SELECTED_SEGMENT_WINDOW_MS = 3200

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

    const seekToSegmentStart = () => {
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
        // Mobile browsers may block autoplay.
      }
    }

    video.pause()
    seekToSegmentStart()

    video.addEventListener('loadedmetadata', seekToSegmentStart)
    video.addEventListener('timeupdate', keepLoopingInsideSegment)
    video.addEventListener('canplay', tryPlay)

    return () => {
      video.removeEventListener('loadedmetadata', seekToSegmentStart)
      video.removeEventListener('timeupdate', keepLoopingInsideSegment)
      video.removeEventListener('canplay', tryPlay)
      video.pause()
    }
  }, [endSeconds, src, startSeconds])

  return (
    <div className={cn(styles.preview, emphasized && styles.previewEmphasized)}>
      <video
        ref={videoRef}
        autoPlay
        disablePictureInPicture
        muted
        playsInline
        preload="metadata"
        src={src}
      />
      <span className={styles.previewLabel}>{posterLabel}</span>
    </div>
  )
}

export function SegmentSelectionCard({
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

  const effectiveWindow = activeSegment ? normalizeWindow(
    selectedWindow ?? baseWindow ?? {
      startTimeMs: activeSegment.startTimeMs,
      endTimeMs: activeSegment.endTimeMs,
    },
    videoDurationMs,
  ) : null

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

    onAdjustWindow(normalizeWindow({
      ...effectiveWindow,
      startFrame: activeSegment.startFrame,
      endFrame: activeSegment.endFrame,
      ...(boundary === 'start'
        ? { startTimeMs: effectiveWindow.startTimeMs + deltaMs }
        : { endTimeMs: effectiveWindow.endTimeMs + deltaMs }),
    }, videoDurationMs))
  }

  return (
    <section className={cn(pageStyles.card, styles.card)}>
      <div className={pageStyles.sectionHeader}>
        <h2>选择要分析的挥拍片段</h2>
        <p className={pageStyles.muted}>系统已经先对整段视频做了粗扫。现在请从候选片段里选出这次真正要进入精分析的一段。</p>
      </div>

      <div className={styles.summaryStrip}>
        <div className={pageStyles.keyItem}>
          <span>候选片段</span>
          <strong>{segments.length}</strong>
        </div>
        <div className={pageStyles.keyItem}>
          <span>默认推荐</span>
          <strong>{recommendedSegmentId ?? '—'}</strong>
        </div>
        <div className={pageStyles.keyItem}>
          <span>当前选择</span>
          <strong>{activeSegment?.segmentId ?? '—'}</strong>
        </div>
      </div>

      <div className={styles.chipRow}>
        {segments.map((segment) => {
          const isActive = segment.segmentId === activeSegment?.segmentId
          const chipWindow = isActive && effectiveWindow ? effectiveWindow : {
            startTimeMs: segment.startTimeMs,
            endTimeMs: segment.endTimeMs,
          }

          return (
            <button
              key={segment.segmentId}
              className={cn(styles.chip, isActive && styles.chipActive)}
              onClick={() => onSelect(segment.segmentId)}
              type="button"
            >
              <strong>{segment.segmentId}</strong>
              <span>{formatSegmentTimestamp(chipWindow.startTimeMs)} - {formatSegmentTimestamp(chipWindow.endTimeMs)}</span>
              <div className={styles.inlinePills}>
                {segment.segmentId === recommendedSegmentId ? <em>系统推荐</em> : null}
                {segment.segmentId === selectedSegmentId ? <em>当前选择</em> : null}
              </div>
            </button>
          )
        })}
      </div>

      {activeSegment && effectiveWindow ? (
        <div className={styles.detailCard}>
          {previewUrl ? (
            <SegmentPreviewVideo
              src={previewUrl}
              startTimeMs={effectiveWindow.startTimeMs}
              endTimeMs={effectiveWindow.endTimeMs}
              posterLabel={`当前选中片段预览 · ${formatSegmentTimestamp(effectiveWindow.startTimeMs)} - ${formatSegmentTimestamp(effectiveWindow.endTimeMs)}`}
              emphasized
            />
          ) : null}

          <div className={styles.detailHeader}>
            <div>
              <strong>{activeSegment.segmentId}</strong>
              <p>{formatSegmentTimestamp(effectiveWindow.startTimeMs)} - {formatSegmentTimestamp(effectiveWindow.endTimeMs)}，时长 {formatSegmentDuration(effectiveWindow.endTimeMs - effectiveWindow.startTimeMs)}</p>
            </div>
            <div className={styles.badgeRow}>
              {activeSegment.segmentId === recommendedSegmentId ? <StatusPill label="系统推荐" tone="brand" /> : null}
              {activeSegment.segmentId === selectedSegmentId ? <StatusPill label="待进入精分析" tone="success" /> : null}
              {isWindowAdjusted ? <StatusPill label="已微调" tone="neutral" /> : null}
            </div>
          </div>

          <div className={pageStyles.tagRow}>
            {activeSegment.coarseQualityFlags.length > 0 ? (
              activeSegment.coarseQualityFlags.map((flag) => (
                <span key={flag} className={pageStyles.tag}>{formatQualityFlag(flag)}</span>
              ))
            ) : (
              <span className={pageStyles.tag}>当前没有明显粗粒度风险标记</span>
            )}
          </div>

          <div className={pageStyles.infoList}>
            <div className={pageStyles.listRow}>当前会送去精分析的时间窗：{formatSegmentTimestamp(effectiveWindow.startTimeMs)} - {formatSegmentTimestamp(effectiveWindow.endTimeMs)}</div>
            <div className={pageStyles.listRow}>如果系统切得偏紧，再展开下面的高级微调补一点边界即可。</div>
          </div>

          <Collapse className={styles.advancedCollapse}>
            <Collapse.Panel key="adjustments" title="高级微调（可选）">
              <div className={styles.advancedBody}>
                <div className={pageStyles.keyGrid}>
                  <div className={pageStyles.keyItem}><span>运动强度</span><strong>{activeSegment.motionScore.toFixed(2)}</strong></div>
                  <div className={pageStyles.keyItem}><span>推荐置信度</span><strong>{Math.round(activeSegment.confidence * 100)}%</strong></div>
                  <div className={pageStyles.keyItem}><span>排序分</span><strong>{activeSegment.rankingScore.toFixed(2)}</strong></div>
                </div>
                <div className={styles.adjustGrid}>
                  <button type="button" className={styles.secondaryButton} onClick={() => handleAdjust('start', -SEGMENT_ADJUST_STEP_MS)}>起点提前</button>
                  <button type="button" className={styles.secondaryButton} onClick={() => handleAdjust('start', SEGMENT_ADJUST_STEP_MS)}>起点后移</button>
                  <button type="button" className={styles.secondaryButton} onClick={() => handleAdjust('end', -SEGMENT_ADJUST_STEP_MS)}>终点前移</button>
                  <button type="button" className={styles.secondaryButton} onClick={() => handleAdjust('end', SEGMENT_ADJUST_STEP_MS)}>终点延后</button>
                  <button type="button" className={styles.secondaryButton} onClick={onResetWindow}>恢复系统切段</button>
                </div>
              </div>
            </Collapse.Panel>
          </Collapse>
        </div>
      ) : null}
    </section>
  )
}
