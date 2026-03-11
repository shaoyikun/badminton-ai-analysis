import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PreprocessArtifacts, PreprocessFrameItem, TaskRecord, VideoMetadata } from '../types/task';
import { getTask, updateTask } from './taskService';

const SUPPORTED_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const MIN_FILE_SIZE_BYTES = 100 * 1024;
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 15;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 320;
const DEFAULT_FRAME_RATE = 25;

function now() {
  return new Date().toISOString();
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function ensureDir(target: string) {
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
}

function clearDir(target: string) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
}

function getArtifactsBaseDir() {
  return path.resolve(process.cwd(), 'data', 'preprocess');
}

function buildSampleTimestamps(durationSeconds: number, targetFrameCount: number) {
  if (durationSeconds <= 0 || targetFrameCount <= 0) return [];
  if (targetFrameCount === 1) return [Number((durationSeconds / 2).toFixed(2))];
  const step = durationSeconds / (targetFrameCount + 1);
  return Array.from({ length: targetFrameCount }, (_, index) => Number((step * (index + 1)).toFixed(2)));
}

function runCommand(command: string, args: string[]) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function probeVideo(task: TaskRecord): VideoMetadata | undefined {
  if (!task.uploadPath || !task.fileName) return undefined;
  const stat = fs.statSync(task.uploadPath);
  const extension = path.extname(task.fileName).toLowerCase();

  const probeOutput = runCommand('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,r_frame_rate,avg_frame_rate,duration,nb_frames:format=duration',
    '-of',
    'json',
    task.uploadPath,
  ]);

  const parsed = JSON.parse(probeOutput) as {
    streams?: Array<{
      width?: number;
      height?: number;
      r_frame_rate?: string;
      avg_frame_rate?: string;
      duration?: string;
      nb_frames?: string;
    }>;
    format?: {
      duration?: string;
    };
  };

  const stream = parsed.streams?.[0] ?? {};
  const durationSeconds = Number.parseFloat(stream.duration ?? parsed.format?.duration ?? '0');
  const frameRateText = stream.avg_frame_rate || stream.r_frame_rate || '';
  const [num, den] = frameRateText.split('/').map((value) => Number.parseFloat(value));
  const frameRate = num && den ? Number((num / den).toFixed(2)) : DEFAULT_FRAME_RATE;
  const estimatedFrames = stream.nb_frames ? Number.parseInt(stream.nb_frames, 10) : Math.round(durationSeconds * frameRate);

  return {
    fileName: task.fileName,
    fileSizeBytes: stat.size,
    mimeType: task.mimeType,
    extension,
    durationSeconds: Number(durationSeconds.toFixed(2)),
    estimatedFrames,
    width: stream.width,
    height: stream.height,
    frameRate,
    metadataSource: 'ffprobe',
  };
}

function validateUploadedVideo(metadata: VideoMetadata) {
  if (!SUPPORTED_EXTENSIONS.has(metadata.extension ?? '')) {
    return {
      errorCode: 'upload_failed',
      errorMessage: `unsupported video extension: ${metadata.extension ?? 'unknown'}`,
    };
  }

  if (metadata.fileSizeBytes < MIN_FILE_SIZE_BYTES) {
    return {
      errorCode: 'upload_failed',
      errorMessage: 'video file is too small to analyze reliably',
    };
  }

  if (metadata.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      errorCode: 'upload_failed',
      errorMessage: 'video file is too large for current PoC limits',
    };
  }

  if ((metadata.durationSeconds ?? 0) < MIN_DURATION_SECONDS || (metadata.durationSeconds ?? 0) > MAX_DURATION_SECONDS) {
    return {
      errorCode: 'invalid_duration',
      errorMessage: `video duration should be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} seconds`,
    };
  }

  if ((metadata.width ?? 0) < MIN_WIDTH || (metadata.height ?? 0) < MIN_HEIGHT) {
    return {
      errorCode: 'poor_lighting_or_occlusion',
      errorMessage: `video resolution is too small: ${metadata.width ?? 0}x${metadata.height ?? 0}`,
    };
  }

  return null;
}

