import type { RetestComparison, ReportResult, TaskHistoryItem } from '../../hooks/useAnalysisTask'
import {
  ComparisonHighlightCard,
  ReportHeroCard,
  ReportHistoryBridgeCard,
  StandardComparisonCard,
  TrainingFocusCard,
} from './shared'

export function ReportView({
  report,
  comparison,
  history,
  historyTrend,
  baselineItem,
}: {
  report: ReportResult
  comparison: RetestComparison | null
  history: TaskHistoryItem[]
  historyTrend: string
  baselineItem: TaskHistoryItem | null
}) {
  return (
    <>
      <ReportHeroCard report={report} comparison={comparison} />
      <TrainingFocusCard report={report} />
      {comparison ? <ComparisonHighlightCard comparison={comparison} /> : null}
      <StandardComparisonCard report={report} />
      <section className="surface-card">
        <div className="section-head">
          <div>
            <h2>辅助维度参考</h2>
            <p className="muted-copy">分数只用来帮你判断变化，别抢过前面的主结论和训练重点。</p>
          </div>
        </div>
        <div className="score-grid">
          {report.dimensionScores.map((item) => (
            <div key={item.name} className="score-tile compact-score-tile">
              <span>{item.name}</span>
              <strong>{item.score}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="surface-card">
        <div className="section-head">
          <div>
            <h2>练稳当前重点后，再继续看这些</h2>
            <p className="muted-copy">别一下子同时改太多项，先把第一优先级问题收住。</p>
          </div>
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
      <ReportHistoryBridgeCard
        historyCount={history.length}
        historyTrend={historyTrend}
        baselineItem={baselineItem}
        comparison={comparison}
      />
    </>
  )
}
