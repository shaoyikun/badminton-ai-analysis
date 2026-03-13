import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ReportResult, TaskHistoryItem } from '../../../../shared/contracts'
import { fetchHistoryDetail, fetchHistoryList, fetchTaskComparison } from '../../app/analysis-session/api'
import { buildComparisonRoute, ROUTES } from '../../app/routes'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { EmptyState } from '../../components/ui/EmptyState'
import { ActionTypeSelector } from '../../components/ui/ActionTypeSelector'
import { getActionTypeLabel, getTrainingFocus, getValidBaselineItem } from '../../components/result-views/insights'
import { formatTime } from '../../components/result-views/utils'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import { cn } from '../../lib/cn'
import pageStyles from '../../styles/PageLayout.module.scss'
import styles from './HistoryPage.module.scss'

function formatDay(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('zh-CN')
}

function getHistoryTrendSummary(history: TaskHistoryItem[]) {
  if (history.length < 2) {
    return '先完成至少两次同动作分析，系统才更容易告诉你训练方向是不是在持续起作用。'
  }

  const [current, previous] = history
  const delta = (current.totalScore ?? 0) - (previous.totalScore ?? 0)
  if (delta > 0) return `和上一条相比，这次整体提升了 ${delta} 分，当前训练方向值得继续守住。`
  if (delta < 0) return `和上一条相比，这次回落了 ${Math.abs(delta)} 分，更建议先回看最近那次准备和衔接。`
  return '最近两条样本总分接近，先继续沿着当前主动作线做稳定复测。'
}

