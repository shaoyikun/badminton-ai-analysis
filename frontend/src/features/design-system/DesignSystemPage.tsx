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
  ['Brand / Deep', '#12387A'],
  ['Brand / Soft', '#EAF0FF'],
  ['Accent / Sky', '#8FD5FF'],
  ['Accent / Amber', '#F7B249'],
  ['Surface / Page', '#F2F6FF'],
  ['Surface / Contrast', '#DFE9FB'],
  ['State / Success', '#1E9E68'],
  ['State / Warning', '#E8A23A'],
  ['State / Error', '#D85B52'],
]

const TYPE_STYLES = [
  ['Heading XL', '30 / 38', 'Semibold', '上传一段训练视频，看懂这次最该先改什么'],
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
        <p>当前 H5 视觉采用专业教练蓝主轴，把运动张力、可信反馈和移动端任务节奏压进同一套页面语言里。</p>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>Color Tokens</h2>
          <p className={pageStyles.muted}>保留统一 token 源，用深教练蓝、浅训练面和琥珀强调去区分结论、过程和提醒。</p>
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
          <p className={pageStyles.muted}>不额外引入在线字体，用系统中文字体栈和更强的标题、数字层级表达训练感。</p>
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
      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>Page Principles</h2>
        </div>
        <div className={pageStyles.infoList}>
          <div className={pageStyles.listRow}>
            <span>首页 / 上传</span>
            <strong>先交代当前任务，再给主操作，不把说明文案堆在 CTA 前面。</strong>
          </div>
          <div className={pageStyles.listRow}>
            <span>报告 / 对比</span>
            <strong>一句话结论先于细节证据，分数只做辅助，不抢训练重点。</strong>
          </div>
          <div className={pageStyles.listRow}>
            <span>历史 / 错误</span>
            <strong>明确“现在和谁比”与“下一步做什么”，避免像调试状态页。</strong>
          </div>
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
        <p>组件库只承接交互原件。品牌视觉、信息层级、Hero 卡片和训练结论叙事仍然由自研页面负责。</p>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>Buttons & Status</h2>
          <p className={pageStyles.muted}>主按钮强调训练动作推进，状态元件负责告诉用户当前进度、基线和变化。</p>
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
          <p className={pageStyles.muted}>提醒卡和步骤反馈不抢主结论，但必须把风险、等待感和下一步说清楚。</p>
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
