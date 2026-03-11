import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readTasks, writeTasks, saveResult } from './store';
import { ReportResult, TaskRecord } from '../types/task';

function now() {
  return new Date().toISOString();
}

export function createTask(actionType: string): TaskRecord {
  const tasks = readTasks();
  const task: TaskRecord = {
    taskId: `task_${randomUUID().slice(0, 8)}`,
    actionType,
    status: 'created',
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
  tasks[index] = { ...tasks[index], ...patch, updatedAt: now() };
  writeTasks(tasks);
  return tasks[index];
}

export function saveUpload(taskId: string, fileName: string, contentBase64?: string) {
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const safeName = `${taskId}-${fileName}`;
  const uploadPath = path.join(uploadsDir, safeName);
  fs.writeFileSync(uploadPath, contentBase64 ? Buffer.from(contentBase64, 'base64') : Buffer.from('demo'), undefined);
  return updateTask(taskId, { fileName, uploadPath, status: 'uploaded' });
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
    retestAdvice: '建议 3~7 天后保持同一机位复测。',
  };
}

export async function startMockAnalysis(taskId: string) {
  const task = updateTask(taskId, { status: 'processing' });
  if (!task) return undefined;
  setTimeout(() => {
    const current = getTask(taskId);
    if (!current) return;
    const result = buildMockResult(current);
    const resultPath = saveResult(taskId, result);
    updateTask(taskId, { status: 'completed', resultPath });
  }, 2500);
  return task;
}