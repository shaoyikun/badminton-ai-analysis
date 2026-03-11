import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readTasks, writeTasks, saveResult } from './store';
import { TaskRecord } from '../types/task';
import { runPreprocess } from './preprocessService';
import { runPoseAnalysis } from './poseService';
import { buildMockResult } from './reportScoringService';

function now() {
  return new Date().toISOString();
}

export function createTask(actionType: string): TaskRecord {
  const tasks = readTasks();
  const task: TaskRecord = {
    taskId: `task_${randomUUID().slice(0, 8)}`,
    actionType,
    status: 'created',
    preprocess: {
      status: 'idle',
    },
    pose: {
      status: 'idle',
    },
    createdAt: now(),
    updatedAt: now(),
  };
  tasks.push(task);
  writeTasks(tasks);
  return task;
}

export function getTask(taskId: string): TaskRecord | undefined {
  return readTasks().find((task) => task.taskId === taskId);
}

export function updateTask(taskId: string, patch: Partial<TaskRecord>): TaskRecord | undefined {
  const tasks = readTasks();
  const index = tasks.findIndex((task) => task.taskId === taskId);
  if (index === -1) return undefined;
  tasks[index] = {
    ...tasks[index],
    ...patch,
    preprocess: patch.preprocess ? { ...(tasks[index].preprocess ?? { status: 'idle' }), ...patch.preprocess } : tasks[index].preprocess,
    pose: patch.pose ? { ...(tasks[index].pose ?? { status: 'idle' }), ...patch.pose } : tasks[index].pose,
    updatedAt: now(),
  };
  writeTasks(tasks);
  return tasks[index];
}

export function saveUpload(taskId: string, fileName: string, content?: Buffer, mimeType?: string) {
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const safeName = `${taskId}-${fileName}`;
  const uploadPath = path.join(uploadsDir, safeName);
  fs.writeFileSync(uploadPath, content ?? Buffer.from('demo'));
  return updateTask(taskId, {
    fileName,
    mimeType,
    uploadPath,
    status: 'uploaded',
    preprocess: {
      status: 'idle',
      startedAt: undefined,
      completedAt: undefined,
      errorCode: undefined,
      metadata: undefined,
      artifacts: undefined,
      errorMessage: undefined,
    },
    pose: {
      status: 'idle',
      startedAt: undefined,
      completedAt: undefined,
      errorMessage: undefined,
      resultPath: undefined,
      summary: undefined,
    },
  });
}


export async function startMockAnalysis(taskId: string) {
  const current = getTask(taskId);
  if (!current) return undefined;
  if (!current.uploadPath) return undefined;

  let task = current;
  if (task.preprocess?.status !== 'completed') {
    const preprocessed = await runPreprocess(taskId);
    if (!preprocessed || preprocessed.preprocess?.status !== 'completed') {
      return updateTask(taskId, { status: 'failed', errorCode: 'preprocess_failed' });
    }
    task = preprocessed;
  }

  if (task.pose?.status !== 'completed') {
    const posed = await runPoseAnalysis(taskId);
    if (posed) {
      task = posed;
    }
  }

  const processingTask = updateTask(taskId, { status: 'processing', errorCode: undefined });
  if (!processingTask) return undefined;

  setTimeout(() => {
    const latest = getTask(taskId);
    if (!latest) return;
    const result = buildMockResult(latest);
    const resultPath = saveResult(taskId, result);
    updateTask(taskId, { status: 'completed', resultPath });
  }, 2500);

  return processingTask;
}
