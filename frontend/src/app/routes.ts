export const ROUTES = {
  home: '/',
  guide: '/guide',
  upload: '/analyses/new',
  history: '/history',
  error: '/error',
  designSystemFoundations: '/design-system/foundations',
  designSystemComponents: '/design-system/components',
} as const

export function buildProcessingRoute(taskId: string) {
  return `/analyses/${taskId}/processing`
}

export function buildSegmentsRoute(taskId: string) {
  return `/analyses/${taskId}/segments`
}

export function buildReportRoute(taskId: string) {
  return `/analyses/${taskId}/report`
}

export function buildComparisonRoute(taskId: string) {
  return `/analyses/${taskId}/comparison`
}

export type AnalysisRouteKind = 'processing' | 'report' | 'comparison'

export function buildAnalysisRoute(taskId: string, kind: AnalysisRouteKind) {
  if (kind === 'processing') return buildProcessingRoute(taskId)
  if (kind === 'comparison') return buildComparisonRoute(taskId)
  return buildReportRoute(taskId)
}
