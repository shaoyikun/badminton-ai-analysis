import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { ReportView } from '../../components/result-views/ReportView'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'

export function ReportPage() {
  const navigate = useNavigate()
  const {
    report,
    comparison,
    latestCompletedTaskId,
    isHydratingReport,
    ensureLatestReportLoaded,
  } = useAnalysisTask()

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
    <div className="page-stack report-page-stack">
      <ReportView report={report} comparison={comparison} />

      <section className="surface-card report-cta-shell">
        <div className="section-head">
          <div>
            <h2>准备好了就回来测一次</h2>
            <p className="muted-copy">练完当前重点，再来复测或回看历史，最容易判断你的训练方向有没有起作用。</p>
          </div>
        </div>
        <BottomCTA
          sticky={false}
          primary={{ label: '再次测试', to: '/upload' }}
          secondary={{ label: '查看历史', to: '/history', tone: 'secondary' }}
        />
      </section>
    </div>
  )
}
