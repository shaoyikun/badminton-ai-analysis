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

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>下一次更容易成功的顺序</h2>
          <p className={pageStyles.muted}>先把最可能影响识别结果的前置条件收住，再重新进入主流程。</p>
        </div>
        <div className={pageStyles.infoList}>
          <div className={pageStyles.listRow}>
            <span>第 1 步</span>
            <strong>先处理本次错误里最直接的一项</strong>
            <p>优先看上面的失败原因和恢复建议，不要一口气同时改很多条件。</p>
          </div>
          <div className={pageStyles.listRow}>
            <span>第 2 步</span>
            <strong>回到拍摄或上传准备页重新确认条件</strong>
            <p>动作类型、主体清晰度、时长和机位是最容易直接影响结果的几项。</p>
          </div>
          <div className={pageStyles.listRow}>
            <span>第 3 步</span>
            <strong>重新上传，再让系统重新粗扫和分析</strong>
            <p>当前主链路会按新的输入条件重新判断候选片段和最终报告。</p>
          </div>
        </div>
      </section>

      <BottomCTA
        primary={{ label: actions.primary.label, to: actions.primary.to }}
        secondary={{ label: actions.secondary.label, to: actions.secondary.to, tone: 'secondary' }}
      />
    </div>
  )
}
