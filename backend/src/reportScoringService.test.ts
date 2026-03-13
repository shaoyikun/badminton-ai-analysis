import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisTaskRecord, PoseAnalysisResult } from './types/task';
import { buildRuleBasedResult, getPoseQualityFailure } from './services/reportScoringService';
import { buildPoseSummary } from './services/poseService';

function buildTask(): AnalysisTaskRecord {
  const now = new Date().toISOString();
  return {
    taskId: 'task_report_test',
    actionType: 'clear',
    status: 'processing',
    stage: 'generating_report',
    progressPercent: 90,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    artifacts: {
      preprocess: {
        status: 'completed',
        artifacts: {
          normalizedFileName: 'clip.mp4',
          metadataExtractedAt: now,
          artifactsDir: 'artifacts/tasks/task_report_test/preprocess',
          manifestPath: 'artifacts/tasks/task_report_test/preprocess/manifest.json',
          framePlan: {
            strategy: 'uniform-sampling-ffmpeg-v1',
            targetFrameCount: 2,
            sampleTimestamps: [1.2, 2.4],
          },
          sampledFrames: [
            {
              index: 5,
              timestampSeconds: 1.2,
              fileName: 'frame-05.jpg',
              relativePath: 'artifacts/tasks/task_report_test/preprocess/frame-05.jpg',
            },
            {
              index: 6,
              timestampSeconds: 2.4,
              fileName: 'frame-06.jpg',
              relativePath: 'artifacts/tasks/task_report_test/preprocess/frame-06.jpg',
            },
          ],
        },
      },
    },
  };
}

function buildSpecializedSummary(
  overrides?: Partial<NonNullable<PoseAnalysisResult['summary']['specializedFeatureSummary']>>,
): NonNullable<PoseAnalysisResult['summary']['specializedFeatureSummary']> {
  return {
    sideOnReadinessScore: {
      median: 0.64,
      peak: 0.82,
      observableFrameCount: 8,
      observableCoverage: 1,
      peakFrameIndex: 6,
    },
    shoulderHipRotationScore: {
      median: 0.6,
      peak: 0.78,
      observableFrameCount: 8,
      observableCoverage: 1,
      peakFrameIndex: 6,
    },
    trunkCoilScore: {
      median: 0.65,
      peak: 0.8,
      observableFrameCount: 8,
      observableCoverage: 1,
      peakFrameIndex: 6,
    },
    hittingArmPreparationScore: {
      median: 0.66,
      peak: 0.83,
      observableFrameCount: 8,
      observableCoverage: 1,
      peakFrameIndex: 6,
    },
    wristAboveShoulderConfidence: {
      median: 0.62,
      peak: 0.78,
      observableFrameCount: 8,
      observableCoverage: 1,
      peakFrameIndex: 6,
    },
    racketSideElbowHeightScore: {
      median: 0.61,
      peak: 0.76,
      observableFrameCount: 8,
      observableCoverage: 1,
      peakFrameIndex: 6,
    },
    elbowExtensionScore: {
      median: 0.59,
      peak: 0.74,
      observableFrameCount: 8,
      observableCoverage: 1,
      peakFrameIndex: 6,
    },
    contactPreparationScore: {
      median: 0.63,
      peak: 0.81,
      observableFrameCount: 8,
      observableCoverage: 1,
      peakFrameIndex: 6,
    },
    ...overrides,
  };
}

