import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { PoseResult, TaskHistoryItem, RetestComparison, ReportResult } from '../../hooks/useAnalysisTask'
import { ScoreBadge } from '../ui/ScoreBadge'
import {
  getActionTypeLabel,
  getBestDimension,
  getComparisonChangeLabel,
  getComparisonRiskLabel,
  getComparisonTrendLabel,
  getDimensionStatus,
  getReportLevel,
  getTrainingFocus,
} from './insights'
import { buildAssetUrl, buildReferenceUrl, formatScore, formatTime } from './utils'

export function PoseSummaryCard({ poseResult }: { poseResult: PoseResult | null }) {
  if (!poseResult) return null

  return (
    <div className="surface-card inset">
      <div className="section-head">
        <h2>姿态摘要</h2>
      </div>
      <p>{poseResult.summary.humanSummary}</p>
      <div className="score-grid three-up">
        <div className="score-tile"><span>识别引擎</span><strong>{poseResult.engine}</strong></div>
        <div className="score-tile"><span>稳定帧数</span><strong>{poseResult.summary.usableFrameCount} / {poseResult.frameCount}</strong></div>
        <div className="score-tile"><span>最佳帧</span><strong>{poseResult.summary.bestFrameIndex ?? '—'}</strong></div>
        <div className="score-tile"><span>覆盖率</span><strong>{formatScore(poseResult.summary.coverageRatio)}</strong></div>
        <div className="score-tile"><span>稳定度中位</span><strong>{formatScore(poseResult.summary.medianStabilityScore)}</strong></div>
        <div className="score-tile"><span>侧身展开</span><strong>{formatScore(poseResult.summary.medianBodyTurnScore)}</strong></div>
        <div className="score-tile"><span>挥拍臂上举</span><strong>{formatScore(poseResult.summary.medianRacketArmLiftScore)}</strong></div>
        <div className="score-tile"><span>波动度</span><strong>{formatScore(poseResult.summary.scoreVariance)}</strong></div>
      </div>
      {poseResult.summary.rejectionReasons.length > 0 ? (
        <p className="muted-copy">拒绝原因：{poseResult.summary.rejectionReasons.join(' / ')}</p>
      ) : null}
    </div>
  )
}

