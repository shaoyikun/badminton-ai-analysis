import fs from 'node:fs';
import path from 'node:path';
import { TaskRecord, ReportResult } from '../types/task';

const dataDir = path.resolve(process.cwd(), 'data');
const tasksFile = path.join(dataDir, 'tasks.json');

function ensureStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(tasksFile)) fs.writeFileSync(tasksFile, '[]', 'utf8');
}

export function readTasks(): TaskRecord[] {
  ensureStore();
  return JSON.parse(fs.readFileSync(tasksFile, 'utf8')) as TaskRecord[];
}

export function writeTasks(tasks: TaskRecord[]) {
  ensureStore();
  fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2), 'utf8');
}

export function saveResult(taskId: string, result: ReportResult): string {
  ensureStore();
  const resultPath = path.join(dataDir, `${taskId}.result.json`);
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
  return resultPath;
}

export function readResult(resultPath: string): ReportResult {
  return JSON.parse(fs.readFileSync(resultPath, 'utf8')) as ReportResult;
}