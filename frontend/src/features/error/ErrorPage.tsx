import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState'
import { getErrorRouteActions, useAnalysisTask } from '../../hooks/useAnalysisTask'

export function ErrorPage() {
  const { errorState } = useAnalysisTask()

  if (!errorState) {
    return (
      <EmptyState
        badge="无错误上下文"
        title="当前没有需要处理的异常"
        description="你可以直接回到上传页重新开始一次分析。"
        primary={{ label: '去上传', to: '/upload' }}
        secondary={{ label: '返回首页', to: '/' }}
      />
    )
  }

  const actions = getErrorRouteActions(errorState)

  return (
    <div className="page-stack">
      <section className="surface-card error-card">
        <span className="badge warning">处理失败</span>
        <h2>{errorState.title}</h2>
        <p>{errorState.summary}</p>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>发生了什么</h2>
        </div>
        <p>{errorState.explanation}</p>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>这次建议这样处理</h2>
        </div>
        <div className="info-list compact">
          {errorState.suggestions.map((suggestion) => (
            <div key={suggestion} className="list-row">{suggestion}</div>
          ))}
        </div>
      </section>

      <div className="action-stack">
        <Link className="primary-action" to={actions.primary.to}>{actions.primary.label}</Link>
        <Link className="secondary-action" to={actions.secondary.to}>{actions.secondary.label}</Link>
      </div>
    </div>
  )
}
