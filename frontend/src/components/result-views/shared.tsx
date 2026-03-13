import { useEffect, useState, type CSSProperties } from 'react'
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

function formatConfidence(value?: number | null) {
  if (value === null || value === undefined) return '—'
  return `${Math.round(value * 100)}%`
}

function formatSegmentTimestamp(timeMs?: number | null) {
  if (timeMs === null || timeMs === undefined) return '—'
  return `${(timeMs / 1000).toFixed(2)}s`
}

function formatDurationMs(durationMs?: number | null) {
  if (durationMs === null || durationMs === undefined) return '—'
  return `${(durationMs / 1000).toFixed(2)}s`
}

function formatSegmentQualityFlag(flag: string) {
  switch (flag) {
    case 'motion_too_weak':
      return '运动偏弱'
    case 'too_short':
      return '时长偏短'
    case 'too_long':
      return '时长偏长'
    case 'edge_clipped_start':
      return '起始可能截断'
    case 'edge_clipped_end':
      return '结尾可能截断'
    case 'preparation_maybe_clipped':
      return '准备段可能被截掉'
    case 'follow_through_maybe_clipped':
      return '随挥可能被截掉'
    case 'subject_maybe_small':
      return '主体可能偏小'
    case 'motion_maybe_occluded':
      return '疑似遮挡'
    default:
      return flag
  }
}

function getRecognitionLead(report: ReportResult) {
  const viewLabel = report.recognitionContext?.viewLabel ?? '未确定'
  const sideLabel = report.recognitionContext?.dominantRacketSideLabel ?? '挥拍侧未确定'
  return `系统当前把这条视频识别为${viewLabel}视角，并推断主要是${sideLabel}。`
}

function getPhaseStatusLabel(status?: NonNullable<ReportResult['phaseBreakdown']>[number]['status']) {
  switch (status) {
    case 'ok':
      return { label: '较稳', tone: 'positive' as const }
    case 'attention':
      return { label: '优先回看', tone: 'caution' as const }
    case 'insufficient_evidence':
      return { label: '证据不足', tone: 'neutral' as const }
    default:
      return { label: '待确认', tone: 'neutral' as const }
  }
}

function getPhaseDeltaTitle(comparison: RetestComparison, phaseKey: NonNullable<ReportResult['phaseBreakdown']>[number]['phaseKey']) {
  const phaseDelta = comparison.phaseDeltas.find((item) => item.phaseKey === phaseKey)
  if (!phaseDelta) return '和基线接近'
  if (!phaseDelta.changed) return '和基线接近'
  if (phaseDelta.previousStatus === 'attention' && phaseDelta.currentStatus === 'ok') return '比基线更稳'
  if (phaseDelta.previousStatus === 'insufficient_evidence' && phaseDelta.currentStatus !== 'insufficient_evidence') return '比基线更清楚'
  return '比基线更需要回看'
}

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
        <div className="score-tile"><span>识别视角</span><strong>{poseResult.summary.viewProfile ?? 'unknown'}</strong></div>
        <div className="score-tile"><span>挥拍侧</span><strong>{poseResult.summary.dominantRacketSide ?? 'unknown'}</strong></div>
      </div>
      {poseResult.summary.rejectionReasons.length > 0 ? (
        <p className="muted-copy">拒绝原因：{poseResult.summary.rejectionReasons.join(' / ')}</p>
      ) : null}
    </div>
  )
}

export function RecognitionContextCard({ report }: { report: ReportResult }) {
  if (!report.recognitionContext) return null

  return (
    <section className="surface-card recognition-context-card">
      <div className="section-head">
        <div>
          <h2>识别信息</h2>
          <p className="muted-copy">这是系统从当前视频里自动识别出来的拍摄信息，不是你手动填写的。</p>
        </div>
      </div>

      <div className="recognition-lead-card">
        <strong>{getRecognitionLead(report)}</strong>
        <p>这些信息会直接参与后面的动作解释、差异提示和骨架可视化展示。</p>
      </div>

      <div className="recognition-metadata-grid">
        <div className="recognition-metadata-item">
          <span>拍摄视角</span>
          <strong>{report.recognitionContext.viewLabel}</strong>
          <p>{`视角置信度 ${formatConfidence(report.recognitionContext.viewConfidence)}`}</p>
        </div>
        <div className="recognition-metadata-item">
          <span>挥拍侧</span>
          <strong>{report.recognitionContext.dominantRacketSideLabel}</strong>
          <p>{`挥拍侧置信度 ${formatConfidence(report.recognitionContext.racketSideConfidence)}`}</p>
        </div>
        <div className="recognition-metadata-item">
          <span>识别引擎</span>
          <strong>{report.recognitionContext.engine ?? '—'}</strong>
          <p>后续叠加图会直接基于这次关键点识别结果生成。</p>
        </div>
      </div>
    </section>
  )
}

