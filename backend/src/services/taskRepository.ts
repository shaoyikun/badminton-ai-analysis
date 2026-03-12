import { TaskRecord } from '../types/task';
import { readTasks, writeTasks } from './store';

export function listTasks(): TaskRecord[] {
  return readTasks();
}

export function getTask(taskId: string): TaskRecord | undefined {
  return readTasks().find((task) => task.taskId === taskId);
}

export function createTaskRecord(task: TaskRecord): TaskRecord {
  const tasks = readTasks();
  tasks.push(task);
  writeTasks(tasks);
  return task;
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
    updatedAt: new Date().toISOString(),
  };

  writeTasks(tasks);
  return tasks[index];
}