export function HistoryPage() {
  const navigate = useNavigate()
  const {
    actionType,
    latestCompletedTaskId,
    selectedCompareTaskId,
    setSelectedCompareTaskId,
  } = useAnalysisTask()
  const [history, setHistory] = useState<TaskHistoryItem[]>([])
  const [selectedHistoryReport, setSelectedHistoryReport] = useState<ReportResult | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const currentBaseline = getValidBaselineItem(history, selectedCompareTaskId)
  const isViewingBaseline = currentBaseline?.taskId === selectedHistoryReport?.taskId
  const canOpenCurrentComparison = Boolean(latestCompletedTaskId && currentBaseline)
  const selectedFocus = selectedHistoryReport ? getTrainingFocus(selectedHistoryReport) : null
  const historyHeading = `${getActionTypeLabel(actionType)}历史样本`
  const trendSummary = useMemo(() => getHistoryTrendSummary(history), [history])

  useEffect(() => {
    let active = true

    const load = async () => {
      setIsLoading(true)
      const historyResult = await fetchHistoryList(actionType)
      if (!active) return

      if (historyResult.ok) {
        setHistory(historyResult.data.items)
      } else {
        setHistory([])
      }

      if (latestCompletedTaskId && !selectedCompareTaskId) {
        const comparisonResult = await fetchTaskComparison(latestCompletedTaskId)
        if (active && comparisonResult.ok) {
          setSelectedCompareTaskId(comparisonResult.data.baselineTask.taskId)
        }
      }

      if (active) {
        setDetailOpen(false)
        setSelectedHistoryReport(null)
        setIsLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [actionType, latestCompletedTaskId, selectedCompareTaskId, setSelectedCompareTaskId])

  async function openDetail(taskId: string) {
    const detailResult = await fetchHistoryDetail(taskId)
    if (!detailResult.ok) return

    setSelectedHistoryReport(detailResult.data.report)
    setDetailOpen(true)
  }

  function handleUseAsBaseline(taskId: string) {
    setSelectedCompareTaskId(taskId)
    setDetailOpen(false)

    if (latestCompletedTaskId) {
      navigate(buildComparisonRoute(latestCompletedTaskId))
    }
  }

  function handleViewCurrentComparison() {
    setDetailOpen(false)
    if (latestCompletedTaskId) {
      navigate(buildComparisonRoute(latestCompletedTaskId))
    }
  }

  if (isLoading) {
    return (
      <div className={pageStyles.pageStack}>
        <section className={pageStyles.card}>
          <p className={pageStyles.muted}>历史记录加载中...</p>
        </section>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <EmptyState
        badge="空状态"
        title="你还没有可回看的分析记录"
        description="完成第一次分析后，历史记录会出现在这里，后续就能用来做同动作复测对比。"
        primary={{ label: '开始第一次分析', to: ROUTES.guide }}
        secondary={{ label: '返回首页', to: ROUTES.home }}
      />
    )
  }

  return (
    <>
      <div className={pageStyles.pageStack}>
        <section className={pageStyles.heroCard}>
          <span className={pageStyles.badge}>History</span>
          <h1>{historyHeading}</h1>
          <p>历史不只是归档，而是帮你判断当前训练方向有没有继续起作用的基线池。</p>
          <div className={styles.heroGrid}>
            <div className={pageStyles.keyItem}>
              <span>同动作样本</span>
              <strong>{history.length} 条</strong>
              <p>当前只展示 {getActionTypeLabel(actionType)} 的历史样本和同动作复测基线。</p>
            </div>
            <div className={pageStyles.keyItem}>
              <span>当前基线</span>
              <strong>{currentBaseline ? `${formatDay(currentBaseline.createdAt)} · ${currentBaseline.totalScore ?? '—'} 分` : '还没有手动设定'}</strong>
              <p>{currentBaseline ? '切换基线后，对比页会立刻改用这条样本。' : '你可以先点开一条历史样本，再把它设成当前复测基线。'}</p>
            </div>
          </div>
        </section>

        <section className={pageStyles.card}>
          <div className={pageStyles.sectionHeader}>
            <h2>当前历史范围</h2>
          </div>
          <ActionTypeSelector />
          <p className={pageStyles.muted}>当前只展示 {getActionTypeLabel(actionType)} 的历史样本和同动作复测基线。</p>
        </section>

        <section className={pageStyles.card}>
          <span className={pageStyles.eyebrow}>Retest Context</span>
          <div className={pageStyles.sectionHeader}>
            <h2>继续复测的意义</h2>
          </div>
          <div className={styles.summaryGrid}>
            <div className={pageStyles.keyItem}>
              <span>同动作历史</span>
              <strong>已有 {history.length} 条可对比样本</strong>
              <p>每次复测都不是重新开始，而是在验证当前训练方向有没有真的起作用。</p>
            </div>
            <div className={pageStyles.keyItem}>
              <span>最近趋势</span>
              <strong>{canOpenCurrentComparison ? '当前已设好复测基线' : '还没有手动切换基线'}</strong>
              <p>{trendSummary}</p>
            </div>
          </div>
        </section>

        <section className={pageStyles.card}>
          <div className={pageStyles.sectionHeader}>
            <div>
              <h2>历史列表</h2>
              <p className={pageStyles.muted}>先点开一条看懂那次结论，再决定要不要把它设成当前对比基线。</p>
            </div>
          </div>
          <div className={styles.historyList}>
            {history.map((item) => {
              const isBaseline = currentBaseline?.taskId === item.taskId
              const isActive = selectedHistoryReport?.taskId === item.taskId && detailOpen

              return (
                <button
                  key={item.taskId}
                  className={cn(styles.historyCard, isBaseline && styles.historyCardBaseline, isActive && styles.historyCardActive)}
                  onClick={() => void openDetail(item.taskId)}
                  type="button"
                >
                  <div>
                    <div className={pageStyles.tagRow}>
                      <span className={pageStyles.tag}>{formatDay(item.createdAt)}</span>
                      {isBaseline ? <span className={cn(pageStyles.tag, styles.baselineTag)}>当前基线</span> : null}
                      {isActive ? <span className={cn(pageStyles.tag, styles.activeTag)}>正在查看</span> : null}
                    </div>
                    <strong>{`${getActionTypeLabel(item.actionType)} · ${item.totalScore ?? '—'} 分`}</strong>
                    <p>{item.summaryText ?? '已完成分析，可打开查看详情。'}</p>
                  </div>
                  <span>{formatTime(item.createdAt)}</span>
                </button>
              )
            })}
          </div>
        </section>

        <div className={pageStyles.actions}>
          {canOpenCurrentComparison && latestCompletedTaskId ? (
            <Link className={styles.primaryAction} to={buildComparisonRoute(latestCompletedTaskId)}>查看当前对比</Link>
          ) : null}
          <Link className={styles.secondaryAction} to={ROUTES.upload}>开始新的分析</Link>
        </div>
      </div>

      <BottomSheet open={detailOpen && Boolean(selectedHistoryReport)} onClose={() => setDetailOpen(false)} title="历史样本详情">
        {selectedHistoryReport && selectedFocus ? (
          <div className={styles.sheetStack}>
            <div className={cn(pageStyles.card, styles.sheetCard)}>
              <span className={pageStyles.eyebrow}>先看懂那次结果</span>
              <strong>{selectedHistoryReport.summaryText ?? '这次样本暂无摘要'}</strong>
              <p>{selectedFocus.primaryDescription}</p>
              <div className={pageStyles.infoList}>
                <div className={pageStyles.listRow}>
                  <span>那次最核心的问题</span>
                  <strong>{selectedFocus.primaryTitle}</strong>
                  <p>{selectedFocus.impact}</p>
                </div>
                <div className={pageStyles.listRow}>
                  <span>那次练完后应该继续看</span>
                  <strong>{selectedFocus.actionTitle}</strong>
                  <p>{selectedFocus.actionDescription}</p>
                </div>
              </div>
            </div>

            <div className={cn(pageStyles.card, styles.sheetCard)}>
              <span className={pageStyles.eyebrow}>当前对比基线状态</span>
              <strong>{isViewingBaseline ? '这条样本就是你现在的对比基线' : '要不要把这条设成当前对比基线'}</strong>
              <p>
                {isViewingBaseline
                  ? '当前复测结论正在拿这条历史样本做参照，你可以直接去看当前对比。'
                  : currentBaseline
                    ? `你现在的基线是 ${formatTime(currentBaseline.createdAt)} · ${currentBaseline.totalScore ?? '—'} 分。想换成这条的话，直接切过去就行。`
                    : '当前还没有手动切换过基线。把这条设为基线后，系统会立刻按它生成当前对比。'}
              </p>

              <div className={pageStyles.actions}>
                {isViewingBaseline && latestCompletedTaskId ? (
                  <button className={styles.primaryButton} onClick={handleViewCurrentComparison} type="button">
                    查看当前对比
                  </button>
                ) : (
                  <button
                    className={styles.primaryButton}
                    onClick={() => handleUseAsBaseline(selectedHistoryReport.taskId)}
                    type="button"
                  >
                    {latestCompletedTaskId ? '设为当前基线并查看对比' : '设为当前基线'}
                  </button>
                )}
              </div>
            </div>

            {selectedHistoryReport.standardComparison ? (
              <div className={cn(pageStyles.card, styles.sheetCard)}>
                <span className={pageStyles.eyebrow}>那次和标准动作差在哪</span>
                <strong>{selectedHistoryReport.standardComparison.summaryText}</strong>
                <div className={pageStyles.infoList}>
                  {selectedHistoryReport.standardComparison.differences.slice(0, 2).map((item) => (
                    <div key={item} className={pageStyles.listRow}>
                      <span>标准差异</span>
                      <strong>{item}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedHistoryReport.suggestions.length > 1 ? (
              <div className={cn(pageStyles.card, styles.sheetCard)}>
                <span className={pageStyles.eyebrow}>练稳后还可以继续看</span>
                <div className={pageStyles.infoList}>
                  {selectedHistoryReport.suggestions.slice(1).map((item) => (
                    <div key={item.title} className={pageStyles.listRow}>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </BottomSheet>
    </>
  )
}
