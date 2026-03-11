import fs from 'node:fs';
import path from 'node:path';
import { PreprocessArtifacts, TaskRecord, VideoMetadata } from '../types/task';
import { getTask, updateTask } from './taskService';

function now() {
  return new Date().toISOString();
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildSampleTimestamps(durationSeconds: number, targetFrameCount: number) {
  if (durationSeconds <= 0 || targetFrameCount <= 0) return [];
  const step = durationSeconds / targetFrameCount;
  return Array.from({ length: targetFrameCount }, (_, index) => Number((step * index).toFixed(2)));
}

function buildVideoMetadata(task: TaskRecord): VideoMetadata | undefined {
  if (!task.uploadPath || !task.fileName) return undefined;
  const stat = fs.statSync(task.uploadPath);
  const fileSizeBytes = stat.size;
  const estimatedDuration = Number(Math.max(5, Math.min(15, fileSizeBytes / 800000)).toFixed(1));
  const estimatedFrames = Math.round(estimatedDuration * 25);

  return {
    fileName: task.fileName,
    fileSizeBytes,
    mimeType: task.mimeType,
    durationSeconds: estimatedDuration,
    estimatedFrames,
    width: 720,
    height: 1280,
  };
}

function buildArtifacts(metadata: VideoMetadata): PreprocessArtifacts {
  const targetFrameCount = Math.min(12, Math.max(6, Math.round((metadata.durationSeconds ?? 6) / 1.2)));
  return {
    normalizedFileName: sanitizeFileName(metadata.fileName),
    metadataExtractedAt: now(),
    framePlan: {
      strategy: 'uniform-sampling-placeholder',
      targetFrameCount,
      sampleTimestamps: buildSampleTimestamps(metadata.durationSeconds ?? 6, targetFrameCount),
    },
  };
}

export async function runPreprocess(taskId: string) {
  const task = getTask(taskId);
  if (!task) return undefined;
  if (!task.uploadPath || !task.fileName) {
    return updateTask(taskId, {
      preprocess: {
        status: 'failed',
        startedAt: now(),
        completedAt: now(),
        errorMessage: 'upload file not found',
      },
    });
  }

  updateTask(taskId, {
    preprocess: {
      ...(task.preprocess ?? { status: 'idle' }),
      status: 'processing',
      startedAt: now(),
      errorMessage: undefined,
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 1200));

  const current = getTask(taskId);
  if (!current) return undefined;
  const metadata = buildVideoMetadata(current);
  if (!metadata) {
    return updateTask(taskId, {
      preprocess: {
        status: 'failed',
        startedAt: current.preprocess?.startedAt,
        completedAt: now(),
        errorMessage: 'failed to build metadata',
      },
    });
  }

  const artifacts = buildArtifacts(metadata);
  return updateTask(taskId, {
    preprocess: {
      status: 'completed',
      startedAt: current.preprocess?.startedAt,
      completedAt: now(),
      metadata,
      artifacts,
    },
  });
}

export function getPreprocessSummary(taskId: string) {
  const task = getTask(taskId);
  if (!task) return undefined;
  return {
    taskId: task.taskId,
    status: task.status,
    preprocess: task.preprocess ?? { status: 'idle' },
  };
}
