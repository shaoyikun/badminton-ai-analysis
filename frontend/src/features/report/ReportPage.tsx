import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ComparisonResponse, ReportPhaseAssessment, ReportResult } from '../../../../shared/contracts'
import { fetchTaskComparison, fetchTaskResult } from '../../app/analysis-session/api'
import { buildComparisonRoute, buildProcessingRoute, ROUTES } from '../../app/routes'
import { getReportLevel, getTrainingFocus } from '../../components/result-views/insights'
import { buildAssetUrl } from '../../components/result-views/utils'
import { ScoreBadge } from '../../components/ui/ScoreBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { Notice } from '../../components/ui/Notice'
import { StatusPill } from '../../components/ui/StatusPill'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import { cn } from '../../lib/cn'
import pageStyles from '../../styles/PageLayout.module.scss'
import styles from './ReportPage.module.scss'

function formatSegmentTime(valueMs: number) {
  return `${(valueMs / 1000).toFixed(2)}s`
}

function getPhaseTone(status: ReportPhaseAssessment['status']) {
  if (status === 'ok') return 'success' as const
  if (status === 'attention') return 'progress' as const
  return 'danger' as const
}

function getPhaseLabel(status: ReportPhaseAssessment['status']) {
  if (status === 'ok') return '已识别'
  if (status === 'attention') return '需回看'
  return '证据不足'
}

function getComparisonCopy(comparison: ComparisonResponse | null) {
  if (!comparison) {
    return {
      title: '还没有可直接展示的复测结论',
      description: '完成下一次同动作复测后，这里会直接告诉你这次有没有进步、哪一段更值得继续盯。',
    }
  }

  if (comparison.unavailableReason === 'scoring_model_mismatch') {
    return {
      title: '当前这次暂时不能直接和旧基线比较',
      description: '评分模型已经升级。历史样本仍然保留，但这次不会把新旧分数硬拼在一起误导你。',
    }
  }

  if (!comparison.comparison) {
    return {
      title: '先完成至少两次同动作分析',
      description: '当系统手里有当前样本和一个稳定基线后，这里才会给出完整复测结论。',
    }
  }

  return {
    title: comparison.comparison.coachReview.headline,
    description: comparison.comparison.summaryText,
  }
}

