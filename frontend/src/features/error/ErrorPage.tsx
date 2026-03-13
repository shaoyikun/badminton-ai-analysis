import { BottomCTA } from '../../components/ui/BottomCTA'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice } from '../../components/ui/Notice'
import { ROUTES } from '../../app/routes'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import { getErrorRouteAction } from '../upload/uploadFlow'
import pageStyles from '../../styles/PageLayout.module.scss'
import styles from './ErrorPage.module.scss'

export function ErrorPage() {
  const { errorState } = useAnalysisTask()

  if (!errorState) {
    return (
      <EmptyState
        badge="无错误上下文"
        title="当前没有需要处理的异常"
        description="你可以直接回到上传页重新开始一次分析。"
        primary={{ label: '去上传', to: ROUTES.upload }}
        secondary={{ label: '返回首页', to: ROUTES.home }}
      />
    )
  }

  const actions = {
    primary: getErrorRouteAction(errorState.primaryAction),
    secondary: getErrorRouteAction(errorState.secondaryAction),
  }

  return (
    <div className={pageStyles.pageStack}>
      <section className={pageStyles.heroCard}>
        <span className={pageStyles.badgeWarning}>处理失败</span>
        <h1>{errorState.title}</h1>
        <p>{errorState.summary}</p>
      </section>

      <Notice tone="error" title="为什么要先处理这个问题">
        {errorState.explanation}
      </Notice>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>恢复建议</h2>
        </div>
        <div className={pageStyles.infoList}>
          {errorState.suggestions.map((suggestion) => (
            <div key={suggestion} className={pageStyles.listRow}>{suggestion}</div>
          ))}
        </div>
        <div className={styles.actionHint}>
          <strong>主操作只保留一个：</strong>
          <p>{actions.primary.label}</p>
        </div>
      </section>

      <BottomCTA
        primary={{ label: actions.primary.label, to: actions.primary.to }}
        secondary={{ label: actions.secondary.label, to: actions.secondary.to, tone: 'secondary' }}
      />
    </div>
  )
}
