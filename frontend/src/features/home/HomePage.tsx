import { Link } from 'react-router-dom'
import { ActionTypeSelector } from '../../components/ui/ActionTypeSelector'
import { ROUTES } from '../../app/routes'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import pageStyles from '../../styles/PageLayout.module.scss'
import styles from './HomePage.module.scss'

export function HomePage() {
  const { actionType, selectedActionLabel, latestCompletedTaskId } = useAnalysisTask()
  const actionDescription = actionType === 'smash'
    ? '当前已正式开放杀球分析，后面的拍摄指引、上传确认和历史记录都会围绕杀球动作展开。'
    : '当前已正式开放正手高远球分析，后面的拍摄指引、上传确认和历史记录都会围绕这一动作展开。'

  return (
    <div className={pageStyles.pageStack}>
      <section className={pageStyles.heroCard}>
        <span className={pageStyles.badge}>移动端两步式分析</span>
        <h1>上传一段羽毛球视频，先选对片段，再看懂这次最该先改什么</h1>
        <p>
          系统会先在整段视频里粗扫候选挥拍片段，再由你确认真正要进入精分析的一段，
          最后输出一句话结论、核心问题和复测建议。
        </p>
        <div className={styles.heroMeta}>
          <div className={pageStyles.keyItem}>
            <span>当前动作</span>
            <strong>{selectedActionLabel}</strong>
            <p>后续拍摄指引、上传规则、报告叙事和历史范围都会跟着这个动作切换。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>分析方式</span>
            <strong>先粗扫，再精分析</strong>
            <p>不再默认整段视频直接进最终分析，先把“分析哪一拍”这件事说清楚。</p>
          </div>
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>当前正式支持的动作</h2>
          <p className={pageStyles.muted}>{actionDescription}</p>
        </div>
        <ActionTypeSelector />
      </section>

      <section className={pageStyles.card}>
        <span className={pageStyles.eyebrow}>How It Works</span>
        <div className={pageStyles.sectionHeader}>
          <h2>一次完整分析现在分成 3 个清晰步骤</h2>
        </div>
        <div className={styles.stepGrid}>
          <div className={pageStyles.keyItem}>
            <span>Step 1</span>
            <strong>先拍完整动作</strong>
            <p>按拍摄指引录一段 5 到 15 秒、单人、机位稳定的视频，尽量完整覆盖准备到收拍。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>Step 2</span>
            <strong>上传后先确认片段</strong>
            <p>系统会先粗扫整段视频，并把最像完整挥拍的候选片段推荐给你。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>Step 3</span>
            <strong>再看结论和复测重点</strong>
            <p>报告会先给一句话结论，再告诉你这次最该先练什么、下次复测只盯什么。</p>
          </div>
        </div>
      </section>

      <section className={pageStyles.card}>
        <span className={pageStyles.eyebrow}>Why Retest</span>
        <div className={pageStyles.sectionHeader}>
          <h2>每次分析都不是重新开始</h2>
        </div>
        <p className={pageStyles.muted}>
          每次上传都会沉淀为你的训练样本。后面不只看“这次好不好”，还会拿它和上一次、历史基线做对比，
          帮你判断训练方向有没有真的起作用。
        </p>
        <div className={styles.secondaryMeta}>
          <div className={pageStyles.keyItem}>
            <span>最近可查看报告</span>
            <strong>{latestCompletedTaskId ? '已准备好' : '还没有'}</strong>
            <p>{latestCompletedTaskId ? '底部报告入口已解锁，可以随时回看最近一次结果。' : '完成第一次分析后，报告入口会自动解锁。'}</p>
          </div>
        </div>
      </section>

      <div className={pageStyles.actions}>
        <Link className={styles.primaryAction} to={ROUTES.guide}>开始分析{selectedActionLabel}</Link>
        <Link className={styles.secondaryAction} to={ROUTES.history}>查看历史记录</Link>
      </div>
    </div>
  )
}
