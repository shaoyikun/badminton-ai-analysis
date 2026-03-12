import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { FlowErrorCode, PreprocessArtifacts, PreprocessFrameItem, VideoMetadata } from '../types/task';
import { uploadConstraints } from './uploadFlowConfig';
import { getPreprocessDir } from './artifactStore';

const DEFAULT_FRAME_RATE = 25;
const execFileAsync = promisify(execFile);

function now() {
  return new Date().toISOString();
}

export function getMaxFileSizeBytes() {
  const configured = Number(process.env.UPLOAD_MAX_FILE_SIZE_BYTES ?? uploadConstraints.defaultMaxFileSizeBytes);
  if (!Number.isFinite(configured) || configured <= 0) {
    return uploadConstraints.defaultMaxFileSizeBytes;
  }
  return Math.round(configured);
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function clearDir(target: string) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
}

function buildSampleTimestamps(durationSeconds: number, targetFrameCount: number) {
  if (durationSeconds <= 0 || targetFrameCount <= 0) return [];
  if (targetFrameCount === 1) return [Number((durationSeconds / 2).toFixed(2))];
  const step = durationSeconds / (targetFrameCount + 1);
  return Array.from({ length: targetFrameCount }, (_, index) => Number((step * (index + 1)).toFixed(2)));
}

async function runCommand(command: string, args: string[]) {
  const { stdout } = await execFileAsync(command, args, {
    encoding: 'utf8',
  });
  return stdout.trim();
}

export async function probeVideo(sourcePath: string, metadata: Pick<VideoMetadata, 'fileName' | 'mimeType'>): Promise<VideoMetadata> {
  const stat = fs.statSync(sourcePath);
  const extension = path.extname(metadata.fileName).toLowerCase();

  const probeOutput = await runCommand('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,r_frame_rate,avg_frame_rate,duration,nb_frames:format=duration',
    '-of',
    'json',
    sourcePath,
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
    fileName: metadata.fileName,
    fileSizeBytes: stat.size,
    mimeType: metadata.mimeType,
    extension,
    durationSeconds: Number(durationSeconds.toFixed(2)),
    estimatedFrames,
    width: stream.width,
    height: stream.height,
    frameRate,
    metadataSource: 'ffprobe',
  };
}

export function validateUploadedVideo(metadata: VideoMetadata): { errorCode: FlowErrorCode; errorMessage: string } | null {
  if (!uploadConstraints.supportedExtensions.includes(metadata.extension ?? '')) {
    return {
      errorCode: 'unsupported_file_type',
      errorMessage: `unsupported video extension: ${metadata.extension ?? 'unknown'}`,
    };
  }

  if (metadata.fileSizeBytes < uploadConstraints.minFileSizeBytes) {
    return {
      errorCode: 'upload_failed',
      errorMessage: 'video file is too small to analyze reliably',
    };
  }

  if (metadata.fileSizeBytes > getMaxFileSizeBytes()) {
    return {
      errorCode: 'upload_failed',
      errorMessage: 'video file is too large for current upload limits',
    };
  }

  if (
    (metadata.durationSeconds ?? 0) < uploadConstraints.minDurationSeconds
    || (metadata.durationSeconds ?? 0) > uploadConstraints.maxDurationSeconds
  ) {
    return {
      errorCode: 'invalid_duration',
      errorMessage: `video duration should be between ${uploadConstraints.minDurationSeconds} and ${uploadConstraints.maxDurationSeconds} seconds`,
    };
  }

  if ((metadata.width ?? 0) < uploadConstraints.minWidth || (metadata.height ?? 0) < uploadConstraints.minHeight) {
    return {
      errorCode: 'poor_lighting_or_occlusion',
      errorMessage: `video resolution is too small: ${metadata.width ?? 0}x${metadata.height ?? 0}`,
    };
  }

  return null;
}

export async function extractFrames(taskId: string, sourcePath: string, metadata: VideoMetadata): Promise<PreprocessArtifacts> {
  const targetFrameCount = Math.min(12, Math.max(6, Math.round((metadata.durationSeconds ?? 6) / 1.2)));
  const sampleTimestamps = buildSampleTimestamps(metadata.durationSeconds ?? 6, targetFrameCount);
  const artifactsDir = getPreprocessDir(taskId);
  clearDir(artifactsDir);

  const sampledFrames: PreprocessFrameItem[] = [];
  for (const [index, timestamp] of sampleTimestamps.entries()) {
    const frameFileName = `frame-${String(index + 1).padStart(2, '0')}.jpg`;
    const fullPath = path.join(artifactsDir, frameFileName);
    const relativePath = path.posix.join('artifacts', 'tasks', taskId, 'preprocess', frameFileName);

    await runCommand('ffmpeg', [
      '-y',
      '-ss',
      String(timestamp),
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      fullPath,
    ]);

    sampledFrames.push({
      index: index + 1,
      timestampSeconds: timestamp,
      fileName: frameFileName,
      relativePath,
    });
  }

  return {
    normalizedFileName: sanitizeFileName(metadata.fileName),
    metadataExtractedAt: now(),
    artifactsDir: path.posix.join('artifacts', 'tasks', taskId, 'preprocess'),
    manifestPath: path.posix.join('artifacts', 'tasks', taskId, 'preprocess', 'manifest.json'),
    framePlan: {
      strategy: 'uniform-sampling-ffmpeg-v1',
      targetFrameCount,
      sampleTimestamps,
    },
    sampledFrames,
  };
}