export function SwingSegmentsCard({ report }: { report: ReportResult }) {
  const segments = report.swingSegments
  const defaultSelectedId = report.selectedSegmentId ?? report.recommendedSegmentId ?? segments?.[0]?.segmentId ?? ''
  const [activeSegmentId, setActiveSegmentId] = useState(defaultSelectedId)

  useEffect(() => {
    setActiveSegmentId(defaultSelectedId)
  }, [defaultSelectedId])

  if (!segments?.length) return null

  const activeSegment = segments.find((segment) => segment.segmentId === activeSegmentId) ?? segments[0]
  const isRecommended = activeSegment.segmentId === report.recommendedSegmentId
  const isSelected = activeSegment.segmentId === report.selectedSegmentId
  const effectiveStartTimeMs = isSelected ? (report.selectedSegmentWindow?.startTimeMs ?? activeSegment.startTimeMs) : activeSegment.startTimeMs
  const effectiveEndTimeMs = isSelected ? (report.selectedSegmentWindow?.endTimeMs ?? activeSegment.endTimeMs) : activeSegment.endTimeMs

  return (
    <section className="surface-card swing-segments-card">
      <div className="section-head">
        <div>
          <h2>疑似挥拍片段</h2>
          <p className="muted-copy">系统先在整段视频里粗扫出多个候选，再默认挑一段进入当前报告分析。</p>
        </div>
      </div>

      <div className="segment-summary-strip">
        <div className="segment-summary-item">
          <span>候选片段</span>
          <strong>{segments.length}</strong>
        </div>
        <div className="segment-summary-item">
          <span>默认推荐</span>
          <strong>{report.recommendedSegmentId ?? '—'}</strong>
        </div>
        <div className="segment-summary-item">
          <span>当前分析</span>
          <strong>{report.selectedSegmentId ?? report.recommendedSegmentId ?? '—'}</strong>
        </div>
      </div>

      <div className="segment-chip-row">
        {segments.map((segment) => {
          const isActive = segment.segmentId === activeSegment.segmentId
          return (
            <button
              key={segment.segmentId}
              className={`segment-chip ${isActive ? 'active' : ''}`}
              onClick={() => setActiveSegmentId(segment.segmentId)}
              type="button"
            >
              <strong>{segment.segmentId}</strong>
              <span>{formatSegmentTimestamp(segment.startTimeMs)} - {formatSegmentTimestamp(segment.endTimeMs)}</span>
              {segment.segmentId === report.selectedSegmentId ? <em>当前分析</em> : null}
              {segment.segmentId === report.recommendedSegmentId && segment.segmentId !== report.selectedSegmentId ? <em>推荐</em> : null}
            </button>
          )
        })}
      </div>

      <div className="segment-detail-card">
        <div className="segment-detail-head">
          <div>
            <strong>{activeSegment.segmentId}</strong>
            <p>{formatSegmentTimestamp(effectiveStartTimeMs)} - {formatSegmentTimestamp(effectiveEndTimeMs)}，时长 {formatDurationMs(effectiveEndTimeMs - effectiveStartTimeMs)}</p>
          </div>
          <div className="segment-badge-row">
            {isRecommended ? <span className="status-pill brand">推荐片段</span> : null}
            {isSelected ? <span className="status-pill success">当前报告已分析</span> : <span className="status-pill neutral">当前未精分析</span>}
          </div>
        </div>

        <div className="score-grid three-up">
          <div className="score-tile"><span>运动强度</span><strong>{formatScore(activeSegment.motionScore)}</strong></div>
          <div className="score-tile"><span>推荐置信度</span><strong>{formatConfidence(activeSegment.confidence)}</strong></div>
          <div className="score-tile"><span>排序分</span><strong>{formatScore(activeSegment.rankingScore)}</strong></div>
        </div>

        <div className="segment-quality-flags">
          {activeSegment.coarseQualityFlags.length > 0 ? (
            activeSegment.coarseQualityFlags.map((flag) => (
              <span key={flag} className="segment-flag">{formatSegmentQualityFlag(flag)}</span>
            ))
          ) : (
            <span className="segment-flag positive">当前没有明显粗粒度风险标记</span>
          )}
        </div>

        {!isSelected ? (
          <p className="muted-copy">
            这段目前只完成了粗粒度检测和质量标记，当前报告的骨架识别图、分数和建议仍对应 {report.selectedSegmentId ?? report.recommendedSegmentId ?? '默认分析片段'}。
          </p>
        ) : (
          <p className="muted-copy">
            当前这份报告的抽帧、姿态识别和动作建议都基于这个片段生成；如果你在上传页做过前后微调，这里展示的是实际分析窗口。
          </p>
        )}
      </div>
    </section>
  )
}

