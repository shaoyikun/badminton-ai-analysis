import path from 'node:path';
import { PoseAnalysisResult, SegmentSelectionMode, SwingSegmentCandidate } from '../types/task';
import { runJsonCommand } from './commandRunner';

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

export async function estimatePoseForTaskDir(taskDir: string): Promise<PoseAnalysisResult> {
  const pythonBin = process.env.PYTHON_BIN || 'python3';
  const analysisEntry = getAnalysisServiceEntry();
  const resolvedTaskDir = getTaskArtifactsDir(taskDir);
  const parsed = await runJsonCommand<{ result?: PoseAnalysisResult }>(
    pythonBin,
    [analysisEntry, resolvedTaskDir],
    { stage: 'analysis-service pose estimation', timeoutMs: 120_000 },
  );

  if (!parsed.result) {
    throw new Error('analysis-service returned no pose result');
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
  const pythonBin = process.env.PYTHON_BIN || 'python3';
  const analysisEntry = getAnalysisServiceEntry();
  const parsed = await runJsonCommand<{ result?: SwingSegmentDetectionResult }>(
    pythonBin,
    [analysisEntry, 'detect-segments', videoPath],
    { stage: 'analysis-service segment detection', timeoutMs: 120_000 },
  );

  if (!parsed.result?.recommendedSegmentId || !Array.isArray(parsed.result.swingSegments)) {
    throw new Error('analysis-service returned no swing segment detection result');
  }

  return parsed.result;
}
