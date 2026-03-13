import type {
  ActionType,
  ComparisonResponse,
  CreateTaskRequest,
  ErrorResponse,
  FlowErrorCode,
  HistoryDetailResponse,
  HistoryListResponse,
  PoseAnalysisResult,
  ReportResult,
  SegmentSelectionWindow,
  TaskStatusResponse,
  UploadTaskResponse,
} from '../../../../shared/contracts'

export const API_BASE = import.meta.env.VITE_API_BASE || ''

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error?: ErrorResponse['error'] }

function parseErrorPayload(data: ErrorResponse | { error?: ErrorResponse['error'] } | { error?: string }) {
  if (!data || typeof data !== 'object' || !('error' in data) || !data.error) {
    return undefined
  }
  return typeof data.error === 'string' ? undefined : data.error
}

function summarizeResponseText(rawText: string) {
  return rawText
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

function buildHttpErrorResponse(response: Response, rawText?: string): ErrorResponse {
  const summary = rawText ? summarizeResponseText(rawText) : ''
  return {
    error: {
      code: 'internal_error',
      category: 'internal_recovery',
      retryable: response.status >= 500,
      message: summary
        ? `HTTP ${response.status} ${response.statusText}: ${summary}`
        : `HTTP ${response.status} ${response.statusText}`,
      occurredAt: new Date().toISOString(),
    },
  }
}

async function readApiPayload<T>(response: Response): Promise<T | ErrorResponse> {
  const rawText = await response.text()

  if (!rawText) {
    if (response.ok) {
      throw new Error(`empty response body (${response.status})`)
    }
    return buildHttpErrorResponse(response)
  }

  try {
    return JSON.parse(rawText) as T | ErrorResponse
  } catch {
    if (response.ok) {
      throw new Error(`unexpected response format (${response.status})`)
    }
    return buildHttpErrorResponse(response, rawText)
  }
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(input, init)
  const data = await readApiPayload<T>(response)

  if (!response.ok) {
    return {
      ok: false,
      error: parseErrorPayload(data as ErrorResponse),
    }
  }

  return {
    ok: true,
    data: data as T,
  }
}

export function getFallbackErrorCode(error: ErrorResponse['error'] | undefined, fallbackCode: FlowErrorCode) {
  return !error?.code || error.code === 'internal_error' ? fallbackCode : error.code
}

export function createTaskRequest(actionType: ActionType) {
  return requestJson<TaskStatusResponse>(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionType } satisfies CreateTaskRequest),
  })
}

export function uploadTaskVideo(taskId: string, file: File) {
  const form = new FormData()
  form.append('file', file)

  return requestJson<UploadTaskResponse>(`${API_BASE}/api/tasks/${taskId}/upload`, {
    method: 'POST',
    body: form,
  })
}

export function startTaskAnalysis(
  taskId: string,
  payload: {
    selectedSegmentId?: string
    selectedWindowOverride?: SegmentSelectionWindow | null
  },
) {
  return requestJson<TaskStatusResponse>(`${API_BASE}/api/tasks/${taskId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selectedSegmentId: payload.selectedSegmentId,
      selectedWindowOverride: payload.selectedWindowOverride ?? undefined,
    }),
  })
}

export function fetchTaskStatus(taskId: string) {
  return requestJson<TaskStatusResponse>(`${API_BASE}/api/tasks/${taskId}`)
}

export function fetchTaskResult(taskId: string) {
  return requestJson<ReportResult>(`${API_BASE}/api/tasks/${taskId}/result`)
}

export function fetchHistoryList(actionType: ActionType) {
  return requestJson<HistoryListResponse>(`${API_BASE}/api/history?actionType=${actionType}`)
}

export function fetchHistoryDetail(taskId: string) {
  return requestJson<HistoryDetailResponse>(`${API_BASE}/api/history/${taskId}`)
}

export function fetchTaskComparison(taskId: string, previousTaskId?: string) {
  const url = previousTaskId
    ? `${API_BASE}/api/tasks/${taskId}/comparison?baselineTaskId=${previousTaskId}`
    : `${API_BASE}/api/tasks/${taskId}/comparison`
  return requestJson<ComparisonResponse>(url)
}

export function fetchDebugPose(taskId: string) {
  return requestJson<PoseAnalysisResult>(`${API_BASE}/api/debug/tasks/${taskId}/pose`)
}