export function ReportHeroCard({ report, comparison }: { report: ReportResult; comparison: RetestComparison | null }) {
  const level = getReportLevel(report.totalScore)
  const bestDimension = getBestDimension(report)
  const heroStatus = comparison
    ? comparison.totalScoreDelta > 0
      ? {
          label: '正在进步',
          tone: 'positive',
          detail: `较上一条同动作样本提升 ${comparison.totalScoreDelta} 分`,
        }
      : comparison.totalScoreDelta < 0
        ? {
            label: '先稳住基础动作',
            tone: 'caution',
            detail: `较上一条同动作样本回落 ${Math.abs(comparison.totalScoreDelta)} 分`,
          }
        : {
            label: '动作正在稳定',
            tone: 'steady',
            detail: '和上一条同动作样本整体接近',
          }
    : {
        label: level.tone === 'positive' ? '动作在变稳' : level.tone === 'steady' ? '继续往前走' : '先收住主动作',
        tone: level.tone,
        detail: '等你完成下一次复测，这里会直接告诉你训练方向有没有起作用。',
      }

  return (
    <section className="hero-panel result-hero-card report-conclusion-card">
      <div className="report-hero-top">
        <span className="badge badge-inverse">{getActionTypeLabel(report.actionType)}</span>
        <span className={`report-status-pill ${heroStatus.tone}`}>{heroStatus.label}</span>
      </div>
      <span className="eyebrow-copy hero-eyebrow">本次结论</span>
      <h1>{report.summaryText ?? '这次报告已经生成，先看当前最关键的问题和下一步训练方向。'}</h1>
      <p className="hero-support-copy">{level.summary}</p>

      <div className="hero-summary-grid">
        <div className="hero-score-card report-score-summary-card">
          <span>总评分</span>
          <ScoreBadge label="总分" value={report.totalScore} tone="good" size="l" />
          <p>总分只是辅助位，先把这次最该改的一件事练稳。</p>
        </div>
        <div className="hero-overview-stack">
          <div className="hero-overview-item">
            <span>动作等级</span>
            <strong>{level.label}</strong>
            <p>先用等级帮你判断目前处在哪个阶段，再决定训练节奏。</p>
          </div>
          <div className="hero-overview-item">
            <span>当前最好的一项</span>
            <strong>{bestDimension ? bestDimension.name : '先看核心建议'}</strong>
            <p>{bestDimension ? `${bestDimension.score} 分，说明这一块已经有基础。` : '当前先把最重要的一项动作建议练稳。'} </p>
          </div>
          <div className="hero-overview-item">
            <span>{comparison ? '当前复测状态' : '表现概览'}</span>
            <strong>{comparison ? getComparisonTrendLabel(comparison.totalScoreDelta) : heroStatus.label}</strong>
            <p>
              {comparison
                ? `当前样本会和 ${formatTime(comparison.previousCreatedAt)} 这条历史基线对照。`
                : heroStatus.detail}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function PrimaryIssueCard({ report }: { report: ReportResult }) {
  const primaryIssue = report.issues[0]
  if (!primaryIssue) return null

  return (
    <section className="surface-card primary-issue-card report-issue-card">
      <span className="eyebrow-copy">这次最该先看的问题</span>
      <h2>{primaryIssue.title}</h2>
      <p className="body-copy">{primaryIssue.description}</p>
      <div className="key-point-panel">
        <span>为什么这件事要先改</span>
        <p>{primaryIssue.impact}</p>
      </div>
    </section>
  )
}

export function TrainingFocusCard({ report }: { report: ReportResult }) {
  const focus = getTrainingFocus(report)

  return (
    <section className="surface-card training-focus-card report-advice-card">
      <div className="training-focus-header">
        <div>
          <span className="eyebrow-copy">这次先练这一件事</span>
          <h2>{focus.primaryTitle}</h2>
        </div>
        <span className="focus-lock-pill">先改这一项</span>
      </div>

      <div className="focus-lead-panel">
        <strong>{focus.primaryDescription}</strong>
        <p>{focus.impact}</p>
      </div>

      <div className="training-outline-grid training-focus-grid">
        <div className="focus-support-card">
          <span>下次练习先做到</span>
          <strong>{focus.actionTitle}</strong>
          <p>{focus.actionDescription}</p>
        </div>
        <div className="focus-support-card">
          <span>下次复测怎么看算在变好</span>
          <strong>只盯这个变化</strong>
          <p>{focus.checkDescription}</p>
        </div>
      </div>

      {focus.supportingSuggestions.length > 0 ? (
        <div className="info-list compact supporting-note-list">
          {focus.supportingSuggestions.map((item) => (
            <div key={item.title} className="list-row">
              <span>练稳这一件事后，再继续看</span>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function IssueBreakdownSection({ report }: { report: ReportResult }) {
  const issueCards = report.issues.slice(0, 3)

  if (issueCards.length < 2) {
    issueCards.push({
      title: '先别同时改太多点',
      description: '这次最值得先盯的是上面那一个核心问题，先把这一项动作练顺，再看其他维度会不会一起被带起来。',
      impact: '这样更容易在下一次复测里看到明确变化，也更不容易把动作练散。',
    })
  }

  return (
    <section className="surface-card issue-breakdown-section">
      <div className="section-head">
        <div>
          <h2>动作问题拆解</h2>
          <p className="muted-copy">只拆你这次最关键的几个点，每一项都尽量说到能练、能理解。</p>
        </div>
      </div>

      <div className="issue-breakdown-grid">
        {issueCards.map((item, index) => (
          <div key={`${item.title}-${index + 1}`} className="issue-digest-card">
            <span className="issue-rank-badge">{`0${index + 1}`}</span>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
            <div className="issue-impact-note">
              <span>为什么要在意</span>
              <p>{item.impact}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function DimensionScoreSection({ report }: { report: ReportResult }) {
  return (
    <section className="surface-card dimension-score-section">
      <div className="section-head">
        <div>
          <h2>分维度评分</h2>
          <p className="muted-copy">不用复杂图表，只用来帮你快速判断哪一项更稳、哪一项该先收。</p>
        </div>
      </div>

      <div className="dimension-score-list">
        {report.dimensionScores.map((item) => {
          const status = getDimensionStatus(item.score)
          const scoreStyle = { '--score-width': `${Math.max(item.score, 8)}%` } as CSSProperties

          return (
            <div key={item.name} className={`dimension-score-row ${status.tone}`} style={scoreStyle}>
              <div className="dimension-score-main">
                <div>
                  <strong>{item.name}</strong>
                </div>
                <div className="dimension-score-meta">
                  <span className={`dimension-state-pill ${status.tone}`}>{status.label}</span>
                  <strong>{item.score}</strong>
                </div>
              </div>
              <div className="dimension-score-track">
                <div className="dimension-score-fill" />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function HistoryCard({ history, selectedCompareTaskId, onSelectCompare, onOpenHistoryDetail, disabled }: { history: TaskHistoryItem[]; selectedCompareTaskId: string; onSelectCompare: (taskId: string) => void; onOpenHistoryDetail?: (taskId: string) => void; disabled?: boolean }) {
  return (
    <div className="surface-card">
      <div className="section-head">
        <h2>历史记录与复测入口</h2>
      </div>
      {history.length === 0 ? (
        <p>你现在还没有同动作历史样本。等完成下一条上传后，这里就会变成你的复测入口。</p>
      ) : (
        <>
          <div className="surface-card inset">
            <span className="eyebrow-copy">为什么还要再拍一条</span>
            <strong>{`你已经有 ${history.length} 条同动作历史样本`}</strong>
            <p>后面每次新上传，不只是看这次做得怎样，更是看核心问题有没有收住、动作变化是不是稳定下来。</p>
          </div>
          <div className="field-stack">
            <label>选择一个历史样本做对比基线</label>
            <select className="form-select" value={selectedCompareTaskId} onChange={(e) => onSelectCompare(e.target.value)} disabled={disabled}>
              <option value="">请选择历史样本</option>
              {history.slice(0, 10).map((item) => (
                <option key={item.taskId} value={item.taskId}>
                  {formatTime(item.createdAt)} · {item.totalScore ?? '—'} 分
                </option>
              ))}
            </select>
          </div>
          <div className="info-list compact">
            {history.slice(0, 5).map((item) => (
              <div key={item.taskId} className="list-row">
                <span>{formatTime(item.createdAt)}</span>
                <strong>{item.totalScore ?? '—'} 分</strong>
                <p>{item.summaryText ?? `${getActionTypeLabel(item.actionType)} 已完成分析`}</p>
                {onOpenHistoryDetail ? <button className="ghost-action inline" onClick={() => onOpenHistoryDetail(item.taskId)} disabled={disabled} type="button">查看这次详情</button> : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function ComparisonHighlightCard({ comparison }: { comparison: RetestComparison | null }) {
  if (!comparison) return null

  return (
    <section className="surface-card comparison-highlight-card report-history-compare-card">
      <span className="eyebrow-copy">最近一次复测结论</span>
      <h2>{getComparisonTrendLabel(comparison.totalScoreDelta)}</h2>
      <p className="body-copy">{comparison.coachReview.headline}</p>

      <div className="comparison-vs-strip">
        <div>
          <span>当前样本</span>
          <strong>{formatTime(comparison.currentCreatedAt)}</strong>
        </div>
        <div>
          <span>当前基线</span>
          <strong>{formatTime(comparison.previousCreatedAt)}</strong>
        </div>
        <div>
          <span>参考分数变化</span>
          <strong>{comparison.totalScoreDelta > 0 ? `+${comparison.totalScoreDelta}` : comparison.totalScoreDelta}</strong>
        </div>
      </div>

      <div className="compare-grid">
        <div className="compare-tile">
          <span>这次最明显在变好的地方</span>
          <strong>{getComparisonChangeLabel(comparison)}</strong>
          <p>{comparison.coachReview.progressNote}</p>
        </div>
        <div className="compare-tile">
          <span>这次最该防止回落的点</span>
          <strong>{getComparisonRiskLabel(comparison)}</strong>
          <p>{comparison.coachReview.regressionNote ?? comparison.coachReview.keepDoing ?? '这次没有明显回落项，先把已经稳住的部分继续保住。'}</p>
        </div>
      </div>

      <div className="coach-note">
        <strong>下一次只先盯这个</strong>
        <p>{comparison.coachReview.nextFocus}</p>
        <p>{comparison.coachReview.nextCheck}</p>
      </div>

      <div className="action-stack">
        <Link className="secondary-action" to="/compare">查看完整复测对比</Link>
      </div>
    </section>
  )
}

export function ComparisonCard({ comparison }: { comparison: RetestComparison | null }) {
  if (!comparison) {
    return (
      <div className="surface-card">
        <div className="section-head">
          <h2>复测对比</h2>
        </div>
        <p>当前还没有可对比的同动作样本。等你再录一条，或者从历史记录里手动选一条样本后，就能看到变化结论。</p>
      </div>
    )
  }

  return (
    <section className="surface-card comparison-summary-card report-history-compare-card">
      <span className="eyebrow-copy">复测结论</span>
      <h2>{getComparisonTrendLabel(comparison.totalScoreDelta)}</h2>
      <p className="body-copy">{comparison.coachReview.headline}</p>

      <div className="comparison-vs-strip">
        <div>
          <span>当前样本</span>
          <strong>{formatTime(comparison.currentCreatedAt)}</strong>
        </div>
        <div>
          <span>当前基线</span>
          <strong>{formatTime(comparison.previousCreatedAt)}</strong>
        </div>
        <div>
          <span>参考分数变化</span>
          <strong>{comparison.totalScoreDelta > 0 ? `+${comparison.totalScoreDelta}` : comparison.totalScoreDelta}</strong>
        </div>
      </div>

      <div className="compare-grid">
        <div className="compare-tile">
          <span>这次最明显在变好的地方</span>
          <strong>{getComparisonChangeLabel(comparison)}</strong>
          <p>{comparison.coachReview.progressNote}</p>
        </div>
        <div className="compare-tile">
          <span>现在最该防止继续回落的点</span>
          <strong>{getComparisonRiskLabel(comparison)}</strong>
          <p>{comparison.coachReview.regressionNote ?? comparison.coachReview.keepDoing ?? '这次没有明显回落项，先把已经稳住的部分继续保住。'}</p>
        </div>
      </div>

      <div className="coach-note">
        <strong>下一次只先盯这个</strong>
        <p>{comparison.coachReview.nextFocus}</p>
        <p>{comparison.coachReview.nextCheck}</p>
      </div>

      {comparison.summaryText ? (
        <div className="key-point-panel">
          <span>补充说明</span>
          <p>{comparison.summaryText}</p>
        </div>
      ) : null}
    </section>
  )
}

export function ReportHistoryBridgeCard({
  historyCount,
  historyTrend,
  baselineItem,
  comparison,
}: {
  historyCount: number
  historyTrend: string
  baselineItem: TaskHistoryItem | null
  comparison: RetestComparison | null
}) {
  return (
    <section className="surface-card report-history-bridge-card">
      <div className="section-head">
        <div>
          <h2>历史与当前对比基线</h2>
          <p className="muted-copy">别只看这次结果，也要知道现在是在和哪一次的自己比较。</p>
        </div>
      </div>

      <div className="summary-inline-grid">
        <div className="key-point-panel">
          <span>同动作历史</span>
          <strong>{historyCount === 0 ? '还没有可回看的样本' : `已有 ${historyCount} 条样本`}</strong>
          <p>{historyTrend}</p>
        </div>
        <div className="key-point-panel">
          <span>当前对比基线</span>
          <strong>{baselineItem ? `${formatTime(baselineItem.createdAt)} · ${baselineItem.totalScore ?? '—'} 分` : '默认对比上一条同动作样本'}</strong>
          <p>
            {baselineItem
              ? baselineItem.summaryText ?? '当前复测会拿这条历史样本做参照。'
              : comparison
                ? `当前系统正在对比 ${formatTime(comparison.previousCreatedAt)} 这条历史样本。`
                : '先去历史记录回看旧样本，想换基线时也从那里切。'}
          </p>
        </div>
      </div>

      <div className="action-stack">
        <Link className="primary-action" to="/history">查看历史并切换基线</Link>
        {comparison ? <Link className="secondary-action" to="/compare">查看完整复测对比</Link> : null}
      </div>
    </section>
  )
}

export function StandardComparisonCard({ report }: { report: ReportResult }) {
  if (!report.standardComparison) return null
  const bestFrameIndex = report.scoringEvidence?.bestFrameIndex
  const bestFrame = report.preprocess?.artifacts?.sampledFrames?.find((item) => item.index === bestFrameIndex)
    ?? report.preprocess?.artifacts?.sampledFrames?.[0]
  const focusDifferences = report.standardComparison.differences.slice(0, 3)

  return (
    <section className="surface-card standard-review-card">
      <div className="section-head">
        <div>
          <h2>{report.standardComparison.sectionTitle}</h2>
          <p className="muted-copy">这一块不只是看像不像，而是看当前动作离目标动作还差在哪。</p>
        </div>
      </div>
      <div className="coach-note standard-summary-note">
        <strong>教练会先看什么</strong>
        <p>{report.standardComparison.summaryText}</p>
      </div>
      <div className="media-compare-grid standard-media-grid">
        <div className="standard-frame-placeholder compare-frame-card">
          <span className="frame-badge">你的当前样本</span>
          {bestFrame?.relativePath ? <img src={buildAssetUrl(bestFrame.relativePath)} alt={report.standardComparison.currentFrameLabel} /> : <div className="placeholder-box">当前样本</div>}
          <strong>{report.standardComparison.currentFrameLabel}</strong>
          {bestFrame ? <span>{`选取帧 ${bestFrame.index} · ${bestFrame.timestampSeconds}s`}</span> : <span>当前还没有可展示的最佳关键帧</span>}
        </div>
        <div className="standard-frame-placeholder compare-frame-card">
          <span className="frame-badge">目标参考动作</span>
          {report.standardComparison.standardReference.imagePath ? (
            <img src={buildReferenceUrl(report.standardComparison.standardReference.imagePath)} alt={report.standardComparison.standardFrameLabel} />
          ) : (
            <div className="placeholder-box">标准动作参考</div>
          )}
          <strong>{report.standardComparison.standardFrameLabel}</strong>
          <span>{report.standardComparison.standardReference.cue}</span>
          <span>{report.standardComparison.standardReference.sourceType === 'real-sample' ? '参考素材：真人关键帧' : '参考素材：结构示意图'}</span>
        </div>
      </div>
      <div className="key-point-panel standard-difference-panel">
        <strong>这次最该先改的地方</strong>
        <div className="info-list compact difference-list">
          {focusDifferences.map((item, index) => (
            <div key={item} className="list-row">
              <span>{`差异点 ${index + 1}`}</span>
              <strong>{item}</strong>
            </div>
          ))}
        </div>
      </div>
      {report.standardComparison.phaseFrames?.length ? (
        <details className="standard-phase-details">
          <summary>想再看细一点，再看标准动作拆解</summary>
          <div className="phase-grid">
            {report.standardComparison.phaseFrames.map((item) => (
              <div key={item.phase} className="phase-card">
                <img src={buildReferenceUrl(item.imagePath)} alt={item.title} />
                <strong>{item.phase}</strong>
                <span>{item.cue}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}

export function TrainingKickoffCard({ report }: { report: ReportResult }) {
  const focus = getTrainingFocus(report)
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="surface-card training-kickoff-card">
      <span className="eyebrow-copy">开始针对性训练</span>
      <h2>{`先围绕“${focus.primaryTitle}”练一个短周期`}</h2>
      <p className="body-copy">先别把目标放太多，先把这一件事练顺，你在下一次复测里最容易看到清晰变化。</p>

      <div className="training-kickoff-grid">
        <div className="training-kickoff-item">
          <span>训练目标</span>
          <strong>{focus.actionTitle}</strong>
          <p>{focus.actionDescription}</p>
        </div>
        <div className="training-kickoff-item">
          <span>训练后回来确认</span>
          <strong>这次有没有真的变稳</strong>
          <p>{focus.checkDescription}</p>
        </div>
      </div>

      {expanded ? (
        <div className="training-session-sheet">
          <div className="list-row">
            <span>训练提示 1</span>
            <strong>先只盯一个动作点</strong>
            <p>{focus.primaryDescription}</p>
          </div>
          <div className="list-row">
            <span>训练提示 2</span>
            <strong>练的时候优先体会这个变化</strong>
            <p>{focus.impact}</p>
          </div>
          <div className="list-row">
            <span>训练提示 3</span>
            <strong>准备复测时，就看这一件事有没有更稳</strong>
            <p>{focus.checkDescription}</p>
          </div>
        </div>
      ) : null}

      <button className="primary-action button-reset" onClick={() => setExpanded((value) => !value)} type="button">
        {expanded ? '收起训练提示' : '开始针对性训练'}
      </button>
    </section>
  )
}
