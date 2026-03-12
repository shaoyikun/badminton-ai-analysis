import { Link } from 'react-router-dom'
import type { PoseResult, TaskHistoryItem, RetestComparison, ReportResult } from '../../hooks/useAnalysisTask'
import {
  getActionTypeLabel,
  getComparisonChangeLabel,
  getComparisonRiskLabel,
  getComparisonTrendLabel,
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
        <div className="score-tile"><span>命中帧数</span><strong>{poseResult.detectedFrameCount} / {poseResult.frameCount}</strong></div>
        <div className="score-tile"><span>最佳帧</span><strong>{poseResult.summary.bestFrameIndex ?? '—'}</strong></div>
        <div className="score-tile"><span>稳定度均值</span><strong>{formatScore(poseResult.summary.avgStabilityScore)}</strong></div>
        <div className="score-tile"><span>侧身展开</span><strong>{formatScore(poseResult.summary.avgBodyTurnScore)}</strong></div>
        <div className="score-tile"><span>挥拍臂抬举</span><strong>{formatScore(poseResult.summary.avgRacketArmLiftScore)}</strong></div>
      </div>
    </div>
  )
}

export function ReportHeroCard({ report, comparison }: { report: ReportResult; comparison: RetestComparison | null }) {
  const trendLabel = comparison ? getComparisonTrendLabel(comparison.totalScoreDelta) : '先完成下一次复测更有价值'

  return (
    <section className="hero-panel result-hero-card">
      <span className="badge badge-inverse">{getActionTypeLabel(report.actionType)}</span>
      <span className="eyebrow-copy hero-eyebrow">一句话结论</span>
      <h1>{report.summaryText ?? '这次报告已经生成，先看当前最关键的问题和下一步训练方向。'}</h1>
      <div className="hero-meta-grid">
        <div className="hero-metric-card">
          <span>参考总分</span>
          <strong>{report.totalScore}</strong>
          <p>总分只做辅助，先看结论和最该先练的动作点。</p>
        </div>
        <div className="hero-metric-card">
          <span>{comparison ? '当前复测状态' : '持续使用价值'}</span>
          <strong>{trendLabel}</strong>
          <p>
            {comparison
              ? `当前样本会和 ${formatTime(comparison.previousCreatedAt)} 这条历史基线对照。`
              : '等你再录一条同动作样本，这里会直接告诉你训练方向有没有起作用。'}
          </p>
        </div>
      </div>
    </section>
  )
}

export function PrimaryIssueCard({ report }: { report: ReportResult }) {
  const primaryIssue = report.issues[0]
  if (!primaryIssue) return null

  return (
    <section className="surface-card primary-issue-card">
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
    <section className="surface-card training-focus-card">
      <span className="eyebrow-copy">这次先练这一件事</span>
      <h2>{focus.primaryTitle}</h2>
      <p className="body-copy">{focus.primaryDescription}</p>

      <div className="training-outline-grid">
        <div className="key-point-panel">
          <span>为什么先改它</span>
          <p>{focus.impact}</p>
        </div>
        <div className="key-point-panel">
          <span>下次练习先做到</span>
          <strong>{focus.actionTitle}</strong>
          <p>{focus.actionDescription}</p>
        </div>
        <div className="key-point-panel">
          <span>下次复测看什么算在变好</span>
          <p>{focus.checkDescription}</p>
        </div>
      </div>

      {focus.supportingSuggestions.length > 0 ? (
        <div className="info-list compact">
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
    <section className="surface-card comparison-highlight-card">
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
    <section className="surface-card comparison-summary-card">
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

  return (
    <section className="surface-card standard-review-card">
      <div className="section-head">
        <div>
          <h2>{report.standardComparison.sectionTitle}</h2>
          <p className="muted-copy">这一块不只是看像不像，而是看当前动作离目标动作还差在哪。</p>
        </div>
      </div>
      <div className="coach-note">
        <strong>教练会先看什么</strong>
        <p>{report.standardComparison.summaryText}</p>
      </div>
      <div className="media-compare-grid">
        <div className="standard-frame-placeholder">
          <span className="frame-badge">你的当前样本</span>
          {bestFrame?.relativePath ? <img src={buildAssetUrl(bestFrame.relativePath)} alt={report.standardComparison.currentFrameLabel} /> : <div className="placeholder-box">当前样本</div>}
          <strong>{report.standardComparison.currentFrameLabel}</strong>
          {bestFrame ? <span>{`选取帧 ${bestFrame.index} · ${bestFrame.timestampSeconds}s`}</span> : <span>当前还没有可展示的最佳关键帧</span>}
        </div>
        <div className="standard-frame-placeholder">
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
      {report.standardComparison.phaseFrames?.length ? (
        <div className="standard-phase-section">
          <strong>标准动作拆开看</strong>
          <div className="phase-grid">
            {report.standardComparison.phaseFrames.map((item) => (
              <div key={item.phase} className="phase-card">
                <img src={buildReferenceUrl(item.imagePath)} alt={item.title} />
                <strong>{item.phase}</strong>
                <span>{item.cue}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="key-point-panel">
        <strong>这次最该先改的地方</strong>
        <div className="info-list compact">
          {report.standardComparison.differences.map((item, index) => (
            <div key={item} className="list-row"><span>{`观察点 ${index + 1}`}</span><strong>{item}</strong></div>
          ))}
        </div>
      </div>
    </section>
  )
}