function extractFrames(taskId: string, task: TaskRecord, metadata: VideoMetadata): PreprocessArtifacts {
  if (!task.uploadPath) throw new Error('upload path not found');

  const targetFrameCount = Math.min(12, Math.max(6, Math.round((metadata.durationSeconds ?? 6) / 1.2)));
  const sampleTimestamps = buildSampleTimestamps(metadata.durationSeconds ?? 6, targetFrameCount);
  const artifactsDir = path.join(getArtifactsBaseDir(), taskId);
  clearDir(artifactsDir);

  const sampledFrames: PreprocessFrameItem[] = sampleTimestamps.map((timestamp, index) => {
    const frameFileName = `frame-${String(index + 1).padStart(2, '0')}.jpg`;
    const fullPath = path.join(artifactsDir, frameFileName);
    const relativePath = path.posix.join('data', 'preprocess', taskId, frameFileName);

    runCommand('ffmpeg', [
      '-y',
      '-ss',
      String(timestamp),
      '-i',
      task.uploadPath!,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      fullPath,
    ]);

    return {
      index: index + 1,
      timestampSeconds: timestamp,
      fileName: frameFileName,
      relativePath,
    };
  });

  const manifestPath = path.join(artifactsDir, 'manifest.json');
  const relativeManifestPath = path.posix.join('data', 'preprocess', taskId, 'manifest.json');

  const artifacts: PreprocessArtifacts = {
    normalizedFileName: sanitizeFileName(metadata.fileName),
    metadataExtractedAt: now(),
    artifactsDir: path.posix.join('data', 'preprocess', taskId),
    manifestPath: relativeManifestPath,
    framePlan: {
      strategy: 'uniform-sampling-ffmpeg-v1',
      targetFrameCount,
      sampleTimestamps,
    },
    sampledFrames,
  };

  fs.writeFileSync(manifestPath, JSON.stringify(artifacts, null, 2), 'utf8');
  return artifacts;
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
        errorCode: 'upload_failed',
        errorMessage: 'upload file not found',
      },
    });
  }

  updateTask(taskId, {
    preprocess: {
      ...(task.preprocess ?? { status: 'idle' }),
      status: 'processing',
      startedAt: now(),
      completedAt: undefined,
      errorCode: undefined,
      errorMessage: undefined,
    },
  });

  try {
    const current = getTask(taskId);
    if (!current) return undefined;
    const metadata = probeVideo(current);
    if (!metadata) {
      return updateTask(taskId, {
        preprocess: {
          status: 'failed',
          startedAt: current.preprocess?.startedAt,
          completedAt: now(),
          errorCode: 'upload_failed',
          errorMessage: 'failed to read video metadata',
        },
      });
    }

    const validation = validateUploadedVideo(metadata);
    if (validation) {
      return updateTask(taskId, {
        status: 'failed',
        errorCode: validation.errorCode,
        preprocess: {
          status: 'failed',
          startedAt: current.preprocess?.startedAt,
          completedAt: now(),
          errorCode: validation.errorCode,
          errorMessage: validation.errorMessage,
          metadata,
        },
      });
    }

    const artifacts = extractFrames(taskId, current, metadata);
    return updateTask(taskId, {
      preprocess: {
        status: 'completed',
        startedAt: current.preprocess?.startedAt,
        completedAt: now(),
        metadata,
        artifacts,
      },
    });
  } catch (error) {
    const current = getTask(taskId);
    return updateTask(taskId, {
      status: 'failed',
      errorCode: 'upload_failed',
      preprocess: {
        status: 'failed',
        startedAt: current?.preprocess?.startedAt,
        completedAt: now(),
        errorCode: 'upload_failed',
        errorMessage: error instanceof Error ? error.message : 'preprocess execution failed',
      },
    });
  }
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
