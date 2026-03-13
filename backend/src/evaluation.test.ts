import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { PoseAnalysisResult } from './types/task';
import type { EvaluationAggregateReport, EvaluationBaselineFile } from './dev/evaluation';
import { evaluateFixtureSuite, getEvaluationGateFailures } from './dev/evaluation';
import { runEvaluateFixturesCli } from './dev/evaluateFixtures';

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
      requiredCoverageTags: ['weak_preparation', 'stable_preparation'],
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
          coverageTags: ['weak_preparation'],
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
          coverageTags: ['stable_preparation'],
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
    assert.deepEqual(report.summary.primaryErrorCodeDistribution, {
      none: 2,
    });
    assert.equal(report.summary.expectationConsistency.dispositionMatchCount, 2);
    assert.equal(report.summary.expectationConsistency.cameraQualityMatchCount, 2);
    assert.deepEqual(report.summary.coverageStatus.required, ['weak_preparation', 'stable_preparation']);
    assert.deepEqual(report.summary.coverageStatus.present, ['stable_preparation', 'weak_preparation']);
    assert.deepEqual(report.summary.coverageStatus.missing, []);
    assert.equal(report.cases[0]?.inputMode, 'pose');
    assert.equal(report.cases[1]?.inputMode, 'preprocess');
    assert.equal(report.cases[0]?.expectationCheck.analysisDispositionMatched, true);
    assert.ok(baseline.fixtures['pose-case']);
    assert.equal(baseline.generatedAt, '2026-03-13T12:00:00.000Z');
  });
});

test('evaluateFixtureSuite enforces declared required coverage tags', async () => {
  await withTempDir(async (workspace) => {
    const fixturesDir = path.join(workspace, 'evaluation', 'fixtures');
    fs.mkdirSync(fixturesDir, { recursive: true });
    const posePath = path.join(fixturesDir, 'pose-case.json');
    fs.writeFileSync(posePath, JSON.stringify(buildPoseResult(), null, 2));

    const indexPath = path.join(fixturesDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
      requiredCoverageTags: ['bad_camera', 'stable_preparation'],
      fixtures: [
        {
          id: 'pose-case',
          actionType: 'clear',
          input: { poseResultPath: './pose-case.json' },
          expected: {
            cameraQuality: 'good',
            majorIssueLabels: [],
            analysisDisposition: 'analyzable',
          },
          coverageTags: ['stable_preparation'],
        },
      ],
    }, null, 2));

    await assert.rejects(
      () => evaluateFixtureSuite({ indexPath }),
      /missing requiredCoverageTags: bad_camera/,
    );
  });
});

