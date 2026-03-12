import type { ReportResult } from '../../hooks/useAnalysisTask'
import { PrimaryIssueCard, StandardComparisonCard } from './shared'

export function ReportView({ report }: { report: ReportResult }) {
  return (
    <>
      <section className="surface-card summary-card">
        <span className="badge">{report.actionType === 'smash' ? '杀球' : '正手高远球'}</span>
        <h2>一句话结论</h2>
        <p>{report.summaryText ?? '这次报告已经生成，下面优先看当前最关键的问题和复测关注点。'}</p>
        <div className="summary-score-chip">
          <span>参考总分</span>
          <strong>{report.totalScore}</strong>
        </div>
      </section>
      <PrimaryIssueCard report={report} />
      <section className="surface-card">
        <div className="section-head">
          <h2>下次复测关注点</h2>
        </div>
        <div className="info-list compact">
          {report.suggestions.map((item) => (
            <div key={item.title} className="list-row">
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="surface-card">
        <div className="section-head">
          <h2>分维度评分</h2>
        </div>
        <div className="score-grid">
          {report.dimensionScores.map((item) => (
            <div key={item.name} className="score-tile">
              <span>{item.name}</span>
              <strong>{item.score}</strong>
            </div>
          ))}
        </div>
      </section>
      <StandardComparisonCard report={report} />
      <section className="surface-card">
        <div className="section-head">
          <h2>其余需要继续看的问题</h2>
        </div>
        <div className="info-list compact">
          {report.issues.slice(1).length > 0 ? report.issues.slice(1).map((item) => (
            <div key={item.title} className="list-row">
              <strong>{item.title}</strong>
              <p>{item.description}</p>
              <span>{item.impact}</span>
            </div>
          )) : (
            <div className="list-row">
              <strong>当前没有第二优先级问题</strong>
              <p>这次报告里最值得先盯的是上面那一个核心问题，先别同时改太多点。</p>
              <span>先把最大短板收住，再看其他维度是否被一起带上来。</span>
            </div>
          )}
        </div>
      </section>
      <section className="surface-card">
        <span className="eyebrow-copy">复测建议</span>
        <p className="body-copy">{report.retestAdvice}</p>
      </section>
    </>
  )
}
