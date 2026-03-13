import { spawn } from 'node:child_process';
import type { MotionScoreSummary, MotionWindowSummary, SegmentSelectionWindow } from '../types/task';

const MOTION_SCAN_WIDTH = 96;
const MOTION_SCAN_HEIGHT = 96;
const MOTION_SCAN_FPS = 12;
const MOTION_SCAN_TIMEOUT_MS = 20_000;

export type SamplingPlan = {
  strategy: string;
  targetFrameCount: number;
  sampleTimestamps: number[];
  baseSampleTimestamps: number[];
  motionBoostedSampleTimestamps: number[];
  motionWindows: MotionWindowSummary[];
  motionScoreSummary?: MotionScoreSummary;
};

function roundSeconds(value: number) {
  return Number(value.toFixed(3));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function buildUniformSampleTimestampsInWindow(
  startSeconds: number,
  endSeconds: number,
  targetFrameCount: number,
) {
  const normalizedStart = Math.max(0, startSeconds);
  const normalizedEnd = Math.max(normalizedStart, endSeconds);
  const windowDuration = normalizedEnd - normalizedStart;

  if (windowDuration <= 0 || targetFrameCount <= 0) return [];
  if (targetFrameCount === 1) return [roundSeconds(normalizedStart + (windowDuration / 2))];

  const step = windowDuration / (targetFrameCount + 1);
  return Array.from(
    { length: targetFrameCount },
    (_, index) => roundSeconds(normalizedStart + (step * (index + 1))),
  );
}

async function scanMotionSeries(
  sourcePath: string,
  selectedWindow: SegmentSelectionWindow,
): Promise<{ timestamps: number[]; scores: number[] }> {
  const startSeconds = selectedWindow.startTimeMs / 1000;
  const durationSeconds = Math.max(0.18, (selectedWindow.endTimeMs - selectedWindow.startTimeMs) / 1000);
  const args = [
    '-v',
    'error',
    '-ss',
    String(roundSeconds(startSeconds)),
    '-t',
    String(roundSeconds(durationSeconds)),
    '-i',
    sourcePath,
    '-vf',
    `fps=${MOTION_SCAN_FPS},scale=${MOTION_SCAN_WIDTH}:${MOTION_SCAN_HEIGHT}:force_original_aspect_ratio=decrease,pad=${MOTION_SCAN_WIDTH}:${MOTION_SCAN_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=gray`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'gray',
    'pipe:1',
  ];

  const frameSize = MOTION_SCAN_WIDTH * MOTION_SCAN_HEIGHT;

  return await new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('segment motion scan timed out'));
    }, MOTION_SCAN_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
        reject(new Error(stderr || `segment motion scan exited with code ${code}`));
        return;
      }

      const output = Buffer.concat(stdoutChunks);
      const frameCount = Math.floor(output.length / frameSize);
      if (frameCount < 2) {
        resolve({ timestamps: [], scores: [] });
        return;
      }

      const frames = Array.from({ length: frameCount }, (_, index) => (
        output.subarray(index * frameSize, (index + 1) * frameSize)
      ));
      const timestamps = Array.from({ length: frameCount - 1 }, (_, index) => (
        roundSeconds(startSeconds + ((index + 1) / MOTION_SCAN_FPS))
      )).filter((timestamp) => timestamp < (startSeconds + durationSeconds));
      const scores = frames.slice(1).map((frame, index) => {
        const previous = frames[index];
        let totalDiff = 0;
        for (let pixelIndex = 0; pixelIndex < frame.length; pixelIndex += 1) {
          totalDiff += Math.abs(frame[pixelIndex] - previous[pixelIndex]);
        }
        return Number((totalDiff / (frame.length * 255)).toFixed(5));
      }).slice(0, timestamps.length);

      resolve({ timestamps, scores });
    });
  });
}

function summarizeMotionScores(timestamps: number[], scores: number[]): MotionScoreSummary | undefined {
  if (scores.length === 0) {
    return undefined;
  }

  const meanMotionScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const peakMotionScore = Math.max(...scores);
  const peakIndex = scores.findIndex((score) => score === peakMotionScore);

  return {
    scanFrameCount: scores.length,
    meanMotionScore: Number(meanMotionScore.toFixed(5)),
    peakMotionScore: Number(peakMotionScore.toFixed(5)),
    peakTimestampSeconds: timestamps[peakIndex] ?? null,
  };
}

