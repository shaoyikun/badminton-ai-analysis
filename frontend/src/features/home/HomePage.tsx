import { Link } from 'react-router-dom'
import { ActionTypeSelector } from '../../components/ui/ActionTypeSelector'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { ROUTES } from '../../app/routes'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import pageStyles from '../../styles/PageLayout.module.scss'
import styles from './HomePage.module.scss'

export function HomePage() {
  const { actionType, selectedActionLabel, latestCompletedTaskId } = useAnalysisTask()
  const actionDescription = actionType === 'smash'
    ? '当前已正式开放杀球分析，后面的拍摄指引、上传准备和历史记录都会围绕杀球动作展开。'
    : '当前已正式开放正手高远球分析，后面的拍摄指引、上传准备和历史记录都会围绕这一动作展开。'

  return (
    <div className={pageStyles.pageStack}>
      <section className={pageStyles.heroCard}>
        <span className={pageStyles.badge}>正式训练分析</span>
        <h1>先上传一段完整挥拍视频，再得到可复测的动作结论</h1>
        <p>
          整个流程已经收敛成正式移动端步骤：先做上传准备，再单独确认分析片段，最后查看这次最该先练什么。
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
          <h2>当前要分析哪一种动作</h2>
          <p className={pageStyles.muted}>{actionDescription}</p>
        </div>
        <ActionTypeSelector />
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>现在的主流程只保留 3 步</h2>
          <p className={pageStyles.muted}>每一步只负责一件事，不再把上传、选片和微调长期堆在同一页。</p>
        </div>
        <div className={styles.stepGrid}>
          <div className={pageStyles.keyItem}>
            <span>第 1 步</span>
            <strong>上传准备</strong>
            <p>先确认动作、拍摄条件和视频基础信息，再提交粗扫。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>第 2 步</span>
            <strong>确认片段</strong>
            <p>粗扫后单独确认本次真正要进入精分析的挥拍片段。</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>第 3 步</span>
            <strong>查看报告</strong>
            <p>先看一句话结论，再决定下次只先练什么、复测时盯什么。</p>
          </div>
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>训练记录会持续沉淀</h2>
        </div>
        <div className={styles.secondaryMeta}>
          <div className={pageStyles.keyItem}>
            <span>最近可查看报告</span>
            <strong>{latestCompletedTaskId ? '已准备好' : '还没有'}</strong>
            <p>{latestCompletedTaskId ? '底部报告入口已解锁，可以随时回看最近一次结果。' : '完成第一次分析后，报告入口会自动解锁。'}</p>
          </div>
          <Link className={styles.inlineHistoryCard} to={ROUTES.history}>
            <span>历史 / 记录</span>
            <strong>查看同动作训练样本</strong>
            <p>历史页会集中承接基线切换、复测对比和样本回看。</p>
          </Link>
        </div>
      </section>

      <BottomCTA primary={{ label: `开始分析${selectedActionLabel}`, to: ROUTES.guide }} />
    </div>
  )
}
