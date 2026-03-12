import type { ActionType, ReportResult, RetestComparison, TaskHistoryItem } from '../../hooks/useAnalysisTask'

export function getActionTypeLabel(actionType: ActionType) {
  return actionType === 'smash' ? '杀球' : '正手高远球'
}

export function getValidBaselineItem(history: TaskHistoryItem[], selectedCompareTaskId: string) {
  if (!selectedCompareTaskId) return null
  return history.find((item) => item.taskId === selectedCompareTaskId) ?? null
}

export function getComparisonTrendLabel(totalScoreDelta: number) {
  if (totalScoreDelta > 0) return '这次整体在变好'
  if (totalScoreDelta < 0) return '这次有一点回落'
  return '这次整体基本持平'
}

export function getComparisonChangeLabel(comparison: RetestComparison) {
  const topImprovement = comparison.improvedDimensions[0]
  if (topImprovement) return `${topImprovement.name} 在变好`
  return '暂时没有明显单项提升'
}

export function getComparisonRiskLabel(comparison: RetestComparison) {
  const topRegression = comparison.declinedDimensions[0]
  if (topRegression) return topRegression.name
  return '当前没有明显回落项'
}

export function getTrainingFocus(report: ReportResult) {
  const primaryIssue = report.issues[0]
  const leadSuggestion = report.suggestions[0]

  return {
    primaryTitle: primaryIssue?.title ?? '先把当前动作稳定住',
    primaryDescription: primaryIssue?.description ?? '这次结果已经生成，先别同时改太多点，先稳住最影响结果的一环。',
    impact: primaryIssue?.impact ?? '先把最大短板收住，再看其他维度会不会一起被带起来。',
    actionTitle: leadSuggestion?.title ?? '下次练习先盯住这一个观察点',
    actionDescription: leadSuggestion?.description ?? report.retestAdvice,
    checkDescription: report.retestAdvice,
    supportingSuggestions: report.suggestions.slice(1),
  }
}
