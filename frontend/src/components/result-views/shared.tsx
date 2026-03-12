import { API_BASE, type PoseResult, type TaskHistoryItem, type RetestComparison, type ReportResult } from '../../hooks/useAnalysisTask'

export function formatFileSize(size?: number) {
  if (!size) return '—'
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

export function formatScore(value?: number | null) {
  if (value === null || value === undefined) return '—'
  return value.toFixed(2)
}

export function formatTime(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export function buildAssetUrl(relativePath?: string) {
  if (!relativePath) return ''
  return `${API_BASE}/${relativePath}`
}

export function buildReferenceUrl(relativePath?: string) {
  if (!relativePath) return ''
  return `${relativePath}`
}

export function PoseSummaryCard({ poseResult }: { poseResult: PoseResult | null }) {
  if (!poseResult) return null

  return (
    <div className="result-card pose-summary-card">
      <h3>姿态摘要</h3>
      <p>{poseResult.summary.humanSummary}</p>
      <div className="pose-metrics-grid">
        <div className="pose-metric-item"><span>识别引擎</span><strong>{poseResult.engine}</strong></div>
        <div className="pose-metric-item"><span>命中帧数</span><strong>{poseResult.detectedFrameCount} / {poseResult.frameCount}</strong></div>
        <div className="pose-metric-item"><span>最佳帧</span><strong>{poseResult.summary.bestFrameIndex ?? '—'}</strong></div>
        <div className="pose-metric-item"><span>稳定度均值</span><strong>{formatScore(poseResult.summary.avgStabilityScore)}</strong></div>
        <div className="pose-metric-item"><span>侧身展开</span><strong>{formatScore(poseResult.summary.avgBodyTurnScore)}</strong></div>
        <div className="pose-metric-item"><span>挥拍臂抬举</span><strong>{formatScore(poseResult.summary.avgRacketArmLiftScore)}</strong></div>
      </div>
    </div>
  )
}

export function PrimaryIssueCard({ report }: { report: ReportResult }) {
  const primaryIssue = report.issues[0]
  if (!primaryIssue) return null

  return (
    <div className="primary-issue-card">
      <span className="meta-label">这次最该先看的问题</span>
      <strong>{primaryIssue.title}</strong>
      <p>{primaryIssue.description}</p>
      <div className="primary-issue-impact">
        <span>为什么这件事要先改</span>
        <p>{primaryIssue.impact}</p>
      </div>
    </div>
  )
}

export function HistoryCard({ history, selectedCompareTaskId, onSelectCompare, onOpenHistoryDetail, disabled }: { history: TaskHistoryItem[]; selectedCompareTaskId: string; onSelectCompare: (taskId: string) => void; onOpenHistoryDetail?: (taskId: string) => void; disabled?: boolean }) {
  return (
    <div className="result-card history-entry-card">
      <h3>历史记录与复测入口</h3>
      {history.length === 0 ? (
        <p>你现在还没有同动作历史样本。等完成下一条上传后，这里就会变成你的复测入口。</p>
      ) : (
        <>
          <div className="history-summary-card">
            <span className="meta-label">为什么还要再拍一条</span>
            <strong>{`你已经有 ${history.length} 条同动作历史样本`}</strong>
            <p>后面每次新上传，不只是看这次做得怎样，更是看核心问题有没有收住、动作变化是不是稳定下来。</p>
          </div>
          <div className="compare-selector">
            <label>选择一个历史样本做对比基线</label>
            <select value={selectedCompareTaskId} onChange={(e) => onSelectCompare(e.target.value)} disabled={disabled}>
              <option value="">请选择历史样本</option>
              {history.slice(0, 10).map((item) => (
                <option key={item.taskId} value={item.taskId}>
                  {formatTime(item.createdAt)} · {item.totalScore ?? '—'} 分
                </option>
              ))}
            </select>
          </div>
          <ul>
            {history.slice(0, 5).map((item) => (
              <li key={item.taskId}>
                <span>{formatTime(item.createdAt)}</span>
                <strong>{item.totalScore ?? '—'} 分</strong>
                <p>{item.summaryText ?? `${item.actionType} 已完成分析`}</p>
                {onOpenHistoryDetail ? <button className="ghost-button" onClick={() => onOpenHistoryDetail(item.taskId)} disabled={disabled}>查看这次详情</button> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function ComparisonCard({ comparison }: { comparison: RetestComparison | null }) {
  if (!comparison) {
    return (
      <div className="result-card">
        <h3>复测对比</h3>
        <p>当前还没有可对比的同动作样本。等你再录一条，或者从历史记录里手动选一条样本后，就能看到变化结论。</p>
      </div>
    )
  }

  const trendLabel = comparison.totalScoreDelta > 0 ? '这次整体在变好' : comparison.totalScoreDelta < 0 ? '这次有一点回落' : '这次整体基本持平'
  const topImprovement = comparison.improvedDimensions[0]
  const topRegression = comparison.declinedDimensions[0]

  return (
    <div className="result-card comparison-summary-card">
      <h3>复测对比</h3>
      <div className="comparison-headline-card">
        <span className="meta-label">先看结论</span>
        <strong>{trendLabel}</strong>
        <p>{comparison.coachReview.headline}</p>
      </div>
      <div className="comparison-key-points">
        <div className="comparison-point-card">
          <span>这次最明显的变化</span>
          <strong>{topImprovement ? `${topImprovement.name} 在变好` : '暂时没有明显单项提升'}</strong>
          <p>{comparison.coachReview.progressNote}</p>
        </div>
        <div className="comparison-point-card">
          <span>这次最该防止继续掉的点</span>
          <strong>{topRegression ? topRegression.name : '当前没有明显回落项'}</strong>
          <p>{comparison.coachReview.regressionNote ?? comparison.coachReview.keepDoing ?? '这次没有明显回落项，先把已经稳定住的部分继续保住。'}</p>
        </div>
      </div>
      <div className="coach-review-card">
        <strong>下次复测只先盯这个</strong>
        <p>{comparison.coachReview.nextFocus}</p>
        <p>{comparison.coachReview.nextCheck}</p>
      </div>
      <div className="comparison-meta-strip">
        <div><span>对比样本</span><strong>{formatTime(comparison.previousCreatedAt)}</strong></div>
        <div><span>当前样本</span><strong>{formatTime(comparison.currentCreatedAt)}</strong></div>
        <div><span>参考分数变化</span><strong>{comparison.totalScoreDelta > 0 ? `+${comparison.totalScoreDelta}` : comparison.totalScoreDelta}</strong></div>
      </div>
    </div>
  )
}

export function StandardComparisonCard({ report }: { report: ReportResult }) {
  if (!report.standardComparison) return null
  const bestFrameIndex = report.scoringEvidence?.bestFrameIndex
  const bestFrame = report.preprocess?.artifacts?.sampledFrames?.find((item) => item.index === bestFrameIndex)
    ?? report.preprocess?.artifacts?.sampledFrames?.[0]

  return (
    <div className="result-card standard-review-card">
      <div className="panel-header standard-review-header">
        <div>
          <h3>{report.standardComparison.sectionTitle}</h3>
          <p className="standard-review-subtitle">这一块不只是看像不像，而是看当前动作离目标动作还差在哪。</p>
        </div>
      </div>
      <div className="coach-review-card standard-summary-card">
        <strong>教练会先看什么</strong>
        <p>{report.standardComparison.summaryText}</p>
      </div>
      <div className="standard-compare-grid">
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
          <div className="standard-phase-grid">
            {report.standardComparison.phaseFrames.map((item) => (
              <div key={item.phase} className="standard-phase-card">
                <img src={buildReferenceUrl(item.imagePath)} alt={item.title} />
                <strong>{item.phase}</strong>
                <span>{item.cue}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="comparison-block standard-difference-block">
        <strong>这次最该先改的地方</strong>
        <ul>
          {report.standardComparison.differences.map((item, index) => (
            <li key={item}><span>{`观察点 ${index + 1}`}</span><strong>{item}</strong></li>
          ))}
        </ul>
      </div>
    </div>
  )
}
