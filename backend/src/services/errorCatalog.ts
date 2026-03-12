import type { ErrorCategory, ErrorSnapshot, FlowErrorCode } from '../types/task';

type ErrorDefinition = {
  category: ErrorCategory;
  retryable: boolean;
  message: string;
  statusCode: number;
};

const ERROR_DEFINITIONS: Record<FlowErrorCode, ErrorDefinition> = {
  invalid_action_type: { category: 'request_validation', retryable: false, message: 'actionType is invalid', statusCode: 400 },
  file_required: { category: 'request_validation', retryable: true, message: 'file is required', statusCode: 400 },
  task_not_found: { category: 'request_validation', retryable: false, message: 'task not found', statusCode: 404 },
  invalid_task_state: { category: 'domain_state', retryable: true, message: 'task state does not allow this operation', statusCode: 409 },
  result_not_ready: { category: 'domain_state', retryable: true, message: 'result not ready', statusCode: 409 },
  comparison_action_mismatch: { category: 'domain_state', retryable: false, message: 'tasks must share the same action type', statusCode: 409 },
  unsupported_file_type: { category: 'media_validation', retryable: true, message: 'unsupported video file type', statusCode: 422 },
  upload_failed: { category: 'pipeline_execution', retryable: true, message: 'failed to persist upload', statusCode: 500 },
  invalid_duration: { category: 'media_validation', retryable: true, message: 'video duration should be between 5 and 15 seconds', statusCode: 422 },
  multi_person_detected: { category: 'media_validation', retryable: true, message: 'multiple people detected in frame', statusCode: 422 },
  body_not_detected: { category: 'media_validation', retryable: true, message: 'body not detected reliably', statusCode: 422 },
  poor_lighting_or_occlusion: { category: 'media_validation', retryable: true, message: 'video quality is too poor for reliable analysis', statusCode: 422 },
  invalid_camera_angle: { category: 'media_validation', retryable: true, message: 'camera angle is not suitable for analysis', statusCode: 422 },
  preprocess_failed: { category: 'pipeline_execution', retryable: true, message: 'preprocess stage failed', statusCode: 500 },
  pose_failed: { category: 'pipeline_execution', retryable: true, message: 'pose estimation failed', statusCode: 500 },
  report_generation_failed: { category: 'pipeline_execution', retryable: true, message: 'report generation failed', statusCode: 500 },
  task_recovery_failed: { category: 'internal_recovery', retryable: true, message: 'task recovery failed', statusCode: 500 },
  internal_error: { category: 'internal_recovery', retryable: true, message: 'internal server error', statusCode: 500 },
};

export function getErrorDefinition(code: FlowErrorCode): ErrorDefinition {
  return ERROR_DEFINITIONS[code];
}

export function buildErrorSnapshot(code: FlowErrorCode, message?: string): ErrorSnapshot {
  const definition = getErrorDefinition(code);
  return {
    code,
    category: definition.category,
    retryable: definition.retryable,
    message: message ?? definition.message,
    occurredAt: new Date().toISOString(),
  };
}

export function getErrorStatusCode(code: FlowErrorCode) {
  return getErrorDefinition(code).statusCode;
}
