import type { RetestComparison } from '../../hooks/useAnalysisTask'
import { ComparisonCard } from './shared'

export function RetestView({ comparison }: { comparison: RetestComparison | null }) {
  return (
    <>
      <ComparisonCard comparison={comparison} />
    </>
  )
}