export function ReportPage() {
  const params = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const {
    appendLog,
    rememberCompletedTask,
    selectedCompareTaskId,
    setFriendlyError,
    setSelectedCompareTaskId,
    setTaskId,
  } = useAnalysisTask()
  const [report, setReport] = useState<ReportResult | null>(null)
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!params.taskId) {
      navigate(ROUTES.upload, { replace: true })
      return
    }

    let active = true

    const load = async () => {
      setIsLoading(true)
      const reportResult = await fetchTaskResult(params.taskId!)

      if (!active) return

      if (!reportResult.ok) {
        if (reportResult.error?.code === 'result_not_ready') {
          navigate(buildProcessingRoute(params.taskId!), { replace: true })
          return
        }

        if (reportResult.error?.code === 'task_not_found') {
          navigate(ROUTES.upload, { replace: true })
          return
        }

        setFriendlyError(reportResult.error?.code, reportResult.error?.message)
        navigate(ROUTES.error, { replace: true })
        return
      }

      setReport(reportResult.data)
      setTaskId(reportResult.data.taskId)
      rememberCompletedTask(reportResult.data.taskId, reportResult.data.actionType)
      appendLog(`报告已加载：${reportResult.data.taskId}`)

      const comparisonResult = await fetchTaskComparison(
        reportResult.data.taskId,
        selectedCompareTaskId || undefined,
      )

      if (!active) return

      if (comparisonResult.ok) {
        setComparison(comparisonResult.data)
        if (!selectedCompareTaskId && comparisonResult.data.baselineTask?.taskId) {
          setSelectedCompareTaskId(comparisonResult.data.baselineTask.taskId)
        }
      } else {
        setComparison(null)
      }

      setIsLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [
    appendLog,
    navigate,
    params.taskId,
    rememberCompletedTask,
    selectedCompareTaskId,
    setFriendlyError,
    setSelectedCompareTaskId,
    setTaskId,
  ])

  if (!params.taskId) {
    return null
  }

  if (!report && isLoading) {
    return (
      <div className={pageStyles.pageStack}>
        <section className={cn(pageStyles.card, styles.skeletonCard)}>
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
          <div className={cn(styles.skeletonLine, styles.shortLine)} />
        </section>
      </div>
    )
  }

  if (!report) {
    return (
      <EmptyState
        badge="报告未就绪"
        title="还没有可查看的分析报告"
        description="先完成一条上传分析，这里才会显示你最近一次的动作诊断。"
        primary={{ label: '去上传', to: ROUTES.upload }}
        secondary={{ label: '返回首页', to: ROUTES.home }}
      />
    )
  }

  const reportLevel = getReportLevel(report.totalScore)
  const trainingFocus = getTrainingFocus(report)
  const comparisonCopy = getComparisonCopy(comparison)
  const analysisDisposition = report.scoringEvidence?.analysisDisposition
  const lowConfidenceReasons = report.scoringEvidence?.rejectionDecision?.lowConfidenceReasons ?? []
  const selectedSegment = report.swingSegments?.find((segment) => segment.segmentId === report.selectedSegmentId)
  const bestFrameOverlay = buildAssetUrl(report.visualEvidence?.bestFrameOverlayPath)

  return (
    <div className={pageStyles.pageStack}>
      <section className={pageStyles.heroCard}>
        <span className={pageStyles.badge}>
          {report.actionType === 'smash' ? '杀球报告' : '正手高远球报告'}
        </span>
        <h1>{report.summaryText ?? '这次报告已经生成，先看懂最该优先收住的动作点。'}</h1>
        <p>{reportLevel.summary}</p>
        <div className={styles.heroGrid}>
          <div className={pageStyles.keyItem}>
            <span>总评分</span>
            <div className={styles.scoreWrap}>
              <ScoreBadge label="总分" size="l" tone="good" value={report.totalScore} />
            </div>
            <p>总分只负责给你一个整体温度，真正的训练重点看下面的核心问题和复测结论。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>当前等级</span>
            <strong>{reportLevel.label}</strong>
            <p>{trainingFocus.primaryDescription}</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>当前复测结论</span>
            <strong>{comparisonCopy.title}</strong>
            <p>{comparisonCopy.description}</p>
          </div>
        </div>
      </section>

      {analysisDisposition === 'low_confidence' || lowConfidenceReasons.length > 0 ? (
        <Notice tone="warning" title="这次结果可看，但需要结合拍摄条件谨慎理解">
          当前样本已经生成报告，但系统判断这次证据质量不算理想。建议优先回看拍摄条件和报告前两项重点，不要一次性放大所有细节结论。
        </Notice>
      ) : null}

      <section className={pageStyles.card}>
        <span className={pageStyles.eyebrow}>Primary Focus</span>
        <div className={pageStyles.sectionHeader}>
          <h2>这次先练这一件事</h2>
          <p className={pageStyles.muted}>{trainingFocus.actionDescription}</p>
        </div>
        <div className={styles.focusCard}>
          <div className={pageStyles.infoList}>
            <div className={pageStyles.listRow}>
              <span>最核心的问题</span>
              <strong>{trainingFocus.primaryTitle}</strong>
              <p>{trainingFocus.impact}</p>
            </div>
            <div className={pageStyles.listRow}>
              <span>下次训练先盯</span>
              <strong>{trainingFocus.actionTitle}</strong>
              <p>{trainingFocus.checkDescription}</p>
            </div>
          </div>
        </div>
      </section>

      <section className={pageStyles.card}>
        <span className={pageStyles.eyebrow}>Retest</span>
        <div className={pageStyles.sectionHeader}>
          <h2>当前复测结论</h2>
          <p className={pageStyles.muted}>{comparisonCopy.description}</p>
        </div>
        <div className={styles.retestGrid}>
          <div className={pageStyles.keyItem}>
            <span>这次状态</span>
            <strong>{comparisonCopy.title}</strong>
          </div>
          <div className={pageStyles.keyItem}>
            <span>复测入口</span>
            <strong>{comparison?.comparison ? '已可查看完整对比' : '先继续积累样本'}</strong>
            <p>{comparison?.comparison?.coachReview.nextFocus ?? '完成下一次同动作复测后，这里会出现更明确的进步/回落判断。'}</p>
          </div>
        </div>
        {comparison?.comparison ? (
          <div className={pageStyles.infoList}>
            <div className={pageStyles.listRow}>
              <span>教练式结论</span>
              <strong>{comparison.comparison.coachReview.headline}</strong>
              <p>{comparison.comparison.coachReview.progressNote}</p>
            </div>
            <div className={pageStyles.listRow}>
              <span>下次只盯</span>
              <strong>{comparison.comparison.coachReview.nextFocus}</strong>
              <p>{comparison.comparison.coachReview.nextCheck}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>关键证据</h2>
          <p className={pageStyles.muted}>先确认系统实际分析了哪一段，再看骨架证据和动作阶段拆解。</p>
        </div>
        <div className={pageStyles.keyGrid}>
          <div className={pageStyles.keyItem}>
            <span>当前分析片段</span>
            <strong>{selectedSegment ? `${formatSegmentTime(selectedSegment.startTimeMs)} - ${formatSegmentTime(selectedSegment.endTimeMs)}` : '系统推荐片段'}</strong>
            <p>整段视频会先粗扫，再由你确认真正进入精分析的这一段。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>证据帧</span>
            <strong>{report.scoringEvidence?.usableFrameCount ?? '—'} / {report.scoringEvidence?.detectedFrameCount ?? '—'} 帧</strong>
            <p>当前报告优先基于可稳定识别的人体关键帧生成。</p>
          </div>
        </div>
        {bestFrameOverlay ? (
          <div className={styles.evidenceFrame}>
            <img alt="当前动作最佳骨架叠加帧" src={bestFrameOverlay} />
          </div>
        ) : null}
        {report.phaseBreakdown?.length ? (
          <div className={styles.phaseGrid}>
            {report.phaseBreakdown.map((phase) => (
              <div key={phase.phaseKey} className={styles.phaseCard}>
                <div className={styles.phaseHeader}>
                  <strong>{phase.label}</strong>
                  <StatusPill label={getPhaseLabel(phase.status)} tone={getPhaseTone(phase.status)} />
                </div>
                <p>{phase.summary}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>动作问题拆解</h2>
          <p className={pageStyles.muted}>先看最影响结果的主问题，再看它为什么值得先练。</p>
        </div>
        <div className={pageStyles.infoList}>
          {report.issues.map((issue) => (
            <div key={issue.title} className={pageStyles.listRow}>
              <span>{issue.issueType === 'evidence_gap' ? '证据提醒' : '核心问题'}</span>
              <strong>{issue.title}</strong>
              <p>{issue.description}</p>
              <p>{issue.impact}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>分维度评分</h2>
          <p className={pageStyles.muted}>维度分数用来辅助判断“先改哪一项更值”。</p>
        </div>
        <div className={styles.dimensionGrid}>
          {report.dimensionScores.map((dimension) => (
            <div key={dimension.name} className={styles.dimensionCard}>
              <div>
                <strong>{dimension.name}</strong>
                <p>{dimension.note ?? '当前维度已纳入正式评分。'}</p>
              </div>
              <ScoreBadge tone={dimension.score >= 80 ? 'good' : 'neutral'} value={dimension.score} />
            </div>
          ))}
        </div>
      </section>

      {report.swingSegments?.length ? (
        <section className={pageStyles.card}>
          <div className={pageStyles.sectionHeader}>
            <h2>识别视角与候选片段</h2>
            <p className={pageStyles.muted}>这些信息属于二级细节，用来帮助你理解系统看到的上下文和切段结果。</p>
          </div>
          <div className={pageStyles.keyGrid}>
            <div className={pageStyles.keyItem}>
              <span>视角识别</span>
              <strong>{report.recognitionContext?.viewLabel ?? '未知视角'}</strong>
              <p>可信度 {Math.round((report.recognitionContext?.viewConfidence ?? 0) * 100)}%</p>
            </div>
            <div className={pageStyles.keyItem}>
              <span>挥拍侧</span>
              <strong>{report.recognitionContext?.dominantRacketSideLabel ?? '未识别'}</strong>
              <p>引擎：{report.recognitionContext?.engine ?? 'mediapipe-pose'}</p>
            </div>
          </div>
          <div className={styles.segmentList}>
            {report.swingSegments.map((segment) => {
              const isActive = segment.segmentId === report.selectedSegmentId
              return (
                <button
                  key={segment.segmentId}
                  className={cn(styles.segmentButton, isActive && styles.segmentButtonActive)}
                  disabled
                  type="button"
                >
                  {segment.segmentId} {formatSegmentTime(segment.startTimeMs)} - {formatSegmentTime(segment.endTimeMs)} {isActive ? '当前分析' : '候选片段'}
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {report.standardComparison ? (
        <section className={pageStyles.card}>
          <div className={pageStyles.sectionHeader}>
            <h2>当前视角动作参考对照</h2>
            <p className={pageStyles.muted}>{report.standardComparison.summaryText}</p>
          </div>
          <div className={pageStyles.infoList}>
            {report.standardComparison.differences.map((difference) => (
              <div key={difference} className={pageStyles.listRow}>
                <span>参考差异</span>
                <strong>{difference}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>深层证据与后续建议</h2>
          <p className={pageStyles.muted}>当你已经看懂主结论，再继续看剩余建议和证据说明。</p>
        </div>
        <div className={pageStyles.infoList}>
          {report.suggestions.map((suggestion) => (
            <div key={suggestion.title} className={pageStyles.listRow}>
              <span>{suggestion.suggestionType === 'capture_fix' ? '拍摄建议' : '训练建议'}</span>
              <strong>{suggestion.title}</strong>
              <p>{suggestion.description}</p>
            </div>
          ))}
          {report.evidenceNotes?.map((note) => (
            <div key={note} className={pageStyles.listRow}>
              <span>补充说明</span>
              <strong>{note}</strong>
            </div>
          ))}
        </div>
      </section>

      <BottomCTA
        sticky={false}
        primary={{ label: '再次测试', to: ROUTES.upload }}
        secondary={{
          label: comparison?.comparison ? '查看完整复测对比' : '查看历史',
          to: comparison?.comparison ? buildComparisonRoute(report.taskId) : ROUTES.history,
          tone: 'secondary',
        }}
      />
    </div>
  )
}