export function PhaseBreakdownCard({ report }: { report: ReportResult }) {
  if (!report.phaseBreakdown?.length) return null

  return (
    <section className="surface-card phase-breakdown-card">
      <div className="section-head">
        <div>
          <h2>动作阶段拆解</h2>
          <p className="muted-copy">直接按 4 段看这次动作在哪一段更稳、哪一段更需要先收住。</p>
        </div>
      </div>

      <div className="phase-breakdown-grid">
        {report.phaseBreakdown.map((phase) => {
          const status = getPhaseStatusLabel(phase.status)
          return (
            <div key={phase.phaseKey} className={`phase-breakdown-item ${status.tone}`}>
              <div className="phase-breakdown-head">
                <span>{phase.label}</span>
                <span className={`status-pill ${status.tone}`}>{status.label}</span>
              </div>
              <strong>{phase.summary}</strong>
              <p>
                {phase.detectedFrom?.anchorFrameIndex !== undefined && phase.detectedFrom?.anchorFrameIndex !== null
                  ? `锚点帧 ${phase.detectedFrom.anchorFrameIndex}，窗口 ${phase.detectedFrom.windowStartFrameIndex ?? '—'}-${phase.detectedFrom.windowEndFrameIndex ?? '—'}`
                  : '当前没有稳定的阶段锚点。'}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function PoseOverlayGalleryCard({ report }: { report: ReportResult }) {
  const [showOverlay, setShowOverlay] = useState(true)
  const visualEvidence = report.visualEvidence
  if (!visualEvidence?.overlayFrames?.length) return null

  const bestImagePath = showOverlay
    ? visualEvidence.bestFrameOverlayPath ?? visualEvidence.bestFrameImagePath
    : visualEvidence.bestFrameImagePath ?? visualEvidence.bestFrameOverlayPath
  const bestFrame = visualEvidence.overlayFrames.find((item) => item.index === visualEvidence.bestFrameIndex) ?? visualEvidence.overlayFrames[0]

  return (
    <section className="surface-card pose-overlay-card">
      <div className="section-head">
        <div>
          <h2>骨架识别图</h2>
          <p className="muted-copy">先看系统最稳定的一帧，再按需要展开查看全部抽帧识别结果。</p>
        </div>
        <div className="view-toggle-chip-group">
          <button className={`ghost-action inline ${showOverlay ? 'active' : ''}`} onClick={() => setShowOverlay(true)} type="button">
            看骨架叠加图
          </button>
          <button className={`ghost-action inline ${!showOverlay ? 'active' : ''}`} onClick={() => setShowOverlay(false)} type="button">
            看原始抽帧
          </button>
        </div>
      </div>

      <div className="pose-overlay-hero">
        <div className="pose-overlay-media">
          {bestImagePath ? <img src={buildAssetUrl(bestImagePath)} alt="最佳姿态识别图" /> : <div className="placeholder-box">暂无可展示图像</div>}
        </div>
        <div className="pose-overlay-copy">
          <span className="eyebrow-copy">默认展示最佳帧</span>
          <strong>{getRecognitionLead(report)}</strong>
          <p>{showOverlay ? '当前看到的是系统叠加后的身体结构图，方便确认关键点有没有识别到位。' : '当前看到的是原始抽帧图，方便对照系统是不是在正确的时刻抓到了动作。'}
          </p>
          <div className="info-list compact">
            <div className="list-row">
              <span>最佳帧</span>
              <strong>{visualEvidence.bestFrameIndex ?? '—'}</strong>
              <p>{bestFrame?.timestampSeconds !== undefined ? `${bestFrame.timestampSeconds}s` : '暂无时间戳'}</p>
            </div>
            <div className="list-row">
              <span>当前视角</span>
              <strong>{report.recognitionContext?.viewLabel ?? '未确定'}</strong>
              <p>{`视角置信度 ${formatConfidence(report.recognitionContext?.viewConfidence)}`}</p>
            </div>
          </div>
        </div>
      </div>

      <details className="pose-overlay-details">
        <summary>展开查看全部抽帧识别图</summary>
        <div className="pose-overlay-grid">
          {visualEvidence.overlayFrames.map((frame) => {
            const imagePath = showOverlay ? frame.overlayImagePath ?? frame.rawImagePath : frame.rawImagePath ?? frame.overlayImagePath
            return (
              <div key={`${frame.index}-${imagePath ?? 'placeholder'}`} className="pose-overlay-frame-card">
                {imagePath ? <img src={buildAssetUrl(imagePath)} alt={`关键帧 ${frame.index}`} /> : <div className="placeholder-box">暂无图像</div>}
                <strong>{`关键帧 ${frame.index}`}</strong>
                <span>{frame.timestampSeconds !== undefined ? `${frame.timestampSeconds}s` : '无时间戳'}</span>
                <span>{frame.status ? `识别状态：${frame.status}` : '识别状态：—'}</span>
              </div>
            )
          })}
        </div>
      </details>
    </section>
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

export function ComparisonHighlightCard({
  comparison,
  unavailableReason,
}: {
  comparison: RetestComparison | null
  unavailableReason: 'scoring_model_mismatch' | null
}) {
  if (!comparison || unavailableReason) return null

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

export function ComparisonCard({
  comparison,
  unavailableReason,
}: {
  comparison: RetestComparison | null
  unavailableReason: 'scoring_model_mismatch' | null
}) {
  if (unavailableReason === 'scoring_model_mismatch') {
    return (
      <section className="surface-card comparison-summary-card comparison-unavailable-card">
        <span className="eyebrow-copy">复测结论</span>
        <h2>当前这次暂时不能直接和旧基线比较</h2>
        <p className="body-copy">评分模型已经升级，这次复测不会再沿用旧版本样本做 comparison。后续请用新模型下的样本作为新的复测基线。</p>
        <div className="key-point-panel">
          <span>为什么要这样处理</span>
          <p>这次已经进入分阶段报告版本。为了避免把旧模型和新模型混在一起误判进步或退步，系统会直接禁用跨版本对比。</p>
        </div>
      </section>
    )
  }

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

      {comparison.phaseDeltas.length > 0 ? (
        <div className="phase-breakdown-grid compare-phase-grid">
          {comparison.phaseDeltas.map((phase) => {
            const status = getPhaseStatusLabel(phase.currentStatus)
            return (
              <div key={phase.phaseKey} className={`phase-breakdown-item ${status.tone}`}>
                <div className="phase-breakdown-head">
                  <span>{phase.label}</span>
                  <span className={`status-pill ${status.tone}`}>{getPhaseDeltaTitle(comparison, phase.phaseKey)}</span>
                </div>
                <strong>{phase.summary}</strong>
                <p>{`基线：${getPhaseStatusLabel(phase.previousStatus).label} · 当前：${getPhaseStatusLabel(phase.currentStatus).label}`}</p>
              </div>
            )
          })}
        </div>
      ) : null}

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
          <p className="muted-copy">这一块不只是看像不像，而是看系统在当前视角下能稳定看到的动作差异。</p>
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
