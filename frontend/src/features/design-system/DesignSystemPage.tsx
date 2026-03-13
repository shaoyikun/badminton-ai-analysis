import type { CSSProperties } from 'react'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { Notice } from '../../components/ui/Notice'
import { ScoreBadge } from '../../components/ui/ScoreBadge'
import { StatusPill } from '../../components/ui/StatusPill'
import { StepProgress } from '../../components/ui/StepProgress'
import pageStyles from '../../styles/PageLayout.module.scss'
import styles from './DesignSystemPage.module.scss'

const COLOR_SECTIONS = [
  ['Brand / Primary', '#2F6BFF'],
  ['Brand / Soft', '#EAF0FF'],
  ['Accent / Blue', '#5BB6FF'],
  ['Surface / Page', '#F5F8FF'],
  ['State / Success', '#1E9E68'],
  ['State / Warning', '#E8A23A'],
  ['State / Error', '#D85B52'],
]

const TYPE_STYLES = [
  ['Heading XL', '28 / 36', 'Semibold', '上传一段训练视频，看懂这次最该先改什么'],
  ['Heading M', '20 / 28', 'Semibold', '这次先练这一件事'],
  ['Body M', '14 / 22', 'Regular', '像专业教练一样先给结论，再解释为什么。'],
  ['Score L', '40 / 44', 'Semibold', '76'],
]

const STEP_ITEMS = [
  { title: '视频已上传', description: '文件已经入队，系统会先做基础校验。', state: 'done' as const },
  { title: '正在校验与抽帧', description: '读取视频信息并准备关键帧。', state: 'done' as const },
  { title: '正在识别动作特征', description: '根据关键帧识别骨架和动作变化。', state: 'active' as const },
  { title: '正在生成诊断与复测建议', description: '输出结论、问题解释和下次关注点。', state: 'idle' as const },
]

function FoundationsBoard() {
  return (
    <div className={pageStyles.pageStack}>
      <section className={pageStyles.heroCard}>
        <span className={pageStyles.badge}>Design System</span>
        <h1>Mobile Design Foundations</h1>
        <p>当前 H5 视觉采用清爽蓝色运动科技感，强调教练式结论、可信反馈和移动端单列节奏。</p>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>Color Tokens</h2>
          <p className={pageStyles.muted}>保留统一 token 源，页面只消费变量，不再写散乱全局颜色。</p>
        </div>
        <div className={styles.tokenGrid}>
          {COLOR_SECTIONS.map(([label, value]) => (
            <div key={label} className={styles.tokenCard}>
              <span className={styles.swatch} style={{ '--swatch-color': value } as CSSProperties} />
              <div>
                <strong>{label}</strong>
                <p>{value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>Typography</h2>
        </div>
        <div className={styles.typeStack}>
          {TYPE_STYLES.map(([label, spec, weight, sample]) => (
            <div key={label} className={styles.typeRow}>
              <div>
                <strong>{label}</strong>
                <p>{spec} · {weight}</p>
              </div>
              <span>{sample}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function ComponentsBoard() {
  return (
    <div className={pageStyles.pageStack}>
      <section className={pageStyles.heroCard}>
        <span className={pageStyles.badge}>Reusable Components</span>
        <h1>Component Recipes</h1>
        <p>组件库只承接交互原件。品牌视觉、信息层级、Hero 卡片和报告叙事仍然由自研页面负责。</p>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>Buttons & Status</h2>
        </div>
        <div className={styles.componentGrid}>
          <BottomCTA
            sticky={false}
            primary={{ label: 'Primary CTA', onClick: () => undefined }}
            secondary={{ label: 'Secondary CTA', onClick: () => undefined, tone: 'secondary' }}
          />
          <div className={styles.inlineWrap}>
            <StatusPill label="处理中" tone="progress" />
            <StatusPill label="当前基线" tone="brand" />
            <StatusPill label="已完成" tone="success" />
            <ScoreBadge label="总分" tone="good" value="76" />
            <ScoreBadge label="变化" tone="improve" value="+8" />
          </div>
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>Notice & Progress</h2>
        </div>
        <Notice tone="info" title="上传建议">建议使用 5 到 15 秒、单人、侧后方或正后方机位的视频。</Notice>
        <Notice tone="warning" title="当前还不能提交">请先完成页内确认，并确保时长和动作类型符合要求。</Notice>
        <StepProgress steps={STEP_ITEMS} />
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>页面叙事规范</h2>
        </div>
        <div className={pageStyles.infoList}>
          <div className={pageStyles.listRow}>
            <span>报告页</span>
            <strong>{'Hero 结论 -> 先练什么 -> 当前复测结论 -> 其余问题 -> 深层证据'}</strong>
          </div>
          <div className={pageStyles.listRow}>
            <span>上传页</span>
            <strong>先确认输入条件，再确认粗扫候选片段</strong>
          </div>
          <div className={pageStyles.listRow}>
            <span>组件库边界</span>
            <strong>Ant Design Mobile 只作为交互原件提供者，不接管视觉系统</strong>
          </div>
        </div>
      </section>
    </div>
  )
}

export function DesignSystemPage({ variant }: { variant: 'foundations' | 'components' }) {
  return variant === 'components' ? <ComponentsBoard /> : <FoundationsBoard />
}