test('evaluateFixtureSuite tracks boundary coverage and temporal-noise low-confidence cases', async () => {
  await withTempDir(async (workspace) => {
    const fixturesDir = path.join(workspace, 'evaluation', 'fixtures');
    fs.mkdirSync(fixturesDir, { recursive: true });

    const boundaryPosePath = path.join(fixturesDir, 'boundary-low-confidence.pose.json');
    fs.writeFileSync(boundaryPosePath, JSON.stringify(buildPoseResult({
      usableFrameCount: 5,
      coverageRatio: 0.5,
      medianStabilityScore: 0.62,
      temporalConsistency: 0.45,
      motionContinuity: 0.5,
      rejectionReasons: ['insufficient_pose_coverage'],
      specializedFeatureSummary: {
        sideOnReadinessScore: { median: 0.53, peak: 0.64, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 6 },
        shoulderHipRotationScore: { median: 0.5, peak: 0.61, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 6 },
        trunkCoilScore: { median: 0.49, peak: 0.6, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 6 },
        hittingArmPreparationScore: { median: 0.51, peak: 0.63, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 6 },
        wristAboveShoulderConfidence: { median: 0.48, peak: 0.58, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 6 },
        racketSideElbowHeightScore: { median: 0.47, peak: 0.57, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 6 },
        elbowExtensionScore: { median: 0.45, peak: 0.54, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 6 },
        contactPreparationScore: { median: 0.44, peak: 0.55, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 6 },
      },
      debugCounts: {
        tooSmallCount: 0,
        lowStabilityCount: 0,
        unknownViewCount: 0,
        usableFrameCount: 5,
        detectedFrameCount: 7,
      },
    }), null, 2));

    const temporalNoisePosePath = path.join(fixturesDir, 'temporal-noise-low-confidence.pose.json');
    fs.writeFileSync(temporalNoisePosePath, JSON.stringify(buildPoseResult({
      usableFrameCount: 6,
      coverageRatio: 0.6,
      medianStabilityScore: 0.62,
      scoreVariance: 0.034,
      temporalConsistency: 0.15,
      motionContinuity: 0.44,
      rejectionReasons: ['insufficient_action_evidence'],
      phaseCandidates: {
        preparation: {
          anchorFrameIndex: 6,
          windowStartFrameIndex: 5,
          windowEndFrameIndex: 6,
          score: 0.67,
          sourceMetric: 'contactPreparationScore',
          detectionStatus: 'detected',
        },
        backswing: {
          anchorFrameIndex: 6,
          windowStartFrameIndex: 5,
          windowEndFrameIndex: 6,
          score: 0.69,
          sourceMetric: 'hittingArmPreparationScore',
          detectionStatus: 'detected',
        },
        contactCandidate: {
          anchorFrameIndex: 6,
          windowStartFrameIndex: 6,
          windowEndFrameIndex: 6,
          score: 0.52,
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
        sideOnReadinessScore: { median: 0.58, peak: 0.69, observableFrameCount: 6, observableCoverage: 1, peakFrameIndex: 6 },
        shoulderHipRotationScore: { median: 0.54, peak: 0.66, observableFrameCount: 6, observableCoverage: 1, peakFrameIndex: 6 },
        trunkCoilScore: { median: 0.56, peak: 0.68, observableFrameCount: 4, observableCoverage: 0.6667, peakFrameIndex: 6 },
        hittingArmPreparationScore: { median: 0.55, peak: 0.67, observableFrameCount: 4, observableCoverage: 0.6667, peakFrameIndex: 6 },
        wristAboveShoulderConfidence: { median: 0.53, peak: 0.64, observableFrameCount: 4, observableCoverage: 0.6667, peakFrameIndex: 6 },
        racketSideElbowHeightScore: { median: 0.52, peak: 0.62, observableFrameCount: 4, observableCoverage: 0.6667, peakFrameIndex: 6 },
        elbowExtensionScore: { median: 0.49, peak: 0.59, observableFrameCount: 4, observableCoverage: 0.6667, peakFrameIndex: 6 },
        contactPreparationScore: { median: 0.52, peak: 0.67, observableFrameCount: 3, observableCoverage: 0.5, peakFrameIndex: 6 },
      },
    }), null, 2));

    const severeCoveragePosePath = path.join(fixturesDir, 'severe-coverage-rejected.pose.json');
    fs.writeFileSync(severeCoveragePosePath, JSON.stringify(buildPoseResult({
      usableFrameCount: 4,
      coverageRatio: 0.4,
      medianStabilityScore: 0.58,
      temporalConsistency: 0.32,
      motionContinuity: 0.41,
      rejectionReasons: ['insufficient_pose_coverage'],
      specializedFeatureSummary: {
        sideOnReadinessScore: { median: 0.42, peak: 0.54, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 6 },
        shoulderHipRotationScore: { median: 0.4, peak: 0.51, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 6 },
        trunkCoilScore: { median: 0.39, peak: 0.5, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 6 },
        hittingArmPreparationScore: { median: 0.43, peak: 0.55, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 6 },
        wristAboveShoulderConfidence: { median: 0.4, peak: 0.52, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 6 },
        racketSideElbowHeightScore: { median: 0.39, peak: 0.49, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 6 },
        elbowExtensionScore: { median: 0.37, peak: 0.46, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 6 },
        contactPreparationScore: { median: 0.36, peak: 0.47, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 6 },
      },
      debugCounts: {
        tooSmallCount: 0,
        lowStabilityCount: 1,
        unknownViewCount: 0,
        usableFrameCount: 4,
        detectedFrameCount: 6,
      },
    }), null, 2));

    const indexPath = path.join(fixturesDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
      requiredCoverageTags: ['weak_preparation', 'stable_preparation'],
      fixtures: [
        {
          id: 'boundary-low-confidence',
          actionType: 'clear',
          input: { poseResultPath: './boundary-low-confidence.pose.json' },
          expected: {
            cameraQuality: 'good',
            majorIssueLabels: ['evidence_quality_gap'],
            analysisDisposition: 'low_confidence',
          },
          coverageTags: ['weak_preparation'],
        },
        {
          id: 'temporal-noise-low-confidence',
          actionType: 'clear',
          input: { poseResultPath: './temporal-noise-low-confidence.pose.json' },
          expected: {
            cameraQuality: 'good',
            majorIssueLabels: ['evidence_quality_gap'],
            analysisDisposition: 'low_confidence',
          },
          coverageTags: ['stable_preparation'],
        },
        {
          id: 'severe-coverage-rejected',
          actionType: 'clear',
          input: { poseResultPath: './severe-coverage-rejected.pose.json' },
          expected: {
            cameraQuality: 'good',
            majorIssueLabels: [],
            analysisDisposition: 'rejected',
          },
          coverageTags: ['weak_preparation'],
        },
      ],
    }, null, 2));

    const { report } = await evaluateFixtureSuite({
      indexPath,
      baseline: {
        schemaVersion: 1,
        generatedAt: '2026-03-13T11:00:00.000Z',
        fixtures: {},
      },
      now: () => '2026-03-13T12:00:00.000Z',
    });

    assert.equal(report.summary.totalFixtures, 3);
    assert.deepEqual(report.summary.dispositionDistribution, {
      low_confidence: 2,
      rejected: 1,
    });
    assert.deepEqual(report.summary.primaryErrorCodeDistribution, {
      insufficient_pose_coverage: 2,
      insufficient_action_evidence: 1,
    });
    assert.equal(report.summary.expectationConsistency.dispositionMatchCount, 3);
    assert.equal(report.cases[0]?.actual.analysisDisposition, 'low_confidence');
    assert.deepEqual(report.cases[0]?.actual.lowConfidenceReasons, ['insufficient_pose_coverage']);
    assert.equal(report.cases[2]?.actual.analysisDisposition, 'rejected');
  });
});

