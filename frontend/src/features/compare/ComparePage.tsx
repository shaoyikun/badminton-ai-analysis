import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ComparisonResponse } from '../../../../shared/contracts'
import { fetchTaskComparison } from '../../app/analysis-session/api'
import { buildProcessingRoute, buildReportRoute, ROUTES } from '../../app/routes'
import { BottomCTA } from '../../components/ui/BottomCTA'
import {
  getComparisonChangeLabel,
  getComparisonRiskLabel,
  getComparisonTrendLabel,
} from '../../components/result-views/insights'
import { EmptyState } from '../../components/ui/EmptyState'
import { ScoreBadge } from '../../components/ui/ScoreBadge'
import { StatusPill } from '../../components/ui/StatusPill'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import pageStyles from '../../styles/PageLayout.module.scss'
import styles from './ComparePage.module.scss'

function getPhaseTone(changed: boolean) {
  return changed ? 'progress' as const : 'success' as const
}

function formatDateTime(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export function ComparePage() {
  const navigate = useNavigate()
  const params = useParams<{ taskId: string }>()
  const {
    appendLog,
    rememberCompletedTask,
    selectedCompareTaskId,
    setFriendlyError,
    setSelectedCompareTaskId,
    setTaskId,
  } = useAnalysisTask()
  const [response, setResponse] = useState<ComparisonResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!params.taskId) {
      navigate(ROUTES.upload, { replace: true })
      return
    }

    let active = true

    const load = async () => {
      setIsLoading(true)
      const comparisonResult = await fetchTaskComparison(
        params.taskId!,
        selectedCompareTaskId || undefined,
      )

      if (!active) return

      if (!comparisonResult.ok) {
        if (comparisonResult.error?.code === 'result_not_ready') {
          navigate(buildProcessingRoute(params.taskId!), { replace: true })
          return
        }

        if (comparisonResult.error?.code === 'task_not_found') {
          navigate(ROUTES.upload, { replace: true })
          return
        }

        setFriendlyError(comparisonResult.error?.code, comparisonResult.error?.message)
        navigate(ROUTES.error, { replace: true })
        return
      }

      setResponse(comparisonResult.data)
      setTaskId(comparisonResult.data.currentTask.taskId)
      rememberCompletedTask(comparisonResult.data.currentTask.taskId, comparisonResult.data.currentTask.actionType)
      if (comparisonResult.data.baselineTask.taskId) {
        setSelectedCompareTaskId(comparisonResult.data.baselineTask.taskId)
      }
      appendLog(`复测对比已加载：${comparisonResult.data.currentTask.taskId}`)
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

  if (isLoading) {
    return (
      <div className={pageStyles.pageStack}>
        <section className={pageStyles.card}>
          <p className={pageStyles.muted}>复测对比加载中...</p>
        </section>
      </div>
    )
  }

  if (!response?.comparison && !response?.unavailableReason) {
    return (
      <EmptyState
        badge="暂无对比"
        title="当前还没有可对比的同动作样本"
        description="等你完成下一次上传，或者先从历史记录里选一条样本做基线，就能看到这次有没有进步。"
        primary={{ label: '去历史记录', to: ROUTES.history }}
        secondary={{ label: '继续上传', to: ROUTES.upload }}
      />
    )
  }

  if (!response) {
    return null
  }

  if (!response.comparison && response.unavailableReason === 'scoring_model_mismatch') {
    return (
      <div className={pageStyles.pageStack}>
        <section className={pageStyles.heroCard}>
          <span className={pageStyles.badge}>复测对比</span>
          <h1>当前这次暂时不能直接和旧基线比较</h1>
          <p>评分模型已经升级。历史样本仍然保留，但系统不会把不同版本的评分结果硬拼在一起。</p>
        </section>
        <section className={pageStyles.card}>
          <div className={pageStyles.infoList}>
            <div className={pageStyles.listRow}>
              <span>当前样本</span>
              <strong>{response.currentTask.taskId}</strong>
            </div>
            <div className={pageStyles.listRow}>
              <span>旧基线</span>
              <strong>{response.baselineTask.taskId}</strong>
            </div>
          </div>
        </section>
        <BottomCTA
          primary={{ label: '继续复测上传', to: ROUTES.upload }}
          secondary={{ label: '返回本次报告', to: buildReportRoute(params.taskId), tone: 'secondary' }}
        />
      </div>
    )
  }

  const comparison = response.comparison
  if (!comparison) {
    return null
  }

  return (
    <div className={pageStyles.pageStack}>
      <section className={pageStyles.heroCard}>
        <span className={pageStyles.badge}>复测结论</span>
        <h1>{getComparisonTrendLabel(comparison.totalScoreDelta)}</h1>
        <p>{comparison.summaryText}</p>
        <div className={styles.heroGrid}>
          <div className={pageStyles.keyItem}>
            <span>参考分数变化</span>
            <div className={styles.scoreWrap}>
              <ScoreBadge
                label="变化"
                tone={comparison.totalScoreDelta > 0 ? 'improve' : 'neutral'}
                value={comparison.totalScoreDelta > 0 ? `+${comparison.totalScoreDelta}` : comparison.totalScoreDelta}
              />
            </div>
          </div>
          <div className={pageStyles.keyItem}>
            <span>最明显变化</span>
            <strong>{getComparisonChangeLabel(comparison)}</strong>
            <p>{comparison.coachReview.progressNote}</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>当前风险</span>
            <strong>{getComparisonRiskLabel(comparison)}</strong>
            <p>{comparison.coachReview.regressionNote ?? '当前没有明显回落项。'}</p>
          </div>
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>当前样本 vs 当前基线</h2>
          <p className={pageStyles.muted}>先明确系统正在拿哪条历史样本做比较，再看后面的阶段和维度变化。</p>
        </div>
        <div className={styles.phaseGrid}>
          <div className={styles.phaseCard}>
            <div className={styles.phaseHeader}>
              <strong>当前样本</strong>
              <StatusPill label="本次分析" tone="brand" />
            </div>
            <p>{response.currentTask.taskId}</p>
            <p>{formatDateTime(response.currentTask.completedAt)}</p>
          </div>
          <div className={styles.phaseCard}>
            <div className={styles.phaseHeader}>
              <strong>当前基线</strong>
              <StatusPill label="历史样本" tone="success" />
            </div>
            <p>{response.baselineTask.taskId}</p>
            <p>{formatDateTime(response.baselineTask.completedAt)}</p>
          </div>
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>这次先看什么</h2>
          <p className={pageStyles.muted}>先判断训练方向有没有起作用，再决定下次只盯什么，不要一口气追所有分数项。</p>
        </div>
        <div className={pageStyles.infoList}>
          <div className={pageStyles.listRow}>
            <span>总体判断</span>
            <strong>{comparison.coachReview.headline}</strong>
            <p>{comparison.coachReview.keepDoing ?? comparison.coachReview.progressNote}</p>
          </div>
          <div className={pageStyles.listRow}>
            <span>下一次只盯</span>
            <strong>{comparison.coachReview.nextFocus}</strong>
            <p>{comparison.coachReview.nextCheck}</p>
          </div>
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>阶段变化</h2>
          <p className={pageStyles.muted}>阶段变化比单纯分数更能告诉你动作节奏有没有守住。</p>
        </div>
        <div className={styles.phaseGrid}>
          {comparison.phaseDeltas.map((phase) => (
            <div key={phase.phaseKey} className={styles.phaseCard}>
              <div className={styles.phaseHeader}>
                <strong>{phase.label}</strong>
                <StatusPill label={phase.changed ? '有变化' : '已守住'} tone={getPhaseTone(phase.changed)} />
              </div>
              <p>{phase.summary}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>分维度变化</h2>
          <p className={pageStyles.muted}>把最值得继续保持和最该回看的维度拆开看，会更容易安排下次训练。</p>
        </div>
        <div className={pageStyles.infoList}>
          {comparison.improvedDimensions.map((item) => (
            <div key={`improve-${item.name}`} className={pageStyles.listRow}>
              <span>进步项</span>
              <strong>{item.name}</strong>
              <p>{`${item.previousScore} -> ${item.currentScore}（+${item.delta}）`}</p>
            </div>
          ))}
          {comparison.declinedDimensions.map((item) => (
            <div key={`decline-${item.name}`} className={pageStyles.listRow}>
              <span>回落项</span>
              <strong>{item.name}</strong>
              <p>{`${item.previousScore} -> ${item.currentScore}（${item.delta}）`}</p>
            </div>
          ))}
          {comparison.unchangedDimensions.map((item) => (
            <div key={`stable-${item.name}`} className={pageStyles.listRow}>
              <span>守住项</span>
              <strong>{item.name}</strong>
              <p>{`${item.previousScore} -> ${item.currentScore}`}</p>
            </div>
          ))}
        </div>
      </section>

      <BottomCTA
        primary={{ label: '继续复测上传', to: ROUTES.upload }}
        secondary={{ label: '返回本次报告', to: buildReportRoute(params.taskId), tone: 'secondary' }}
      />
    </div>
  )
}
