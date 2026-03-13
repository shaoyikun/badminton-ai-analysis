import type { RetestComparison } from '../../hooks/useAnalysisTask'
import { ComparisonCard } from './shared'

export function RetestView({
  comparison,
  unavailableReason,
}: {
  comparison: RetestComparison | null
  unavailableReason: 'scoring_model_mismatch' | null
}) {
  return (
    <>
      <ComparisonCard comparison={comparison} unavailableReason={unavailableReason} />
    </>
  )
}
