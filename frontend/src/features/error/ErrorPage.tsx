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

  const actions = getErrorRouteActions(errorState.errorCode)

  return (
    <div className="page-stack">
      <section className="surface-card error-card">
        <span className="badge warning">处理失败</span>
        <h2>{errorState.title}</h2>
        <p>{errorState.message}</p>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>建议你这样处理</h2>
        </div>
        <div className="info-list compact">
          <div className="list-row">只保留一个主体重新拍摄，尽量保证全身完整入镜</div>
          <div className="list-row">优先使用侧后方或正后方机位，减少遮挡和逆光</div>
          <div className="list-row">控制在 5~15 秒，并保留准备、击球和收拍完整过程</div>
        </div>
      </section>

      <div className="action-stack">
        <Link className="primary-action" to={actions.primary.to}>{actions.primary.label}</Link>
        <Link className="secondary-action" to={actions.secondary.to}>{actions.secondary.label}</Link>
      </div>
    </div>
  )
}
