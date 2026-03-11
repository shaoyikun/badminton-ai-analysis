import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getTask, updateTask } from './taskService';
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
    const repoRoot = path.resolve(process.cwd(), '..');
    const analysisEntry = path.join(repoRoot, 'analysis-service', 'app.py');
    const taskDir = path.join(process.cwd(), task.preprocess.artifacts.artifactsDir);

    const output = execFileSync('/usr/bin/python3', [analysisEntry, taskDir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

    const parsed = JSON.parse(output) as { result: { engine: string; frameCount: number; detectedFrameCount: number; frames: any[] } };
    const resultPath = savePoseResult(taskId, parsed.result);

    return updateTask(taskId, {
      pose: {
        status: 'completed',
        startedAt: task.pose?.startedAt ?? now(),
        completedAt: now(),
        resultPath,
        summary: {
          engine: parsed.result.engine,
          frameCount: parsed.result.frameCount,
          detectedFrameCount: parsed.result.detectedFrameCount,
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
