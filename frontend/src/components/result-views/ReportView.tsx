import type { RetestComparison, ReportResult } from '../../hooks/useAnalysisTask'
import {
  DimensionScoreSection,
  IssueBreakdownSection,
  PhaseBreakdownCard,
  PoseOverlayGalleryCard,
  RecognitionContextCard,
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
      <RecognitionContextCard report={report} />
      <PhaseBreakdownCard report={report} />
      <PoseOverlayGalleryCard report={report} />
      <TrainingFocusCard report={report} />
      <IssueBreakdownSection report={report} />
      <DimensionScoreSection report={report} />
      <StandardComparisonCard report={report} />
      <TrainingKickoffCard report={report} />
    </>
  )
}