function selectMotionBoostedSamples(
  timestamps: number[],
  scores: number[],
  baseSampleTimestamps: number[],
  targetFrameCount: number,
): { motionBoostedSampleTimestamps: number[]; motionWindows: MotionWindowSummary[] } {
  if (timestamps.length === 0 || scores.length === 0) {
    return { motionBoostedSampleTimestamps: [], motionWindows: [] };
  }

  const meanMotionScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const peakMotionScore = Math.max(...scores);
  const threshold = Math.max(peakMotionScore * 0.58, meanMotionScore * 1.35, 0.012);
  const boostLimit = Math.min(3, Math.max(1, Math.round(targetFrameCount / 4)));
  const minGapSeconds = Math.max(0.1, 0.8 / Math.max(1, MOTION_SCAN_FPS));
  const windowHalfSeconds = Math.max(0.08, minGapSeconds * 0.9);

  const candidateIndexes = scores
    .map((score, index) => ({ score, index }))
    .filter(({ score, index }) => {
      const previous = index > 0 ? scores[index - 1] ?? 0 : 0;
      const next = index < (scores.length - 1) ? scores[index + 1] ?? 0 : 0;
      return score >= threshold && score >= previous && score >= next;
    })
    .sort((left, right) => right.score - left.score);

  const chosen: Array<{ timestamp: number; score: number }> = [];
  for (const candidate of candidateIndexes) {
    const timestamp = timestamps[candidate.index];
    if (timestamp === undefined) continue;

    const tooCloseToUniform = baseSampleTimestamps.some((baseTimestamp) => Math.abs(baseTimestamp - timestamp) < minGapSeconds);
    const tooCloseToBoosted = chosen.some((entry) => Math.abs(entry.timestamp - timestamp) < minGapSeconds);
    if (tooCloseToUniform || tooCloseToBoosted) {
      continue;
    }

    chosen.push({ timestamp, score: candidate.score });
    if (chosen.length >= boostLimit) {
      break;
    }
  }

  const motionBoostedSampleTimestamps = chosen
    .map((entry) => roundSeconds(entry.timestamp))
    .sort((left, right) => left - right);
  const motionWindows = chosen
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((entry) => ({
      startTimeSeconds: roundSeconds(Math.max(0, entry.timestamp - windowHalfSeconds)),
      endTimeSeconds: roundSeconds(entry.timestamp + windowHalfSeconds),
      peakTimestampSeconds: roundSeconds(entry.timestamp),
      peakMotionScore: Number(entry.score.toFixed(5)),
    }));

  return {
    motionBoostedSampleTimestamps,
    motionWindows,
  };
}

export async function buildSegmentSamplingPlan(params: {
  sourcePath: string;
  selectedWindow: SegmentSelectionWindow;
  targetFrameCount: number;
}): Promise<SamplingPlan> {
  const startSeconds = params.selectedWindow.startTimeMs / 1000;
  const endSeconds = params.selectedWindow.endTimeMs / 1000;
  const baseSampleTimestamps = buildUniformSampleTimestampsInWindow(
    startSeconds,
    endSeconds,
    params.targetFrameCount,
  );

  try {
    const motionSeries = await scanMotionSeries(params.sourcePath, params.selectedWindow);
    const motionScoreSummary = summarizeMotionScores(motionSeries.timestamps, motionSeries.scores);
    const motionSelection = selectMotionBoostedSamples(
      motionSeries.timestamps,
      motionSeries.scores,
      baseSampleTimestamps,
      params.targetFrameCount,
    );
    const sampleTimestamps = [...new Set([
      ...baseSampleTimestamps,
      ...motionSelection.motionBoostedSampleTimestamps,
    ])]
      .map((timestamp) => roundSeconds(timestamp))
      .sort((left, right) => left - right);

    return {
      strategy: motionSelection.motionBoostedSampleTimestamps.length > 0
        ? 'segment-aware-motion-boosted-sampling-ffmpeg-v2'
        : 'segment-aware-uniform-sampling-ffmpeg-v2',
      targetFrameCount: params.targetFrameCount,
      sampleTimestamps,
      baseSampleTimestamps,
      motionBoostedSampleTimestamps: motionSelection.motionBoostedSampleTimestamps,
      motionWindows: motionSelection.motionWindows.map((window) => ({
        ...window,
        startTimeSeconds: clamp(window.startTimeSeconds, startSeconds, endSeconds),
        endTimeSeconds: clamp(window.endTimeSeconds, startSeconds, endSeconds),
      })),
      motionScoreSummary,
    };
  } catch {
    return {
      strategy: 'segment-aware-uniform-sampling-ffmpeg-v2',
      targetFrameCount: params.targetFrameCount,
      sampleTimestamps: baseSampleTimestamps,
      baseSampleTimestamps,
      motionBoostedSampleTimestamps: [],
      motionWindows: [],
      motionScoreSummary: undefined,
    };
  }
}
