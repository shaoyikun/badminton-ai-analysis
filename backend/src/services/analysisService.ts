import path from 'node:path';
import { PoseAnalysisResult, SegmentSelectionMode, SwingSegmentCandidate } from '../types/task';
import { CommandExecutionError, runJsonCommand } from './commandRunner';
import { runWithAnalysisServiceLimit } from './analysisServiceRunner';

function getAnalysisServiceEntry() {
  const repoRoot = path.resolve(process.cwd(), '..');
  return path.join(repoRoot, 'analysis-service', 'app.py');
}

function getTaskArtifactsDir(relativeArtifactsDir: string) {
  if (path.isAbsolute(relativeArtifactsDir)) {
    return relativeArtifactsDir;
  }
  return path.join(process.cwd(), relativeArtifactsDir);
}

type RunJsonCommand = typeof runJsonCommand;

let runJsonCommandImpl: RunJsonCommand = runJsonCommand;

export class AnalysisServiceExecutionError extends Error {
  readonly failureKind: 'timeout' | 'invalid_json' | 'non_zero_exit' | 'missing_result' | 'spawn_error';
  readonly stage: 'pose' | 'segment_detection';

  constructor(params: {
    stage: 'pose' | 'segment_detection';
    failureKind: 'timeout' | 'invalid_json' | 'non_zero_exit' | 'missing_result' | 'spawn_error';
    message: string;
  }) {
    super(params.message);
    this.name = 'AnalysisServiceExecutionError';
    this.failureKind = params.failureKind;
    this.stage = params.stage;
  }
}

function mapAnalysisServiceError(
  error: unknown,
  stage: 'pose' | 'segment_detection',
) {
  if (error instanceof AnalysisServiceExecutionError) {
    return error;
  }

  if (error instanceof CommandExecutionError) {
    return new AnalysisServiceExecutionError({
      stage,
      failureKind: error.failureKind,
      message: `${stage === 'pose' ? 'analysis-service pose estimation' : 'analysis-service segment detection'} ${error.failureKind.replace(/_/g, ' ')}: ${error.message}`,
    });
  }

  return new AnalysisServiceExecutionError({
    stage,
    failureKind: 'spawn_error',
    message: `${stage === 'pose' ? 'analysis-service pose estimation' : 'analysis-service segment detection'} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  });
}

async function runAnalysisServiceJson<T>(
  stage: 'pose' | 'segment_detection',
  args: string[],
) {
  const pythonBin = process.env.PYTHON_BIN || 'python3';
  const analysisEntry = getAnalysisServiceEntry();
  try {
    return await runWithAnalysisServiceLimit(async () => (
      runJsonCommandImpl<T>(
        pythonBin,
        [analysisEntry, ...args],
        {
          stage: stage === 'pose' ? 'analysis-service pose estimation' : 'analysis-service segment detection',
          timeoutMs: 120_000,
        },
      )
    ));
  } catch (error) {
    throw mapAnalysisServiceError(error, stage);
  }
}

export async function estimatePoseForTaskDir(taskDir: string): Promise<PoseAnalysisResult> {
  const resolvedTaskDir = getTaskArtifactsDir(taskDir);
  const parsed = await runAnalysisServiceJson<{ result?: PoseAnalysisResult }>('pose', [resolvedTaskDir]);

  if (!parsed.result) {
    throw new AnalysisServiceExecutionError({
      stage: 'pose',
      failureKind: 'missing_result',
      message: 'analysis-service pose estimation returned no pose result',
    });
  }

  return parsed.result;
}

export async function estimatePoseForArtifacts(relativeArtifactsDir: string): Promise<PoseAnalysisResult> {
  return estimatePoseForTaskDir(relativeArtifactsDir);
}

export interface SwingSegmentDetectionResult {
  segmentDetectionVersion: string;
  segmentSelectionMode: SegmentSelectionMode;
  recommendedSegmentId: string;
  swingSegments: SwingSegmentCandidate[];
}

export async function detectSwingSegmentsForVideo(videoPath: string): Promise<SwingSegmentDetectionResult> {
  const parsed = await runAnalysisServiceJson<{ result?: SwingSegmentDetectionResult }>('segment_detection', ['detect-segments', videoPath]);

  if (!parsed.result?.recommendedSegmentId || !Array.isArray(parsed.result.swingSegments)) {
    throw new AnalysisServiceExecutionError({
      stage: 'segment_detection',
      failureKind: 'missing_result',
      message: 'analysis-service segment detection returned no swing segment detection result',
    });
  }

  return parsed.result;
}

export function setRunJsonCommandForTests(runner?: RunJsonCommand) {
  runJsonCommandImpl = runner ?? runJsonCommand;
}
