import type { Page, Route } from '@playwright/test'
import type {
  ComparisonResponse,
  HistoryDetailResponse,
  HistoryListResponse,
  PoseAnalysisResult,
  TaskStatusResponse,
  UploadTaskResponse,
} from '../../../shared/contracts'
import {
  buildErrorResponse,
  comparisonBaselineTaskId,
  comparisonHistoryTaskId,
  comparisonResponse,
  currentTaskId,
  historyDetailResponse,
  historyResponse,
  poseResponse,
  processingLifecycle,
  reportResponse,
  reportTaskStatus,
  uploadTaskResponse,
} from './data'

type MockApiOptions = {
  history?: HistoryListResponse
  report?: typeof reportResponse
  historyDetail?: HistoryDetailResponse
  comparison?: ComparisonResponse
  pose?: PoseAnalysisResult
  currentTaskStatus?: TaskStatusResponse
  taskStatusSequence?: TaskStatusResponse[]
  createTaskResponse?: TaskStatusResponse
  uploadTaskResponse?: UploadTaskResponse
  startTaskResponse?: TaskStatusResponse
}

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9oNcam4AAAAASUVORK5CYII=',
  'base64',
)

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  })
}

function buildHistoryDetail(taskId: string, data: MockApiOptions) {
  const source =
    data.history?.items.find((item) => item.taskId === taskId) ??
    historyResponse.items.find((item) => item.taskId === taskId) ??
    historyResponse.items[0]

  return {
    ...(data.historyDetail ?? historyDetailResponse),
    task: {
      ...(data.historyDetail?.task ?? historyDetailResponse.task),
      taskId,
      createdAt: source?.createdAt ?? historyDetailResponse.task.createdAt,
      completedAt: source?.completedAt ?? historyDetailResponse.task.completedAt,
      baselineTaskId: comparisonBaselineTaskId,
    },
    report: {
      ...(data.historyDetail?.report ?? historyDetailResponse.report),
      taskId,
      totalScore: source?.totalScore ?? historyDetailResponse.report.totalScore,
      summaryText: source?.summaryText ?? historyDetailResponse.report.summaryText,
    },
  } satisfies HistoryDetailResponse
}

export async function mockApi(page: Page, options: MockApiOptions = {}) {
  let statusIndex = 0

  await page.route('**/artifacts/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: transparentPng,
    })
  })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    const method = request.method()

    if (method === 'GET' && pathname === '/api/history') {
      return json(route, options.history ?? historyResponse)
    }

    if (method === 'GET' && pathname.startsWith('/api/history/')) {
      const taskId = pathname.split('/').pop() ?? comparisonHistoryTaskId
      return json(route, buildHistoryDetail(taskId, options))
    }

    if (method === 'GET' && /^\/api\/tasks\/[^/]+$/.test(pathname)) {
      if (options.taskStatusSequence?.length) {
        const next =
          options.taskStatusSequence[Math.min(statusIndex, options.taskStatusSequence.length - 1)]
        statusIndex += 1
        return json(route, next)
      }

      const taskId = pathname.split('/').pop() ?? currentTaskId
      if (taskId === processingLifecycle.processing.taskId) {
        return json(route, options.currentTaskStatus ?? processingLifecycle.processing)
      }
      if (taskId === processingLifecycle.failed.taskId) {
        return json(route, options.currentTaskStatus ?? processingLifecycle.failed)
      }

      return json(route, options.currentTaskStatus ?? reportTaskStatus)
    }

    if (method === 'GET' && pathname.endsWith('/result')) {
      return json(route, options.report ?? reportResponse)
    }

    if (method === 'GET' && pathname.endsWith('/comparison')) {
      return json(route, options.comparison ?? comparisonResponse)
    }

    if (method === 'GET' && pathname.startsWith('/api/debug/tasks/')) {
      return json(route, options.pose ?? poseResponse)
    }

    if (method === 'POST' && pathname === '/api/tasks') {
      return json(route, options.createTaskResponse ?? processingLifecycle.created)
    }

    if (method === 'POST' && pathname.endsWith('/upload')) {
      return json(route, options.uploadTaskResponse ?? uploadTaskResponse)
    }

    if (method === 'POST' && pathname.endsWith('/start')) {
      if (options.startTaskResponse) {
        return json(route, options.startTaskResponse)
      }

      const requestBody = request.postDataJSON?.() as { selectedSegmentId?: string; selectedWindowOverride?: unknown } | undefined
      return json(route, {
        ...processingLifecycle.processing,
        segmentScan: processingLifecycle.processing.segmentScan
          ? {
              ...processingLifecycle.processing.segmentScan,
              selectedSegmentId: requestBody?.selectedSegmentId ?? processingLifecycle.processing.segmentScan.selectedSegmentId,
              selectedSegmentWindow: requestBody?.selectedWindowOverride ?? processingLifecycle.processing.segmentScan.selectedSegmentWindow,
            }
          : processingLifecycle.processing.segmentScan,
      })
    }

    return json(route, buildErrorResponse('task_not_found', `Unhandled mock for ${pathname}`), 404)
  })
}
