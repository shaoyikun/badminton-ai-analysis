import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  FlowErrorCode,
  PreprocessArtifacts,
  PreprocessFrameItem,
  SegmentSelectionMode,
  SegmentScanSummary,
  SegmentSelectionWindow,
  SwingSegmentCandidate,
  VideoMetadata,
} from '../types/task';
import { uploadConstraints } from './uploadFlowConfig';
import { getPreprocessDir } from './artifactStore';
import { detectSwingSegmentsForVideo, type SwingSegmentDetectionResult } from './analysisService';

const DEFAULT_FRAME_RATE = 25;
const FULL_VIDEO_FALLBACK_SEGMENT_VERSION = 'coarse_motion_scan_v1';
const execFileAsync = promisify(execFile);
type SwingSegmentDetector = (sourcePath: string) => Promise<SwingSegmentDetectionResult>;
let swingSegmentDetector: SwingSegmentDetector = detectSwingSegmentsForVideo;

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

function roundSeconds(value: number) {
  return Number(value.toFixed(3));
}

function buildSampleTimestampsInWindow(startSeconds: number, endSeconds: number, targetFrameCount: number) {
  const normalizedStart = Math.max(0, startSeconds);
  const normalizedEnd = Math.max(normalizedStart, endSeconds);
  const windowDuration = normalizedEnd - normalizedStart;

  if (windowDuration <= 0 || targetFrameCount <= 0) return [];
  if (targetFrameCount === 1) return [roundSeconds(normalizedStart + (windowDuration / 2))];

  const step = windowDuration / (targetFrameCount + 1);
  return Array.from({ length: targetFrameCount }, (_, index) => roundSeconds(normalizedStart + (step * (index + 1))));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getVideoDurationMs(metadata: VideoMetadata) {
  return Math.max(1, Math.round((metadata.durationSeconds ?? 0) * 1000));
}

function buildFallbackSegment(metadata: VideoMetadata): SwingSegmentCandidate {
  const durationMs = getVideoDurationMs(metadata);
  return {
    segmentId: 'segment-01',
    startTimeMs: 0,
    endTimeMs: durationMs,
    startFrame: 1,
    endFrame: Math.max(1, metadata.estimatedFrames ?? Math.round((metadata.durationSeconds ?? 0) * (metadata.frameRate ?? DEFAULT_FRAME_RATE))),
    durationMs,
    motionScore: 0,
    confidence: 0.2,
    rankingScore: 0.2,
    coarseQualityFlags: ['motion_too_weak'],
    detectionSource: 'coarse_motion_scan_v1',
  };
}

function sanitizeSegments(segments: SwingSegmentCandidate[] | undefined, metadata: VideoMetadata) {
  const durationMs = getVideoDurationMs(metadata);
  if (!segments?.length) {
    return [buildFallbackSegment(metadata)];
  }

  return segments.map((segment, index) => {
    const startTimeMs = clamp(Math.round(segment.startTimeMs), 0, durationMs);
    const endTimeMs = clamp(Math.max(startTimeMs + 1, Math.round(segment.endTimeMs)), startTimeMs + 1, durationMs);
    return {
      ...segment,
      segmentId: segment.segmentId || `segment-${String(index + 1).padStart(2, '0')}`,
      startTimeMs,
      endTimeMs,
      durationMs: Math.max(1, endTimeMs - startTimeMs),
      startFrame: segment.startFrame,
      endFrame: segment.endFrame,
      motionScore: Number((segment.motionScore ?? 0).toFixed(4)),
      confidence: Number((segment.confidence ?? 0).toFixed(4)),
      rankingScore: Number((segment.rankingScore ?? 0).toFixed(4)),
      coarseQualityFlags: [...new Set(segment.coarseQualityFlags ?? [])],
      detectionSource: segment.detectionSource ?? 'coarse_motion_scan_v1',
    };
  });
}

function resolveSelectedSegment(
  metadata: VideoMetadata,
  segments: SwingSegmentCandidate[],
  preferredSegmentId?: string,
  fallbackSegmentId?: string,
): {
  selectedSegment: SwingSegmentCandidate;
  recommendedSegmentId: string;
  segmentSelectionMode: SegmentSelectionMode;
} {
  const recommended = segments.find((segment) => segment.segmentId === fallbackSegmentId) ?? segments[0] ?? buildFallbackSegment(metadata);
  const selectedSegment = segments.find((segment) => segment.segmentId === preferredSegmentId) ?? recommended;
  const isFullVideoFallback = selectedSegment.startTimeMs <= 0 && selectedSegment.endTimeMs >= getVideoDurationMs(metadata);

  return {
    selectedSegment,
    recommendedSegmentId: recommended.segmentId,
    segmentSelectionMode: isFullVideoFallback ? 'full_video_fallback' : 'auto_recommended',
  };
}

async function detectSegments(sourcePath: string, metadata: VideoMetadata) {
  try {
    const result = await swingSegmentDetector(sourcePath);
    const swingSegments = sanitizeSegments(result.swingSegments, metadata);
    const selection = resolveSelectedSegment(metadata, swingSegments, result.recommendedSegmentId, result.recommendedSegmentId);
    return {
      segmentDetectionVersion: result.segmentDetectionVersion || FULL_VIDEO_FALLBACK_SEGMENT_VERSION,
      swingSegments,
      ...selection,
    };
  } catch {
    const fallbackSegment = buildFallbackSegment(metadata);
    return {
      segmentDetectionVersion: FULL_VIDEO_FALLBACK_SEGMENT_VERSION,
      swingSegments: [fallbackSegment],
      selectedSegment: fallbackSegment,
      recommendedSegmentId: fallbackSegment.segmentId,
      segmentSelectionMode: 'full_video_fallback' as const,
    };
  }
}

export function setSwingSegmentDetectorForTests(detector?: SwingSegmentDetector) {
  swingSegmentDetector = detector ?? detectSwingSegmentsForVideo;
}

export async function scanVideoSegments(sourcePath: string, metadata: VideoMetadata): Promise<SegmentScanSummary> {
  const { segmentDetectionVersion, swingSegments, recommendedSegmentId, selectedSegment, segmentSelectionMode } = await detectSegments(sourcePath, metadata);
  return {
    status: 'completed',
    segmentDetectionVersion,
    swingSegments,
    recommendedSegmentId,
    selectedSegmentId: selectedSegment.segmentId,
    segmentSelectionMode,
  };
}

function resolveSelectedSegmentFromScan(metadata: VideoMetadata, segmentScan: SegmentScanSummary, preferredSegmentId?: string) {
  return resolveSelectedSegment(
    metadata,
    sanitizeSegments(segmentScan.swingSegments, metadata),
    preferredSegmentId ?? segmentScan.selectedSegmentId ?? segmentScan.recommendedSegmentId,
    segmentScan.recommendedSegmentId,
  );
}

function buildSourceWindow(selectedSegment: SwingSegmentCandidate): SegmentSelectionWindow {
  return {
    startTimeMs: selectedSegment.startTimeMs,
    endTimeMs: selectedSegment.endTimeMs,
    startFrame: selectedSegment.startFrame,
    endFrame: selectedSegment.endFrame,
  };
}

function getTargetFrameCount(durationSeconds: number) {
  return Math.min(12, Math.max(6, Math.round(durationSeconds / 0.18)));
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
      errorCode: 'subject_too_small_or_cropped',
      errorMessage: `video resolution is too small: ${metadata.width ?? 0}x${metadata.height ?? 0}`,
    };
  }

  return null;
}

