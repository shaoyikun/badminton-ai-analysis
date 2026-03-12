import { BottomCTA } from '../../components/ui/BottomCTA'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice } from '../../components/ui/Notice'
import { ScoreBadge } from '../../components/ui/ScoreBadge'
import { StatusPill } from '../../components/ui/StatusPill'
import { StepProgress } from '../../components/ui/StepProgress'

const COLOR_SECTIONS = [
  {
    title: 'Brand',
    items: [
      ['Primary', '#2F6BFF'],
      ['Primary Pressed', '#214FD1'],
      ['Primary Soft', '#EAF0FF'],
    ],
  },
  {
    title: 'Accent',
    items: [
      ['Blue', '#5BB6FF'],
      ['Blue Soft', '#ECF8FF'],
      ['Amber', '#F7B249'],
    ],
  },
  {
    title: 'State',
    items: [
      ['Success', '#1E9E68'],
      ['Warning', '#E8A23A'],
      ['Error', '#D85B52'],
      ['Info', '#2F7CF6'],
    ],
  },
  {
    title: 'Surface',
    items: [
      ['Page', '#F5F8FF'],
      ['Surface', '#FFFFFF'],
      ['Surface Subtle', '#F1F5FF'],
      ['Surface Strong', '#E5ECFB'],
    ],
  },
]

const TYPE_STYLES = [
  ['Heading / XL', '28 / 36', 'Semibold', '上传一段训练视频，看懂这次最该先改什么'],
  ['Heading / L', '24 / 32', 'Semibold', '这次先练这一件事'],
  ['Heading / M', '20 / 28', 'Semibold', '分步骤分析反馈'],
  ['Heading / S', '16 / 24', 'Semibold', '报告摘要'],
  ['Body / L', '16 / 26', 'Regular', '像专业教练一样先给结论，再解释为什么。'],
  ['Body / M', '14 / 22', 'Regular', '本次侧身展开偏慢，会直接影响击球准备空间。'],
  ['Body / S', '13 / 20', 'Regular', '建议 3 到 7 天后保持同机位再次上传。'],
  ['Display / Score / L', '40 / 44', 'Semibold', '76'],
  ['Display / Score / M', '28 / 32', 'Semibold', '+8'],
]

const SPACING_SCALE = ['4', '8', '12', '16', '20', '24', '32']
const STEP_ITEMS = [
  { title: '视频已上传', description: '文件已经入队，系统会先做基础校验。', state: 'done' as const },
  { title: '正在校验与抽帧', description: '读取视频信息并准备关键帧。', state: 'done' as const },
  { title: '正在识别动作特征', description: '根据关键帧识别骨架和动作变化。', state: 'active' as const },
  { title: '正在生成诊断与复测建议', description: '输出结论、问题解释和下次关注点。', state: 'idle' as const },
]

