import fs from 'node:fs';
import path from 'node:path';
import { TaskRecord, ReportResult, PoseAnalysisResult } from '../types/task';

function getDataDir() {
  return path.resolve(process.cwd(), 'data');
}

function getTasksFile() {
  return path.join(getDataDir(), 'tasks.json');
}

function ensureStore() {
  const dataDir = getDataDir();
  const tasksFile = getTasksFile();
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(tasksFile)) fs.writeFileSync(tasksFile, '[]', 'utf8');
}

export function readTasks(): TaskRecord[] {
  ensureStore();
  return JSON.parse(fs.readFileSync(getTasksFile(), 'utf8')) as TaskRecord[];
}

export function writeTasks(tasks: TaskRecord[]) {
  ensureStore();
  fs.writeFileSync(getTasksFile(), JSON.stringify(tasks, null, 2), 'utf8');
}

export function saveResult(taskId: string, result: ReportResult): string {
  ensureStore();
  const dataDir = getDataDir();
  const resultPath = path.join(dataDir, `${taskId}.result.json`);
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
  return resultPath;
}

export function readResult(resultPath: string): ReportResult {
  return JSON.parse(fs.readFileSync(resultPath, 'utf8')) as ReportResult;
}

export function readResultByTaskId(taskId: string): ReportResult | undefined {
  ensureStore();
  const dataDir = getDataDir();
  const resultPath = path.join(dataDir, `${taskId}.result.json`);
  if (!fs.existsSync(resultPath)) return undefined;
  return readResult(resultPath);
}

export function savePoseResult(taskId: string, result: PoseAnalysisResult): string {
  ensureStore();
  const dataDir = getDataDir();
  const resultPath = path.join(dataDir, `${taskId}.pose.json`);
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
  return resultPath;
}

export function readPoseResult(resultPath: string): PoseAnalysisResult {
  return JSON.parse(fs.readFileSync(resultPath, 'utf8')) as PoseAnalysisResult;
}