test('evaluateFixtureSuite supports shadow smash filtering and action-scoped coverage tags', async () => {
  await withTempDir(async (workspace) => {
    const fixturesDir = path.join(workspace, 'evaluation', 'fixtures');
    fs.mkdirSync(fixturesDir, { recursive: true });

    const clearPosePath = path.join(fixturesDir, 'clear-case.pose.json');
    fs.writeFileSync(clearPosePath, JSON.stringify(buildPoseResult({
      specializedFeatureSummary: {
        sideOnReadinessScore: { median: 0.32, peak: 0.5, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        shoulderHipRotationScore: { median: 0.3, peak: 0.48, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        trunkCoilScore: { median: 0.31, peak: 0.49, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        hittingArmPreparationScore: { median: 0.66, peak: 0.83, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        wristAboveShoulderConfidence: { median: 0.62, peak: 0.78, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        racketSideElbowHeightScore: { median: 0.61, peak: 0.76, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        elbowExtensionScore: { median: 0.59, peak: 0.74, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        contactPreparationScore: { median: 0.58, peak: 0.75, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
      },
    }), null, 2));

    const smashPosePath = path.join(fixturesDir, 'smash-case.pose.json');
    fs.writeFileSync(smashPosePath, JSON.stringify(buildPoseResult({
      phaseCandidates: {
        preparation: {
          anchorFrameIndex: 6,
          windowStartFrameIndex: 5,
          windowEndFrameIndex: 6,
          score: 0.56,
          sourceMetric: 'contactPreparationScore',
          detectionStatus: 'detected',
        },
        backswing: {
          anchorFrameIndex: 6,
          windowStartFrameIndex: 5,
          windowEndFrameIndex: 6,
          score: 0.58,
          sourceMetric: 'hittingArmPreparationScore',
          detectionStatus: 'detected',
        },
        contactCandidate: {
          anchorFrameIndex: 6,
          windowStartFrameIndex: 6,
          windowEndFrameIndex: 6,
          score: 0.61,
          sourceMetric: 'compositeScore',
          detectionStatus: 'detected',
        },
        followThrough: {
          anchorFrameIndex: 7,
          windowStartFrameIndex: 6,
          windowEndFrameIndex: 7,
          score: 0.68,
          sourceMetric: 'postContactMotionScore',
          detectionStatus: 'detected',
        },
      },
      specializedFeatureSummary: {
        sideOnReadinessScore: { median: 0.34, peak: 0.5, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        shoulderHipRotationScore: { median: 0.37, peak: 0.54, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        trunkCoilScore: { median: 0.3, peak: 0.47, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        hittingArmPreparationScore: { median: 0.63, peak: 0.79, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        wristAboveShoulderConfidence: { median: 0.66, peak: 0.82, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        racketSideElbowHeightScore: { median: 0.6, peak: 0.75, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        elbowExtensionScore: { median: 0.61, peak: 0.76, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        contactPreparationScore: { median: 0.57, peak: 0.73, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
      },
      temporalConsistency: 0.76,
      motionContinuity: 0.84,
    }), null, 2));

    const indexPath = path.join(fixturesDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
      requiredCoverageTagsByAction: {
        clear: ['weak_preparation'],
        smash: ['weak_loading'],
      },
      fixtures: [
        {
          id: 'clear-case',
          actionType: 'clear',
          input: { poseResultPath: './clear-case.pose.json' },
          expected: {
            cameraQuality: 'good',
            majorIssueLabels: ['body_preparation_gap'],
            analysisDisposition: 'analyzable',
          },
          coverageTags: ['weak_preparation'],
        },
        {
          id: 'smash-case',
          actionType: 'smash',
          input: { poseResultPath: './smash-case.pose.json' },
          expected: {
            cameraQuality: 'good',
            majorIssueLabels: ['smash_loading_gap'],
            analysisDisposition: 'analyzable',
          },
          coverageTags: ['weak_loading'],
        },
      ],
    }, null, 2));

    const { report } = await evaluateFixtureSuite({
      indexPath,
      actionTypeFilter: 'smash',
      baseline: {
        schemaVersion: 1,
        generatedAt: '2026-03-13T11:00:00.000Z',
        fixtures: {},
      },
      now: () => '2026-03-13T12:00:00.000Z',
    });

    assert.equal(report.summary.totalFixtures, 1);
    assert.equal(report.cases[0]?.actionType, 'smash');
    assert.deepEqual(report.summary.coverageStatus.required, ['weak_loading']);
    assert.deepEqual(report.summary.coverageStatus.present, ['weak_loading']);
    assert.deepEqual(report.summary.coverageStatus.missing, []);
    assert.equal(report.summary.byAction.smash?.totalFixtures, 1);
    assert.deepEqual(report.summary.byAction.smash?.coverageStatus.required, ['weak_loading']);
    assert.equal(report.summary.byAction.clear, undefined);
    assert.deepEqual(report.summary.byAction.smash?.dispositionDistribution, {
      analyzable: 1,
    });
  });
});

test('getEvaluationGateFailures flags missing baseline and drift', () => {
  const report: EvaluationAggregateReport = {
    summary: {
      totalFixtures: 2,
      successCount: 2,
      successRate: 1,
      dispositionDistribution: { analyzable: 2 },
      primaryErrorCodeDistribution: { none: 2 },
      rejectionReasonDistribution: {},
      lowConfidenceDistribution: {},
      expectationConsistency: {
        dispositionMatchCount: 2,
        dispositionMatchRate: 1,
        cameraQualityMatchCount: 2,
        cameraQualityMatchRate: 1,
      },
      coverageStatus: {
        required: ['stable_preparation'],
        present: ['stable_preparation'],
        missing: [],
      },
      issueHit: {
        expectedLabelCount: 1,
        matchedLabelCount: 1,
        hitRate: 1,
        missedCases: [],
      },
      scoreVariance: { count: 2, mean: 0.01, p50: 0.01, min: 0.009, max: 0.011 },
      temporalConsistency: { count: 2, mean: 0.7, p50: 0.7, min: 0.69, max: 0.71 },
      motionContinuity: { count: 2, mean: 0.8, p50: 0.8, min: 0.79, max: 0.81 },
      baselineComparison: {
        missingBaselineCount: 1,
        changedCaseCount: 1,
        changedCases: [
          {
            id: 'pose-case',
            differences: ['missing baseline'],
          },
        ],
      },
      byAction: {
        clear: {
          totalFixtures: 2,
          dispositionDistribution: { analyzable: 2 },
          coverageStatus: {
            required: ['stable_preparation'],
            present: ['stable_preparation'],
            missing: [],
          },
          issueHit: {
            expectedLabelCount: 1,
            matchedLabelCount: 1,
            hitRate: 1,
          },
          baselineComparison: {
            missingBaselineCount: 1,
            changedCaseCount: 1,
          },
        },
      },
    },
    cases: [],
  };

  assert.deepEqual(getEvaluationGateFailures(report), [
    'missing baseline cases: 1',
    'baseline drift detected in 1 case(s)',
  ]);
});

test('runEvaluateFixturesCli exits non-zero when gate failures remain', async () => {
  const output: string[] = [];
  let writeCalls = 0;
  const report = buildMockCliReport({
    baselineComparison: {
      missingBaselineCount: 0,
      changedCaseCount: 1,
      changedCases: [{ id: 'clear-normal', differences: ['totalScore: 78 -> 79'] }],
    },
  });

  const exitCode = await runEvaluateFixturesCli([], {
    evaluateFixtureSuiteImpl: async () => ({
      report,
      baseline: buildMockBaseline(),
      baselinePath: '/tmp/baseline.json',
      indexPath: '/tmp/index.json',
    }),
    writeBaselineFileImpl: () => {
      writeCalls += 1;
    },
    stdout: (message) => {
      output.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(writeCalls, 0);
  assert.match(output.join('\n'), /baselineChangedCases: 1/);
});

test('runEvaluateFixturesCli forwards --action-type to evaluation suite', async () => {
  let forwardedActionType: string | undefined;

  const exitCode = await runEvaluateFixturesCli(['--action-type', 'smash'], {
    evaluateFixtureSuiteImpl: async (options) => {
      forwardedActionType = options?.actionTypeFilter;
      return {
        report: buildMockCliReport(),
        baseline: buildMockBaseline(),
        baselinePath: '/tmp/baseline.json',
        indexPath: '/tmp/index.json',
      };
    },
    writeBaselineFileImpl: () => {},
    stdout: () => {},
  });

  assert.equal(exitCode, 0);
  assert.equal(forwardedActionType, 'smash');
});

test('runEvaluateFixturesCli updates baseline and exits zero with --update-baseline', async () => {
  let wroteBaseline: EvaluationBaselineFile | null = null;

  const exitCode = await runEvaluateFixturesCli(['--update-baseline'], {
    evaluateFixtureSuiteImpl: async () => ({
      report: buildMockCliReport({
        baselineComparison: {
          missingBaselineCount: 1,
          changedCaseCount: 1,
          changedCases: [{ id: 'clear-normal', differences: ['missing baseline'] }],
        },
      }),
      baseline: buildMockBaseline(),
      baselinePath: '/tmp/baseline.json',
      indexPath: '/tmp/index.json',
    }),
    writeBaselineFileImpl: (_baselinePath, baseline) => {
      wroteBaseline = baseline;
    },
    stdout: () => {},
  });

  assert.equal(exitCode, 0);
  assert.ok(wroteBaseline);
});

function buildMockBaseline(): EvaluationBaselineFile {
  return {
    schemaVersion: 1,
    generatedAt: '2026-03-13T12:00:00.000Z',
    fixtures: {},
  };
}

function buildMockCliReport(
  overrides?: Partial<EvaluationAggregateReport['summary']>,
): EvaluationAggregateReport {
  return {
    summary: {
      totalFixtures: 1,
      successCount: 1,
      successRate: 1,
      dispositionDistribution: { analyzable: 1 },
      primaryErrorCodeDistribution: { none: 1 },
      rejectionReasonDistribution: {},
      lowConfidenceDistribution: {},
      expectationConsistency: {
        dispositionMatchCount: 1,
        dispositionMatchRate: 1,
        cameraQualityMatchCount: 1,
        cameraQualityMatchRate: 1,
      },
      coverageStatus: {
        required: ['stable_preparation'],
        present: ['stable_preparation'],
        missing: [],
      },
      issueHit: {
        expectedLabelCount: 0,
        matchedLabelCount: 0,
        hitRate: 0,
        missedCases: [],
      },
      scoreVariance: { count: 1, mean: 0.01, p50: 0.01, min: 0.01, max: 0.01 },
      temporalConsistency: { count: 1, mean: 0.8, p50: 0.8, min: 0.8, max: 0.8 },
      motionContinuity: { count: 1, mean: 0.9, p50: 0.9, min: 0.9, max: 0.9 },
      baselineComparison: {
        missingBaselineCount: 0,
        changedCaseCount: 0,
        changedCases: [],
      },
      byAction: {
        clear: {
          totalFixtures: 1,
          dispositionDistribution: { analyzable: 1 },
          coverageStatus: {
            required: ['stable_preparation'],
            present: ['stable_preparation'],
            missing: [],
          },
          issueHit: {
            expectedLabelCount: 0,
            matchedLabelCount: 0,
            hitRate: 0,
          },
          baselineComparison: {
            missingBaselineCount: 0,
            changedCaseCount: 0,
          },
        },
      },
      ...overrides,
    },
    cases: [],
  };
}
