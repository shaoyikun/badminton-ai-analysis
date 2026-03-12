import { getTask, updateTask } from './taskRepository';
import { estimatePoseForArtifacts } from './analysisService';
import { readPoseResult, savePoseResult } from './store';

function now() {
  return new Date().toISOString();
}

export async function runPoseAnalysis(taskId: string) {
  const task = getTask(taskId);
  if (!task) return undefined;
  if (!task.preprocess?.artifacts?.artifactsDir) {
    return updateTask(taskId, {
      pose: {
        status: 'failed',
        startedAt: now(),
        completedAt: now(),
        errorMessage: 'preprocess artifacts not found',
      },
    });
  }

  updateTask(taskId, {
    pose: {
      ...(task.pose ?? { status: 'idle' }),
      status: 'processing',
      startedAt: now(),
      completedAt: undefined,
      errorMessage: undefined,
    },
  });

  try {
    const result = await estimatePoseForArtifacts(task.preprocess.artifacts.artifactsDir);
    const resultPath = savePoseResult(taskId, result);

    return updateTask(taskId, {
      pose: {
        status: 'completed',
        startedAt: task.pose?.startedAt ?? now(),
        completedAt: now(),
        resultPath,
        summary: {
          engine: result.engine,
          frameCount: result.frameCount,
          detectedFrameCount: result.detectedFrameCount,
          bestFrameIndex: result.summary?.bestFrameIndex,
          humanSummary: result.summary?.humanSummary,
        },
      },
    });
  } catch (error) {
    return updateTask(taskId, {
      pose: {
        status: 'failed',
        startedAt: task.pose?.startedAt ?? now(),
        completedAt: now(),
        errorMessage: error instanceof Error ? error.message : 'pose analysis failed',
      },
    });
  }
}

export function getPoseSummary(taskId: string) {
  const task = getTask(taskId);
  if (!task) return undefined;
  return {
    taskId: task.taskId,
    status: task.status,
    pose: task.pose ?? { status: 'idle' },
  };
}

export function getPoseResult(taskId: string) {
  const task = getTask(taskId);
  if (!task?.pose?.resultPath) return undefined;
  return readPoseResult(task.pose.resultPath);
}