function buildPoseResult(summaryOverrides?: Partial<PoseAnalysisResult['summary']>): PoseAnalysisResult {
  const specializedFeatureSummary = summaryOverrides?.specializedFeatureSummary === undefined
    ? buildSpecializedSummary()
    : {
      ...buildSpecializedSummary(),
      ...summaryOverrides.specializedFeatureSummary,
    };

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
      rejectionReasons: [],
      rejectionReasonDetails: [],
      humanSummary: '本次基于 8/12 帧稳定识别结果生成：已经能看到较稳定的侧身展开和挥拍臂上举。',
      viewProfile: 'rear_left_oblique',
      viewConfidence: 0.84,
      viewStability: 0.75,
      dominantRacketSide: 'right',
      racketSideConfidence: 0.71,
      bestPreparationFrameIndex: 6,
      specializedFeatureSummary,
      bestFrameOverlayRelativePath: 'artifacts/tasks/task_report_test/pose/overlays/frame-05-overlay.jpg',
      overlayFrameCount: 1,
      debugCounts: {
        tooSmallCount: 0,
        lowStabilityCount: 0,
        unknownViewCount: 0,
        usableFrameCount: 8,
        detectedFrameCount: 10,
      },
      ...summaryOverrides,
    },
    frames: [
      {
        frameIndex: 5,
        fileName: 'frame-05.jpg',
        status: 'usable',
        keypoints: [],
        metrics: null,
        overlayRelativePath: 'artifacts/tasks/task_report_test/pose/overlays/frame-05-overlay.jpg',
        viewProfile: 'rear_left_oblique',
        dominantRacketSide: 'right',
      },
      {
        frameIndex: 6,
        fileName: 'frame-06.jpg',
        status: 'detected',
        keypoints: [],
        metrics: null,
        viewProfile: 'rear_left_oblique',
        dominantRacketSide: 'right',
      },
    ],
  };
}

test('getPoseQualityFailure returns the first hard rejection reason only', () => {
  const result = buildPoseResult({
    rejectionReasons: ['invalid_camera_angle', 'insufficient_pose_coverage'],
    usableFrameCount: 4,
    coverageRatio: 0.3333,
  });

  const failure = getPoseQualityFailure(result);

  assert.deepEqual(failure, {
    code: 'insufficient_pose_coverage',
    message: 'stable pose coverage is below the minimum report threshold',
  });
});

test('buildPoseSummary keeps specialized summary fields for downstream consumers', () => {
  const summary = buildPoseSummary(buildPoseResult());

  assert.equal(summary?.bestPreparationFrameIndex, 6);
  assert.deepEqual(summary?.specializedFeatureSummary?.contactPreparationScore, {
    median: 0.63,
    peak: 0.81,
    observableFrameCount: 8,
    observableCoverage: 1,
    peakFrameIndex: 6,
  });
});

test('buildRuleBasedResult produces high-confidence report for a high-quality sample', () => {
  const report = buildRuleBasedResult(buildTask(), buildPoseResult());

  assert.equal(report.totalScore, 73);
  assert.equal(report.confidenceScore, 85);
  assert.equal(report.scoringEvidence?.analysisDisposition, 'analyzable');
  assert.deepEqual(report.dimensionScores.map((item) => item.name), [
    '证据质量',
    '身体准备',
    '挥拍臂准备',
    '挥拍复现稳定性',
  ]);
  assert.deepEqual(report.scoringEvidence?.dimensionScoresByKey, {
    evidence_quality: 79,
    body_preparation: 72,
    racket_arm_preparation: 72,
    swing_repeatability: 76,
  });
  assert.equal(report.scoringEvidence?.cameraSuitability, 89);
  assert.equal(report.scoringEvidence?.confidenceBreakdown?.finalConfidenceScore, 85);
  assert.deepEqual(report.evidenceNotes, []);
  assert.equal(report.scoringEvidence?.fallbacksUsed?.length, 0);
  assert.equal(report.visualEvidence?.bestFrameImagePath, 'artifacts/tasks/task_report_test/preprocess/frame-05.jpg');
  assert.equal(report.visualEvidence?.bestFrameOverlayPath, 'artifacts/tasks/task_report_test/pose/overlays/frame-05-overlay.jpg');
});