export async function extractFrames(
  taskId: string,
  sourcePath: string,
  metadata: VideoMetadata,
  segmentScan?: SegmentScanSummary,
): Promise<PreprocessArtifacts> {
  const scan = segmentScan ?? await scanVideoSegments(sourcePath, metadata);
  const {
    selectedSegment,
    recommendedSegmentId,
    segmentSelectionMode,
  } = resolveSelectedSegmentFromScan(metadata, scan, scan.selectedSegmentId);
  const selectedDurationSeconds = Math.max(0.3, selectedSegment.durationMs / 1000);
  const targetFrameCount = getTargetFrameCount(selectedDurationSeconds);
  const sampleTimestamps = buildSampleTimestampsInWindow(
    selectedSegment.startTimeMs / 1000,
    selectedSegment.endTimeMs / 1000,
    targetFrameCount,
  );
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
    segmentDetectionVersion: scan.segmentDetectionVersion,
    swingSegments: scan.swingSegments,
    recommendedSegmentId,
    segmentSelectionMode,
    selectedSegmentId: selectedSegment.segmentId,
    framePlan: {
      strategy: 'segment-aware-uniform-sampling-ffmpeg-v1',
      targetFrameCount,
      sampleTimestamps,
      sourceWindow: buildSourceWindow(selectedSegment),
    },
    sampledFrames,
  };
}
