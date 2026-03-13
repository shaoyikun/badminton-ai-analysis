import type { ActionType, ReportResult, RetestComparison, TaskHistoryItem } from '../../hooks/useAnalysisTask'

export function getActionTypeLabel(actionType: ActionType) {
  void actionType
  return '正手高远球'
}

export function getValidBaselineItem(history: TaskHistoryItem[], selectedCompareTaskId: string) {
  if (!selectedCompareTaskId) return null
  return history.find((item) => item.taskId === selectedCompareTaskId) ?? null
}

export function getComparisonTrendLabel(totalScoreDelta: number) {
  if (totalScoreDelta > 0) return '这次训练方向在起作用'
  if (totalScoreDelta < 0) return '这次先把关键动作收住'
  return '这次主动作框架基本守住了'
}

export function getComparisonChangeLabel(comparison: RetestComparison) {
  const topImprovement = comparison.improvedDimensions[0]
  if (topImprovement) return `${topImprovement.name} 这次更稳了`
  return '暂时没有特别突出的单项提升'
}

export function getComparisonRiskLabel(comparison: RetestComparison) {
  const topRegression = comparison.declinedDimensions[0]
  if (topRegression) return `${topRegression.name} 需要先回看`
  return '当前没有明显回落项'
}

export function getReportLevel(score: number) {
  if (score >= 80) {
    return {
      label: '动作框架稳定',
      tone: 'positive' as const,
      summary: '这次动作已经比较成型，接下来更重要的是继续把稳定性守住。',
    }
  }

  if (score >= 65) {
    return {
      label: '有基础，正在进步',
      tone: 'steady' as const,
      summary: '整体已经有基础框架，现在最值得做的是把核心短板收得更稳一点。',
    }
  }

  return {
    label: '先稳住基础动作',
    tone: 'caution' as const,
    summary: '先别同时改太多，先把最影响结果的那一环动作收住，进步会更明显。',
  }
}

export function getBestDimension(report: ReportResult) {
  return [...report.dimensionScores].sort((left, right) => right.score - left.score)[0] ?? null
}

export function getDimensionStatus(score: number) {
  if (score >= 80) {
    return { label: '稳定', tone: 'positive' as const }
  }

  if (score >= 65) {
    return { label: '还可以', tone: 'steady' as const }
  }

  return { label: '优先改', tone: 'caution' as const }
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