function FoundationsBoard() {
  return (
    <div className="design-board">
      <section className="design-hero">
        <div>
          <span className="eyebrow-copy">Badminton AI Analysis</span>
          <h1>Mobile Design System Foundations</h1>
          <p>更接近当前主流移动端审美的清爽蓝色科技感，用于首页、上传、分析中、报告、历史、复测对比和错误状态页。</p>
        </div>
        <div className="design-keywords">
          {['运动张力', '教练式反馈', '清晰可信', '轻量专注', '科技秩序', '渐进提升', '真实训练感'].map((item) => (
            <span key={item} className="choice-pill active">{item}</span>
          ))}
        </div>
      </section>

      <section className="design-section">
        <div className="section-head">
          <div>
            <h2>Color Tokens</h2>
            <p className="muted-copy">主色切到更轻高级的蓝色，整体保持训练反馈感和可信度，不走后台风。</p>
          </div>
        </div>
        <div className="token-grid">
          {COLOR_SECTIONS.map((section) => (
            <div key={section.title} className="surface-card token-card">
              <strong>{section.title}</strong>
              <div className="token-stack">
                {section.items.map(([label, value]) => (
                  <div key={label} className="color-swatch-row">
                    <span className="color-swatch" style={{ background: value }} />
                    <div>
                      <strong>{label}</strong>
                      <span>{value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="design-section">
        <div className="section-head">
          <div>
            <h2>Typography</h2>
            <p className="muted-copy">标题偏紧凑，正文偏清晰，数字评分使用更有存在感的显示风格。</p>
          </div>
        </div>
        <div className="token-stack">
          {TYPE_STYLES.map(([name, size, weight, sample]) => (
            <div key={name} className="surface-card typography-row">
              <div>
                <span>{name}</span>
                <strong>{size}</strong>
                <p>{weight}</p>
              </div>
              <div className="type-sample">
                <strong>{sample}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="design-section">
        <div className="token-grid two-up">
          <div className="surface-card token-card">
            <strong>Spacing & Grid</strong>
            <div className="spacing-scale">
              {SPACING_SCALE.map((item) => (
                <div key={item} className="spacing-item">
                  <span>{item}</span>
                  <div style={{ width: `${Number(item) * 3}px` }} />
                </div>
              ))}
            </div>
            <p className="muted-copy">基础 4pt，页面边距 16，报告和历史页允许局部 2 列信息卡。</p>
          </div>
          <div className="surface-card token-card">
            <strong>Radius & Shadow</strong>
            <div className="radius-grid">
              <div className="radius-sample radius-sm">12</div>
              <div className="radius-sample radius-md">16</div>
              <div className="radius-sample radius-lg">24</div>
              <div className="radius-sample radius-pill">999</div>
            </div>
            <div className="shadow-samples">
              <div className="shadow-card soft">Soft</div>
              <div className="shadow-card float">Float</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function ComponentsBoard() {
  return (
    <div className="design-board">
      <section className="design-hero">
        <div>
          <span className="eyebrow-copy">Reusable Components</span>
          <h1>Mobile Design System Components</h1>
          <p>所有组件都以移动端 H5 高复用为前提，命名与前端实现保持一致。</p>
        </div>
      </section>

      <section className="design-section">
        <div className="token-grid two-up">
          <div className="surface-card token-card">
            <strong>Buttons</strong>
            <div className="token-stack">
              <button className="primary-action button-reset" type="button">Primary / L</button>
              <button className="secondary-action button-reset" type="button">Secondary / L</button>
              <button className="ghost-action button-reset" type="button">Ghost / M</button>
              <button className="danger-action button-reset" type="button">Danger / L</button>
            </div>
          </div>
          <div className="surface-card token-card">
            <strong>Tags & Status</strong>
            <div className="pill-row">
              <span className="choice-pill active">Action</span>
              <StatusPill label="处理中" tone="progress" />
              <StatusPill label="当前基线" tone="brand" />
              <StatusPill label="已完成" tone="success" />
            </div>
            <div className="pill-row">
              <ScoreBadge label="总分" value="76" tone="good" />
              <ScoreBadge label="变化" value="+8" tone="improve" />
              <ScoreBadge value="待提升" tone="neutral" />
            </div>
          </div>
        </div>
      </section>

      <section className="design-section">
        <div className="token-grid two-up">
          <div className="surface-card token-card">
            <strong>Notice & Toast</strong>
            <div className="token-stack">
              <Notice tone="info" title="上传建议">建议使用 5 到 15 秒、单人、侧后方或正后方机位的视频。</Notice>
              <Notice tone="warning" title="当前还不能提交">请先完成页内确认，并确保时长和动作类型符合要求。</Notice>
              <Notice tone="error" title="处理失败">这次视频没有形成稳定骨架，请回到拍摄指引重新录制。</Notice>
            </div>
          </div>
          <div className="surface-card token-card">
            <strong>Progress</strong>
            <StepProgress steps={STEP_ITEMS} />
          </div>
        </div>
      </section>

      <section className="design-section">
        <div className="token-grid">
          <div className="surface-card report-score-summary-card">
            <span className="eyebrow-copy">总评分卡</span>
            <div className="section-head">
              <div>
                <h2>这次动作已经有基础，但核心短板还没完全收住</h2>
                <p className="muted-copy">总分只是辅助位，先看结论和最该先练的动作点。</p>
              </div>
              <ScoreBadge label="总分" value="76" tone="good" size="l" />
            </div>
          </div>
          <div className="surface-card report-issue-card primary-issue-card">
            <span className="eyebrow-copy">问题项卡片</span>
            <h2>侧身展开不足</h2>
            <p className="body-copy">准备到出手前身体打开得还不够早，会直接压缩击球准备空间。</p>
            <div className="key-point-panel">
              <span>影响</span>
              <p>出球深度和动作稳定性都会受影响，下次复测也更难出现稳定提升。</p>
            </div>
          </div>
          <div className="surface-card report-advice-card training-focus-card">
            <span className="eyebrow-copy">建议项卡片</span>
            <h2>下次练习先做到更早侧身打开</h2>
            <div className="training-outline-grid">
              <div className="key-point-panel">
                <span>为什么做</span>
                <p>先把准备空间打开，后面挥拍和击球点才更容易稳定。</p>
              </div>
              <div className="key-point-panel">
                <span>怎么观察</span>
                <p>下次保持同机位上传，优先看准备到击球前的身体朝向变化。</p>
              </div>
            </div>
          </div>
          <div className="surface-card report-history-compare-card comparison-summary-card">
            <span className="eyebrow-copy">历史对比卡</span>
            <h2>和上一条同动作样本相比，有进步但还没完全稳住</h2>
            <div className="comparison-vs-strip">
              <div>
                <span>当前样本</span>
                <strong>2026/03/12</strong>
              </div>
              <div>
                <span>当前基线</span>
                <strong>2026/03/08</strong>
              </div>
            </div>
            <div className="compare-grid">
              <div className="compare-tile">
                <span>最明显改善</span>
                <strong>准备阶段更早展开</strong>
              </div>
              <div className="compare-tile">
                <span>最该防回落</span>
                <strong>击球前的上举稳定性</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="design-section">
        <div className="token-grid two-up">
          <EmptyState
            badge="Empty State"
            title="你还没有可回看的分析记录"
            description="完成第一次分析后，历史记录会出现在这里，后续就能用来做同动作复测对比。"
            primary={{ label: '开始第一次分析', to: '/guide' }}
            secondary={{ label: '返回首页', to: '/' }}
          />
          <div className="surface-card token-card">
            <strong>Bottom CTA</strong>
            <BottomCTA
              sticky={false}
              primary={{ label: '确认并开始分析' }}
              secondary={{ label: '查看拍摄规范', tone: 'secondary' }}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

export function DesignSystemPage({ variant }: { variant: 'foundations' | 'components' }) {
  return variant === 'foundations' ? <FoundationsBoard /> : <ComponentsBoard />
}
