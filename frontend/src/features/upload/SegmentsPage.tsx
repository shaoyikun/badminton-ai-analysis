import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { FlowStepHeader } from '../../components/ui/FlowStepHeader'
import { Notice } from '../../components/ui/Notice'
import { buildProcessingRoute, ROUTES } from '../../app/routes'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import pageStyles from '../../styles/PageLayout.module.scss'
import { SegmentSelectionCard } from './SegmentSelectionCard'
import styles from './SegmentsPage.module.scss'

export function SegmentsPage() {
  const navigate = useNavigate()
  const params = useParams<{ taskId: string }>()
  const {
    taskId,
    segmentScan,
    selectedSegmentId,
    setSelectedSegmentId,
    selectedSegmentWindow,
    setSelectedSegmentWindow,
    selectedActionLabel,
    selectedVideoSummary,
    file,
    isBusy,
    startSelectedSegmentFlow,
  } = useAnalysisTask()
  const [submissionError, setSubmissionError] = useState('')

  const previewUrl = file ? URL.createObjectURL(file) : ''
  const hasSegmentChoices = Boolean(segmentScan?.swingSegments?.length)
  const currentTaskId = params.taskId ?? taskId
  const videoDurationMs = Math.max(
    1,
    Math.round((selectedVideoSummary?.durationSeconds ?? 0) * 1000),
    ...(segmentScan?.swingSegments ?? []).map((segment) => segment.endTimeMs),
  )

  useEffect(() => {
    if (!params.taskId) {
      navigate(ROUTES.upload, { replace: true })
      return
    }
    if (!hasSegmentChoices || taskId !== params.taskId) {
      navigate(ROUTES.upload, { replace: true })
    }
  }, [hasSegmentChoices, navigate, params.taskId, taskId])

  useEffect(() => {
    if (!previewUrl) return
    return () => {
      URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function handleStartAnalysis() {
    setSubmissionError('')
    const result = await startSelectedSegmentFlow()
    if (result.ok) {
      navigate(buildProcessingRoute(currentTaskId))
      return
    }
    if (result.reason === 'server') {
      navigate(ROUTES.error)
      return
    }
    setSubmissionError(result.message ?? '启动分析失败，请稍后再试。')
  }

  if (!params.taskId || !hasSegmentChoices || taskId !== params.taskId) {
    return null
  }

  return (
    <div className={pageStyles.pageStack}>
      <FlowStepHeader
        badge="第 2 步"
        title="确认本次真正要分析的挥拍片段"
        description="粗扫已经完成。现在先把本次要进入精分析的片段确认清楚，再进入正式报告生成。"
        steps={[
          { key: 'prepare', label: '上传准备', hint: '视频已上传并完成粗扫', state: 'done' },
          { key: 'segments', label: '确认片段', hint: '先选中本次真正要分析的一段', state: 'current' },
          { key: 'processing', label: '等待结果', hint: '系统会自动进入分析与报告生成', state: 'upcoming' },
        ]}
      />

      <section className={pageStyles.card}>
        <div className={styles.summaryGrid}>
          <div className={pageStyles.keyItem}>
            <span>当前动作</span>
            <strong>{selectedActionLabel}</strong>
            <p>确认后的片段会直接决定本次报告分析的是哪一拍。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>粗扫结果</span>
            <strong>{segmentScan?.swingSegments.length ?? 0} 个候选</strong>
            <p>系统已帮你筛出更像完整挥拍的片段，默认推荐其中一段。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>当前视频</span>
            <strong>{selectedVideoSummary?.fileName ?? '已上传视频'}</strong>
            <p>{selectedVideoSummary?.durationSeconds ? `约 ${Math.round(selectedVideoSummary.durationSeconds)} 秒` : '如果需要换视频，请返回上传准备页重新选择。'}</p>
          </div>
        </div>
      </section>

      <Notice tone="info" title="先做一个轻量判断">
        优先选“准备、击球、收拍都更完整”的候选片段。只有当系统切得偏紧时，再展开高级微调补一点边界。
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

      {submissionError ? (
        <Notice compact tone="error" title="还不能开始分析">
          {submissionError}
        </Notice>
      ) : null}

      <BottomCTA
        primary={{
          label: '确认片段并开始分析',
          onClick: () => void handleStartAnalysis(),
          disabled: isBusy || !selectedSegmentId,
          loading: isBusy,
        }}
        secondary={{ label: '返回上传准备页', to: ROUTES.upload, tone: 'secondary' }}
      />
    </div>
  )
}
