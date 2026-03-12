import { BottomCTA } from '../../components/ui/BottomCTA'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice } from '../../components/ui/Notice'
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

      <Notice tone="error" title="为什么要先处理这个问题">
        这不是模型坏掉，而是当前视频条件已经影响到动作判断可信度。先把拍摄条件拉回到可分析范围，后面的结论才更可靠。
      </Notice>

      <BottomCTA
        primary={{ label: actions.primary.label, to: actions.primary.to }}
        secondary={{ label: actions.secondary.label, to: actions.secondary.to, tone: 'secondary' }}
      />
    </div>
  )
}
