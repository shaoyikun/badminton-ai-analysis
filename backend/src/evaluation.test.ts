import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { PoseAnalysisResult } from './types/task';
import { evaluateFixtureSuite } from './dev/evaluation';

function withTempDir(run: (workspace: string) => Promise<void>) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-eval-test-'));
  return run(workspace).finally(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });
}

function buildPoseResult(summaryOverrides?: Partial<PoseAnalysisResult['summary']>): PoseAnalysisResult {
  return {
    engine: 'mediapipe-pose',
    frameCount: 12,
    detectedFrameCount: 10,
    summary: {
      bestFrameIndex: 5,
      usableFrameCount: 8,
      coverageRatio: 0.6667,
      medianStabilityScore: 0.78,
      medianBodyTurnScore: 0.52,
      medianRacketArmLiftScore: 0.48,
      scoreVariance: 0.011,
      temporalConsistency: 0.725,
      motionContinuity: 0.88,
      rejectionReasons: [],
      rejectionReasonDetails: [],
      humanSummary: 'fixture',
      viewProfile: 'rear_left_oblique',
      viewConfidence: 0.84,
      viewStability: 0.8,
      dominantRacketSide: 'right',
      racketSideConfidence: 0.71,
      bestPreparationFrameIndex: 6,
      phaseCandidates: {
        preparation: {
          anchorFrameIndex: 6,
          windowStartFrameIndex: 5,
          windowEndFrameIndex: 6,
          score: 0.81,
          sourceMetric: 'contactPreparationScore',
          detectionStatus: 'detected',
        },
        backswing: {
          anchorFrameIndex: 6,
          windowStartFrameIndex: 5,
          windowEndFrameIndex: 6,
          score: 0.83,
          sourceMetric: 'hittingArmPreparationScore',
          detectionStatus: 'detected',
        },
        contactCandidate: {
          anchorFrameIndex: 6,
          windowStartFrameIndex: 6,
          windowEndFrameIndex: 6,
          score: 0.67,
          sourceMetric: 'compositeScore',
          detectionStatus: 'detected',
        },
        followThrough: {
          anchorFrameIndex: null,
          windowStartFrameIndex: null,
          windowEndFrameIndex: null,
          score: null,
          sourceMetric: 'postContactMotionScore',
          detectionStatus: 'missing',
          missingReason: 'no_post_contact_frames',
        },
      },
      specializedFeatureSummary: {
        sideOnReadinessScore: { median: 0.64, peak: 0.82, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        shoulderHipRotationScore: { median: 0.6, peak: 0.78, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        trunkCoilScore: { median: 0.65, peak: 0.8, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        hittingArmPreparationScore: { median: 0.66, peak: 0.83, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        wristAboveShoulderConfidence: { median: 0.62, peak: 0.78, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        racketSideElbowHeightScore: { median: 0.61, peak: 0.76, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        elbowExtensionScore: { median: 0.59, peak: 0.74, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        contactPreparationScore: { median: 0.63, peak: 0.81, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
      },
      debugCounts: {
        tooSmallCount: 0,
        lowStabilityCount: 0,
        unknownViewCount: 0,
        usableFrameCount: 8,
        detectedFrameCount: 10,
      },
      ...summaryOverrides,
    },
    frames: [],
  };
}

test('evaluateFixtureSuite supports poseResultPath and preprocessDir inputs', async () => {
  await withTempDir(async (workspace) => {
    const fixturesDir = path.join(workspace, 'evaluation', 'fixtures');
    const preprocessDir = path.join(fixturesDir, 'preprocess-case');
    fs.mkdirSync(preprocessDir, { recursive: true });
    fs.writeFileSync(path.join(preprocessDir, 'manifest.json'), JSON.stringify({
      normalizedFileName: 'clip.mp4',
      metadataExtractedAt: '2026-03-13T10:00:00.000Z',
      artifactsDir: 'artifacts/tasks/task_eval/preprocess',
      manifestPath: 'artifacts/tasks/task_eval/preprocess/manifest.json',
      framePlan: {
        strategy: 'uniform-sampling-ffmpeg-v1',
        targetFrameCount: 2,
        sampleTimestamps: [1.2, 2.4],
      },
      sampledFrames: [
        { index: 1, timestampSeconds: 1.2, fileName: 'frame-01.jpg', relativePath: 'artifacts/tasks/task_eval/preprocess/frame-01.jpg' },
        { index: 2, timestampSeconds: 2.4, fileName: 'frame-02.jpg', relativePath: 'artifacts/tasks/task_eval/preprocess/frame-02.jpg' },
      ],
    }, null, 2));

    const posePath = path.join(fixturesDir, 'pose-case.json');
    fs.writeFileSync(posePath, JSON.stringify(buildPoseResult({
      specializedFeatureSummary: {
        sideOnReadinessScore: { median: 0.34, peak: 0.5, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        shoulderHipRotationScore: { median: 0.31, peak: 0.44, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        trunkCoilScore: { median: 0.33, peak: 0.48, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        hittingArmPreparationScore: { median: 0.66, peak: 0.83, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        wristAboveShoulderConfidence: { median: 0.62, peak: 0.78, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        racketSideElbowHeightScore: { median: 0.61, peak: 0.76, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        elbowExtensionScore: { median: 0.59, peak: 0.74, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        contactPreparationScore: { median: 0.63, peak: 0.81, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
      },
    }), null, 2));

    const indexPath = path.join(fixturesDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
      fixtures: [
        {
          id: 'pose-case',
          actionType: 'clear',
          input: { poseResultPath: './pose-case.json' },
          expected: {
            cameraQuality: 'good',
            majorIssueLabels: ['body_preparation_gap'],
            analysisDisposition: 'analyzable',
          },
        },
        {
          id: 'preprocess-case',
          actionType: 'clear',
          input: { preprocessDir: './preprocess-case' },
          expected: {
            cameraQuality: 'good',
            majorIssueLabels: [],
            analysisDisposition: 'analyzable',
          },
        },
      ],
    }, null, 2));

    const { report, baseline } = await evaluateFixtureSuite({
      indexPath,
      estimatePoseForPreprocessDir: async () => buildPoseResult(),
      now: () => '2026-03-13T12:00:00.000Z',
      baseline: {
        schemaVersion: 1,
        generatedAt: '2026-03-13T11:00:00.000Z',
        fixtures: {},
      },
    });

    assert.equal(report.summary.totalFixtures, 2);
    assert.equal(report.summary.successCount, 2);
    assert.equal(report.summary.baselineComparison.missingBaselineCount, 2);
    assert.equal(report.cases[0]?.inputMode, 'pose');
    assert.equal(report.cases[1]?.inputMode, 'preprocess');
    assert.equal(report.cases[0]?.expectationCheck.analysisDispositionMatched, true);
    assert.ok(baseline.fixtures['pose-case']);
    assert.equal(baseline.generatedAt, '2026-03-13T12:00:00.000Z');
  });
});
