import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readTasks, writeTasks, saveResult } from './store';
import { ReportResult, TaskRecord } from '../types/task';
import { runPreprocess } from './preprocessService';
import { runPoseAnalysis } from './poseService';

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

function buildMockResult(task: TaskRecord): ReportResult {
  return {
    taskId: task.taskId,
    actionType: task.actionType,
    totalScore: task.actionType === 'smash' ? 72 : 76,
    dimensionScores: [
      { name: '准备姿态', score: 82 },
      { name: '引拍完整度', score: 73 },
      { name: '转体/转髋', score: 68 },
      { name: '击球点', score: 71 },
    ],
    issues: [
      {
        title: '击球点偏晚',
        description: '接触球点更靠近身体后侧。',
        impact: '出球深度不足，后场压制力下降。',
      },
    ],
    suggestions: [
      {
        title: '高点击球定点练习',
        description: '每天 3 组，每组 15 次。',
      },
    ],
    compareSummary: '当前 PoC 阶段暂未接入真实复测对比，先返回结构占位字段。',
    retestAdvice: '建议 3~7 天后保持同一机位复测。',
    createdAt: now(),
    preprocess: {
      metadata: task.preprocess?.metadata,
      artifacts: task.preprocess?.artifacts,
    },
  };
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
