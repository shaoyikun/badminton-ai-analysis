import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState'
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
    <div className="page-stack">
      <ReportView report={report} />

      <section className="surface-card">
        <div className="section-head">
          <h2>继续动作</h2>
        </div>
        <div className="action-stack">
          <Link className="primary-action" to="/upload">再次上传</Link>
          <Link className="secondary-action" to="/history">查看历史记录</Link>
          {comparison ? <Link className="secondary-action" to="/compare">查看复测对比</Link> : null}
        </div>
      </section>
    </div>
  )
}
