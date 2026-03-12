import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { ReportView } from '../../components/result-views/ReportView'
import { getValidBaselineItem } from '../../components/result-views/insights'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'

export function ReportPage() {
  const navigate = useNavigate()
  const {
    report,
    comparison,
    history,
    selectedCompareTaskId,
    analyzeHistoryTrend,
    latestCompletedTaskId,
    isHydratingReport,
    ensureLatestReportLoaded,
  } = useAnalysisTask()

  const baselineItem = getValidBaselineItem(history, selectedCompareTaskId)
  const historyTrend = analyzeHistoryTrend()

  useEffect(() => {
    if (report) return
    if (!latestCompletedTaskId) {
      navigate('/upload', { replace: true })
      return
    }

    void ensureLatestReportLoaded().then((nextReport) => {
      if (!nextReport) navigate('/upload', { replace: true })
    })
  }, [ensureLatestReportLoaded, latestCompletedTaskId, navigate, report])

  if (!report && isHydratingReport) {
    return (
      <div className="page-stack">
        <section className="surface-card skeleton-card">
          <div className="skeleton-line long" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
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
        primary={{ label: '去上传', to: '/upload' }}
        secondary={{ label: '返回首页', to: '/' }}
      />
    )
  }

  return (
    <div className="page-stack">
      <ReportView
        report={report}
        comparison={comparison}
        history={history}
        historyTrend={historyTrend}
        baselineItem={baselineItem}
      />

      <section className="surface-card">
        <div className="section-head">
          <h2>继续动作</h2>
        </div>
        <BottomCTA
          sticky={false}
          primary={{ label: '再次上传', to: '/upload' }}
          secondary={{ label: '去历史里换对比基线', to: '/history', tone: 'secondary' }}
        />
      </section>
    </div>
  )
}
