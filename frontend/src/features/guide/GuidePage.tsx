import { ActionTypeSelector } from '../../components/ui/ActionTypeSelector'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { FlowStepHeader } from '../../components/ui/FlowStepHeader'
import { Notice } from '../../components/ui/Notice'
import { ROUTES } from '../../app/routes'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import pageStyles from '../../styles/PageLayout.module.scss'
import styles from './GuidePage.module.scss'
import { ACTION_GUIDE_COPY, ACTION_SPECIAL_REMINDER_COPY, UPLOAD_CONSTRAINTS } from '../upload/uploadFlow'

export function GuidePage() {
  const { selectedActionLabel, actionType } = useAnalysisTask()
  const actionGuide = ACTION_GUIDE_COPY[actionType]
  const reminder = ACTION_SPECIAL_REMINDER_COPY[actionType]

  return (
    <div className={pageStyles.pageStack}>
      <FlowStepHeader
        badge="上传前必看"
        title="先把拍摄条件拉回到可分析范围"
        description="当前主链路会先粗扫候选片段，再对你确认的那一段做正式分析，所以第一步是先把整套动作拍清楚。"
        steps={[
          { key: 'guide', label: '看拍摄指引', hint: '先把无效上传风险降下来', state: 'current' },
          { key: 'upload', label: '上传准备', hint: '进入正式上传准备页', state: 'upcoming' },
          { key: 'segments', label: '确认片段', hint: '粗扫后再决定分析哪一拍', state: 'upcoming' },
        ]}
      />

      <section className={pageStyles.card}>
        <span className={pageStyles.badge}>当前动作：{selectedActionLabel}</span>
        <div className={pageStyles.sectionHeader}>
          <h2>{actionGuide.title}</h2>
          <p className={pageStyles.muted}>切换动作后，上传约束提示、候选片段解释和历史范围都会一起切换。</p>
        </div>
        <ActionTypeSelector />
        <div className={pageStyles.infoList}>
          {actionGuide.checklist.map((item) => (
            <div key={item} className={pageStyles.listRow}>{item}</div>
          ))}
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>推荐拍摄要求</h2>
        </div>
        <div className={styles.requirementGrid}>
          {UPLOAD_CONSTRAINTS.captureChecklist.map((item) => (
            <div key={item} className={pageStyles.keyItem}>
              <span>要求</span>
              <strong>{item}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>动作专项提醒</h2>
        </div>
        <div className={pageStyles.infoList}>
          <div className={pageStyles.listRow}>
            <strong>{reminder.title}</strong>
            <p>{reminder.description}</p>
          </div>
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>最常见的无效上传</h2>
        </div>
        <div className={styles.errorGrid}>
          <div className={pageStyles.keyItem}>
            <span>问题 1</span>
            <strong>人物太小或被裁切</strong>
            <p>系统很难稳定看到肩、肘、前臂和身体朝向，后面报告可信度会明显下降。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>问题 2</span>
            <strong>多人同框或遮挡明显</strong>
            <p>主体不明确时，系统无法稳定判断动作归属和关键阶段。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>问题 3</span>
            <strong>只拍到击球瞬间</strong>
            <p>没有完整覆盖准备、引拍、击球和收拍，就算能识别，也很难说清你该先改哪一环。</p>
          </div>
        </div>
      </section>

      <Notice tone="warning" title="上传前提醒">
        这次主链路不是“上传就直接出结论”，而是先选片段再分析。视频越完整，候选片段和后面报告都越可靠。
      </Notice>

      <BottomCTA
        primary={{ label: '我已了解，去上传', to: ROUTES.upload }}
        secondary={{ label: '返回首页', to: ROUTES.home, tone: 'secondary' }}
      />
    </div>
  )
}
