import type { RetestComparison, ReportResult } from '../../hooks/useAnalysisTask'
import {
  DimensionScoreSection,
  IssueBreakdownSection,
  ReportHeroCard,
  StandardComparisonCard,
  TrainingFocusCard,
  TrainingKickoffCard,
} from './shared'

export function ReportView({
  report,
  comparison,
}: {
  report: ReportResult
  comparison: RetestComparison | null
}) {
  return (
    <>
      <ReportHeroCard report={report} comparison={comparison} />
      <TrainingFocusCard report={report} />
      <IssueBreakdownSection report={report} />
      <DimensionScoreSection report={report} />
      <StandardComparisonCard report={report} />
      <TrainingKickoffCard report={report} />
    </>
  )
}
