import type { PoseResult, ReportResult } from '../../hooks/useAnalysisTask'
import { PoseSummaryCard, PrimaryIssueCard, StandardComparisonCard } from './shared'

export function ReportView({ report, poseResult }: { report: ReportResult; poseResult: PoseResult | null }) {
  return (
    <>
      <div className="score-card diagnostic-summary-card">
        <span className="meta-label">本次诊断摘要</span>
        <strong>{report.actionType === 'smash' ? '杀球动作' : '正手高远球'}</strong>
        <p>{report.poseBased ? '当前结果已接入 pose 规则映射，下面优先看动作问题本身，不先看分数。' : '当前为模拟结构化报告，下面优先看动作问题本身，不先看分数。'}</p>
        {report.summaryText ? <p>{report.summaryText}</p> : null}
        <div className="summary-score-inline"><span>参考分数</span><strong>{report.totalScore}</strong></div>
      </div>
      <PrimaryIssueCard report={report} />
      <StandardComparisonCard report={report} />
      <PoseSummaryCard poseResult={poseResult} />
      <div className="result-card">
        <h3>维度分数</h3>
        <ul>
          {report.dimensionScores.map((item) => (
            <li key={item.name}><span>{item.name}</span><strong>{item.score}</strong></li>
          ))}
        </ul>
      </div>
      <div className="result-card">
        <h3>其余需要继续看的问题</h3>
        <ul>
          {report.issues.slice(1).length > 0 ? report.issues.slice(1).map((item) => (
            <li key={item.title}><strong>{item.title}</strong><p>{item.description}</p><span>{item.impact}</span></li>
          )) : (
            <li><strong>当前没有第二优先级问题</strong><p>这次报告里最值得先盯的是上面那一个核心问题，先别同时改太多点。</p><span>先把最大短板收住，再看其他维度是否被一起带上来。</span></li>
          )}
        </ul>
      </div>
      <div className="result-card">
        <h3>下次复测关注点</h3>
        <ul>
          {report.suggestions.map((item) => (
            <li key={item.title}><strong>{item.title}</strong><p>{item.description}</p></li>
          ))}
        </ul>
      </div>
      <div className="retest-card"><span className="meta-label">复测建议</span><p>{report.retestAdvice}</p></div>
    </>
  )
}
