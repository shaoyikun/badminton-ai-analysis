import type { ActionType } from '../types/task';

function validateActionType(actionType: string): actionType is ActionType {
  return actionType === 'clear' || actionType === 'smash';
}

export function assertActionType(actionType: string): asserts actionType is ActionType {
  if (!validateActionType(actionType)) {
    throw Object.assign(new Error('invalid action type'), { code: 'invalid_action_type' as const });
  }
}

export {
  createAnalysisTask,
  createTask,
  getActiveAnalysisTaskForTests,
  migrateLegacyStoreIfNeeded,
  prepareUploadedTaskForSelection,
  recoverStaleTasks,
  runAnalysisPipelineForTests,
  saveUpload,
  setAnalysisWorkerForTests,
  setUploadPreparationWorkerForTests,
  startAnalysis,
  startAnalysisWithSelection,
  startMockAnalysis,
} from './taskOrchestrationService';

export {
  getHistoryDetail,
  getPoseResultForDebug,
  getRetestComparison,
  listTaskHistory,
} from './taskQueryService';