test('buildRuleBasedResult treats poor camera angle as low confidence instead of hard rejection when still analyzable', () => {
  const poseResult = buildPoseResult({
    viewProfile: 'front',
    viewConfidence: 0.6,
    viewStability: 0.58,
    rejectionReasons: ['invalid_camera_angle'],
    debugCounts: {
      tooSmallCount: 0,
      lowStabilityCount: 0,
      unknownViewCount: 4,
      usableFrameCount: 8,
      detectedFrameCount: 10,
    },
  });

  const report = buildRuleBasedResult(buildTask(), poseResult);

  assert.equal(getPoseQualityFailure(poseResult), null);
  assert.equal(report.totalScore, 73);
  assert.equal(report.confidenceScore, 76);
  assert.equal(report.scoringEvidence?.analysisDisposition, 'analyzable');
  assert.equal(report.scoringEvidence?.cameraSuitability, 58);
  assert.match(report.evidenceNotes?.[0] ?? '', /机位降低了置信度/);
});

test('buildRuleBasedResult keeps jitter-heavy sample analyzable but lowers repeatability confidence', () => {
  const poseResult = buildPoseResult({
    scoreVariance: 0.031,
    coverageRatio: 0.75,
    specializedFeatureSummary: buildSpecializedSummary({
      contactPreparationScore: {
        median: 0.56,
        peak: 0.74,
        observableFrameCount: 7,
        observableCoverage: 0.875,
        peakFrameIndex: 6,
      },
    }),
  });

  const report = buildRuleBasedResult(buildTask(), poseResult);

  assert.equal(getPoseQualityFailure(poseResult), null);
  assert.ok((report.scoringEvidence?.dimensionScoresByKey?.swing_repeatability ?? 0) < 70);
  assert.ok((report.confidenceScore ?? 0) >= 70);
  assert.ok(report.evidenceNotes?.some((note) => note.includes('复现证据偏散')));
});

test('buildRuleBasedResult records fallback usage when new specialized features are unavailable', () => {
  const report = buildRuleBasedResult(buildTask(), buildPoseResult({
    specializedFeatureSummary: {
      sideOnReadinessScore: {
        median: null,
        peak: null,
        observableFrameCount: 0,
        observableCoverage: 0,
        peakFrameIndex: null,
      },
      shoulderHipRotationScore: {
        median: null,
        peak: null,
        observableFrameCount: 0,
        observableCoverage: 0,
        peakFrameIndex: null,
      },
      trunkCoilScore: {
        median: null,
        peak: null,
        observableFrameCount: 0,
        observableCoverage: 0,
        peakFrameIndex: null,
      },
      hittingArmPreparationScore: {
        median: null,
        peak: null,
        observableFrameCount: 0,
        observableCoverage: 0,
        peakFrameIndex: null,
      },
      wristAboveShoulderConfidence: {
        median: null,
        peak: null,
        observableFrameCount: 0,
        observableCoverage: 0,
        peakFrameIndex: null,
      },
      racketSideElbowHeightScore: {
        median: null,
        peak: null,
        observableFrameCount: 0,
        observableCoverage: 0,
        peakFrameIndex: null,
      },
      elbowExtensionScore: {
        median: null,
        peak: null,
        observableFrameCount: 0,
        observableCoverage: 0,
        peakFrameIndex: null,
      },
      contactPreparationScore: {
        median: null,
        peak: null,
        observableFrameCount: 0,
        observableCoverage: 0,
        peakFrameIndex: null,
      },
    },
  }));

  assert.deepEqual(report.scoringEvidence?.fallbacksUsed, [
    'medianBodyTurnScore_fallback',
    'medianRacketArmLiftScore_fallback',
    'contactPreparationScore_fallback',
  ]);
  assert.ok((report.confidenceScore ?? 0) < 70);
  assert.equal(report.scoringEvidence?.analysisDisposition, 'low_confidence');
});

test('hard rejection sample remains not analyzable', () => {
  const poseResult = buildPoseResult({
    rejectionReasons: ['body_not_detected'],
  });

  const failure = getPoseQualityFailure(poseResult);

  assert.deepEqual(failure, {
    code: 'body_not_detected',
    message: 'body was not detected reliably enough to generate a report',
  });
});
