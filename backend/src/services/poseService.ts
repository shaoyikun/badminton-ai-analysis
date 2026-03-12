import type { PoseAnalysisResult, PoseInfo } from '../types/task';
import { estimatePoseForArtifacts } from './analysisService';
import { fileExists, readJsonFile } from './artifactStore';

export async function runPoseAnalysis(relativeArtifactsDir: string) {
  return estimatePoseForArtifacts(relativeArtifactsDir);
}

export function buildPoseSummary(result: PoseAnalysisResult): PoseInfo['summary'] {
  return {
    engine: result.engine,
    frameCount: result.frameCount,
    detectedFrameCount: result.detectedFrameCount,
    bestFrameIndex: result.summary?.bestFrameIndex,
    humanSummary: result.summary?.humanSummary,
  };
}

export function readPoseResult(resultPath?: string) {
  if (!fileExists(resultPath)) return undefined;
  return readJsonFile<PoseAnalysisResult>(resultPath!);
}
