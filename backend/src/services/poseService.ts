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
    usableFrameCount: result.summary?.usableFrameCount,
    coverageRatio: result.summary?.coverageRatio,
    bestFrameIndex: result.summary?.bestFrameIndex,
    bestPreparationFrameIndex: result.summary?.bestPreparationFrameIndex,
    medianStabilityScore: result.summary?.medianStabilityScore,
    medianBodyTurnScore: result.summary?.medianBodyTurnScore,
    medianRacketArmLiftScore: result.summary?.medianRacketArmLiftScore,
    scoreVariance: result.summary?.scoreVariance,
    temporalConsistency: result.summary?.temporalConsistency,
    motionContinuity: result.summary?.motionContinuity,
    rejectionReasons: result.summary?.rejectionReasons,
    rejectionReasonDetails: result.summary?.rejectionReasonDetails,
    humanSummary: result.summary?.humanSummary,
    viewProfile: result.summary?.viewProfile,
    viewConfidence: result.summary?.viewConfidence,
    viewStability: result.summary?.viewStability,
    dominantRacketSide: result.summary?.dominantRacketSide,
    racketSideConfidence: result.summary?.racketSideConfidence,
    specializedFeatureSummary: result.summary?.specializedFeatureSummary,
    bestFrameOverlayRelativePath: result.summary?.bestFrameOverlayRelativePath,
    overlayFrameCount: result.summary?.overlayFrameCount,
    debugCounts: result.summary?.debugCounts,
  };
}

export function readPoseResult(resultPath?: string) {
  if (!fileExists(resultPath)) return undefined;
  return readJsonFile<PoseAnalysisResult>(resultPath!);
}
