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
  const phaseCandidates = summaryOverrides?.phaseCandidates ?? {
    preparation: {
      anchorFrameIndex: 6,
      windowStartFrameIndex: 5,
      windowEndFrameIndex: 6,
      score: 0.81,
      sourceMetric: 'contactPreparationScore',
      detectionStatus: 'detected' as const,
    },
    backswing: {
      anchorFrameIndex: 6,
      windowStartFrameIndex: 5,
      windowEndFrameIndex: 6,
      score: 0.83,
      sourceMetric: 'hittingArmPreparationScore',
      detectionStatus: 'detected' as const,
    },
    contactCandidate: {
      anchorFrameIndex: 6,
      windowStartFrameIndex: 6,
      windowEndFrameIndex: 6,
      score: 0.67,
      sourceMetric: 'compositeScore',
      detectionStatus: 'detected' as const,
    },
    followThrough: {
      anchorFrameIndex: 7,
      windowStartFrameIndex: 6,
      windowEndFrameIndex: 7,
      score: 0.88,
      sourceMetric: 'postContactMotionScore',
      detectionStatus: 'detected' as const,
    },
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
      temporalConsistency: 0.725,
      motionContinuity: 0.88,
      rejectionReasons: [],
      rejectionReasonDetails: [],
      humanSummary: '本次基于 8/12 帧稳定识别结果生成：已经能看到较稳定的侧身展开和挥拍臂上举。',
      viewProfile: 'rear_left_oblique',
      viewConfidence: 0.84,
      viewStability: 0.75,
      dominantRacketSide: 'right',
      racketSideConfidence: 0.71,
      bestPreparationFrameIndex: 6,
      phaseCandidates,
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

function buildBoundaryCoveragePoseResult() {
  return buildPoseResult({
    usableFrameCount: 5,
    coverageRatio: 0.5,
    medianStabilityScore: 0.62,
    temporalConsistency: 0.5,
    motionContinuity: 0.58,
    rejectionReasons: ['insufficient_pose_coverage'],
    phaseCandidates: {
      preparation: {
        anchorFrameIndex: 6,
        windowStartFrameIndex: 5,
        windowEndFrameIndex: 6,
        score: 0.55,
        sourceMetric: 'contactPreparationScore',
        detectionStatus: 'detected',
      },
      backswing: {
        anchorFrameIndex: 6,
        windowStartFrameIndex: 5,
        windowEndFrameIndex: 6,
        score: 0.57,
        sourceMetric: 'hittingArmPreparationScore',
        detectionStatus: 'detected',
      },
      contactCandidate: {
        anchorFrameIndex: 6,
        windowStartFrameIndex: 6,
        windowEndFrameIndex: 6,
        score: 0.55,
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
    specializedFeatureSummary: buildSpecializedSummary({
      sideOnReadinessScore: {
        median: 0.53,
        peak: 0.64,
        observableFrameCount: 5,
        observableCoverage: 0.5,
        peakFrameIndex: 6,
      },
      shoulderHipRotationScore: {
        median: 0.5,
        peak: 0.61,
        observableFrameCount: 5,
        observableCoverage: 0.5,
        peakFrameIndex: 6,
      },
      trunkCoilScore: {
        median: 0.49,
        peak: 0.6,
        observableFrameCount: 5,
        observableCoverage: 0.5,
        peakFrameIndex: 6,
      },
      hittingArmPreparationScore: {
        median: 0.51,
        peak: 0.63,
        observableFrameCount: 5,
        observableCoverage: 0.5,
        peakFrameIndex: 6,
      },
      wristAboveShoulderConfidence: {
        median: 0.48,
        peak: 0.58,
        observableFrameCount: 5,
        observableCoverage: 0.5,
        peakFrameIndex: 6,
      },
      racketSideElbowHeightScore: {
        median: 0.47,
        peak: 0.57,
        observableFrameCount: 5,
        observableCoverage: 0.5,
        peakFrameIndex: 6,
      },
      elbowExtensionScore: {
        median: 0.45,
        peak: 0.54,
        observableFrameCount: 5,
        observableCoverage: 0.5,
        peakFrameIndex: 6,
      },
      contactPreparationScore: {
        median: 0.44,
        peak: 0.55,
        observableFrameCount: 5,
        observableCoverage: 0.5,
        peakFrameIndex: 6,
      },
    }),
    debugCounts: {
      tooSmallCount: 0,
      lowStabilityCount: 0,
      unknownViewCount: 0,
      usableFrameCount: 5,
      detectedFrameCount: 7,
    },
  });
}

function buildSevereCoveragePoseResult() {
  return buildPoseResult({
    usableFrameCount: 4,
    coverageRatio: 0.4,
    medianStabilityScore: 0.58,
    temporalConsistency: 0.32,
    motionContinuity: 0.41,
    rejectionReasons: ['insufficient_pose_coverage'],
    specializedFeatureSummary: buildSpecializedSummary({
      sideOnReadinessScore: {
        median: 0.42,
        peak: 0.54,
        observableFrameCount: 4,
        observableCoverage: 0.4,
        peakFrameIndex: 6,
      },
      shoulderHipRotationScore: {
        median: 0.4,
        peak: 0.51,
        observableFrameCount: 4,
        observableCoverage: 0.4,
        peakFrameIndex: 6,
      },
      trunkCoilScore: {
        median: 0.39,
        peak: 0.5,
        observableFrameCount: 4,
        observableCoverage: 0.4,
        peakFrameIndex: 6,
      },
      hittingArmPreparationScore: {
        median: 0.43,
        peak: 0.55,
        observableFrameCount: 4,
        observableCoverage: 0.4,
        peakFrameIndex: 6,
      },
      wristAboveShoulderConfidence: {
        median: 0.4,
        peak: 0.52,
        observableFrameCount: 4,
        observableCoverage: 0.4,
        peakFrameIndex: 6,
      },
      racketSideElbowHeightScore: {
        median: 0.39,
        peak: 0.49,
        observableFrameCount: 4,
        observableCoverage: 0.4,
        peakFrameIndex: 6,
      },
      elbowExtensionScore: {
        median: 0.37,
        peak: 0.46,
        observableFrameCount: 4,
        observableCoverage: 0.4,
        peakFrameIndex: 6,
      },
      contactPreparationScore: {
        median: 0.36,
        peak: 0.47,
        observableFrameCount: 4,
        observableCoverage: 0.4,
        peakFrameIndex: 6,
      },
    }),
    debugCounts: {
      tooSmallCount: 0,
      lowStabilityCount: 1,
      unknownViewCount: 0,
      usableFrameCount: 4,
      detectedFrameCount: 6,
    },
  });
}

function buildTemporalNoisePoseResult() {
  return buildPoseResult({
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
    specializedFeatureSummary: buildSpecializedSummary({
      trunkCoilScore: {
        median: 0.56,
        peak: 0.68,
        observableFrameCount: 4,
        observableCoverage: 0.6667,
        peakFrameIndex: 6,
      },
      hittingArmPreparationScore: {
        median: 0.55,
        peak: 0.67,
        observableFrameCount: 4,
        observableCoverage: 0.6667,
        peakFrameIndex: 6,
      },
      wristAboveShoulderConfidence: {
        median: 0.53,
        peak: 0.64,
        observableFrameCount: 4,
        observableCoverage: 0.6667,
        peakFrameIndex: 6,
      },
      racketSideElbowHeightScore: {
        median: 0.52,
        peak: 0.62,
        observableFrameCount: 4,
        observableCoverage: 0.6667,
        peakFrameIndex: 6,
      },
      elbowExtensionScore: {
        median: 0.49,
        peak: 0.59,
        observableFrameCount: 4,
        observableCoverage: 0.6667,
        peakFrameIndex: 6,
      },
      contactPreparationScore: {
        median: 0.52,
        peak: 0.67,
        observableFrameCount: 3,
        observableCoverage: 0.5,
        peakFrameIndex: 6,
      },
    }),
  });
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
  assert.equal(summary?.temporalConsistency, 0.725);
  assert.equal(summary?.motionContinuity, 0.88);
  assert.equal(summary?.phaseCandidates?.preparation.anchorFrameIndex, 6);
  assert.equal(summary?.phaseCandidates?.followThrough.anchorFrameIndex, 7);
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
  assert.equal(report.scoringEvidence?.temporalConsistency, 0.725);
  assert.equal(report.scoringEvidence?.motionContinuity, 0.88);
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
    swing_repeatability: 74,
  });
  assert.equal(report.scoringEvidence?.cameraSuitability, 89);
  assert.equal(report.scoringEvidence?.confidenceBreakdown?.finalConfidenceScore, 85);
  assert.deepEqual(report.evidenceNotes, []);
  assert.equal(report.scoringEvidence?.fallbacksUsed?.length, 0);
  assert.equal(report.scoringEvidence?.scoringModelVersion, 'rule-v3-phase-aware');
  assert.deepEqual(report.phaseBreakdown?.map((item) => item.phaseKey), [
    'preparation',
    'backswing',
    'contactCandidate',
    'followThrough',
  ]);
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

test('buildRuleBasedResult downgrades boundary coverage failure to low confidence', () => {
  const poseResult = buildBoundaryCoveragePoseResult();

  const report = buildRuleBasedResult(buildTask(), poseResult);

  assert.equal(getPoseQualityFailure(poseResult), null);
  assert.equal(report.scoringEvidence?.analysisDisposition, 'low_confidence');
  assert.ok((report.confidenceScore ?? 100) < 70);
  assert.deepEqual(report.scoringEvidence?.rejectionDecision?.hardRejectReasons, []);
  assert.deepEqual(report.scoringEvidence?.rejectionDecision?.lowConfidenceReasons, ['insufficient_pose_coverage']);
  assert.ok(report.evidenceNotes?.some((note) => note.includes('覆盖率接近正式报告门槛')));
});

test('getPoseQualityFailure keeps severe coverage deficit as hard rejection', () => {
  const result = buildSevereCoveragePoseResult();

  const failure = getPoseQualityFailure(result);

  assert.deepEqual(failure, {
    code: 'insufficient_pose_coverage',
    message: 'stable pose coverage is below the minimum report threshold',
  });
});

test('buildRuleBasedResult maps temporal noise to low confidence instead of hard rejection', () => {
  const poseResult = buildTemporalNoisePoseResult();

  const report = buildRuleBasedResult(buildTask(), poseResult);

  assert.equal(getPoseQualityFailure(poseResult), null);
  assert.equal(report.scoringEvidence?.analysisDisposition, 'low_confidence');
  assert.ok(report.scoringEvidence?.rejectionDecision?.lowConfidenceReasons?.includes('insufficient_action_evidence'));
  assert.ok(report.evidenceNotes?.some((note) => note.includes('复现证据偏散')));
});

test('buildRuleBasedResult keeps jitter-heavy sample analyzable but lowers repeatability confidence', () => {
  const poseResult = buildPoseResult({
    scoreVariance: 0.031,
    coverageRatio: 0.75,
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
  assert.equal(report.phaseBreakdown?.find((item) => item.phaseKey === 'followThrough')?.status, 'insufficient_evidence');
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
    'phase_repeatability_fallback',
  ]);
  assert.ok((report.confidenceScore ?? 0) < 70);
  assert.equal(report.scoringEvidence?.analysisDisposition, 'low_confidence');
});

test('buildRuleBasedResult ranks body preparation issue first and fills coach-style fields', () => {
  const report = buildRuleBasedResult(buildTask(), buildPoseResult({
    specializedFeatureSummary: buildSpecializedSummary({
      sideOnReadinessScore: {
        median: 0.22,
        peak: 0.4,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      shoulderHipRotationScore: {
        median: 0.3,
        peak: 0.45,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      trunkCoilScore: {
        median: 0.28,
        peak: 0.4,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
    }),
  }));

  assert.equal(report.issues[0]?.title, '身体准备不足');
  assert.equal(report.issues[0]?.issueCategory, 'body_preparation_gap');
  assert.match(report.issues[0]?.observation ?? '', /侧身进入偏晚/);
  assert.match(report.issues[0]?.whyItMatters ?? '', /击球点/);
  assert.match(report.issues[0]?.nextTrainingFocus ?? '', /身体先转进去/);
  assert.match(report.summaryText ?? '', /准备阶段/);
  assert.match(report.retestAdvice, /准备阶段/);
  assert.equal(report.suggestions[0]?.suggestionType, 'technique_focus');
  assert.equal(report.suggestions[0]?.targetDimensionKey, 'body_preparation');
});

test('buildRuleBasedResult keeps racket-arm issue as one main issue and surfaces arm focus', () => {
  const report = buildRuleBasedResult(buildTask(), buildPoseResult({
    specializedFeatureSummary: buildSpecializedSummary({
      hittingArmPreparationScore: {
        median: 0.35,
        peak: 0.55,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      wristAboveShoulderConfidence: {
        median: 0.18,
        peak: 0.32,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      racketSideElbowHeightScore: {
        median: 0.25,
        peak: 0.38,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      elbowExtensionScore: {
        median: 0.29,
        peak: 0.42,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
    }),
  }));

  assert.equal(report.issues.filter((item) => item.issueCategory === 'racket_arm_preparation_gap').length, 1);
  assert.equal(report.issues[0]?.title, '挥拍臂准备不足');
  assert.match(report.issues[0]?.description ?? '', /抬得还不够早/);
  assert.equal(report.suggestions[0]?.linkedIssueCategory, 'arm_lift_focus_gap');
  assert.equal(report.suggestions[0]?.focusPoint, '抬手位置不足');
});

test('buildRuleBasedResult prioritizes evidence issue when camera suitability is too low', () => {
  const report = buildRuleBasedResult(buildTask(), buildPoseResult({
    viewProfile: 'front',
    viewConfidence: 0.56,
    viewStability: 0.52,
    rejectionReasons: ['invalid_camera_angle'],
    debugCounts: {
      tooSmallCount: 0,
      lowStabilityCount: 0,
      unknownViewCount: 5,
      usableFrameCount: 8,
      detectedFrameCount: 10,
    },
    specializedFeatureSummary: buildSpecializedSummary({
      sideOnReadinessScore: {
        median: 0.28,
        peak: 0.45,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      shoulderHipRotationScore: {
        median: 0.36,
        peak: 0.5,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      trunkCoilScore: {
        median: 0.31,
        peak: 0.48,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
    }),
  }));

  assert.equal(report.issues[0]?.issueCategory, 'evidence_quality_gap');
  assert.equal(report.issues[0]?.issueType, 'evidence_gap');
  assert.match(report.issues[0]?.captureAdvice ?? '', /后方或后斜视角/);
  assert.ok(report.suggestions.some((item) => item.suggestionType === 'capture_fix'));
});

test('buildRuleBasedResult keeps action issue ahead of light evidence issue when confidence is only slightly reduced', () => {
  const report = buildRuleBasedResult(buildTask(), buildPoseResult({
    coverageRatio: 0.2,
    medianStabilityScore: 0.45,
    specializedFeatureSummary: buildSpecializedSummary({
      sideOnReadinessScore: {
        median: 0.22,
        peak: 0.4,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      shoulderHipRotationScore: {
        median: 0.3,
        peak: 0.45,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      trunkCoilScore: {
        median: 0.28,
        peak: 0.4,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
    }),
  }));

  assert.ok((report.confidenceScore ?? 0) < 70);
  assert.ok((report.confidenceScore ?? 0) >= 65);
  assert.equal(report.issues[0]?.issueCategory, 'body_preparation_gap');
  assert.ok(report.issues.some((item) => item.issueCategory === 'evidence_quality_gap'));
});

test('buildRuleBasedResult caps suggestions at three and links primary suggestion to primary issue dimension', () => {
  const report = buildRuleBasedResult(buildTask(), buildPoseResult({
    viewProfile: 'front',
    viewConfidence: 0.56,
    viewStability: 0.52,
    rejectionReasons: ['invalid_camera_angle'],
    debugCounts: {
      tooSmallCount: 0,
      lowStabilityCount: 0,
      unknownViewCount: 5,
      usableFrameCount: 8,
      detectedFrameCount: 10,
    },
    specializedFeatureSummary: buildSpecializedSummary({
      sideOnReadinessScore: {
        median: 0.22,
        peak: 0.4,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      shoulderHipRotationScore: {
        median: 0.3,
        peak: 0.45,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      trunkCoilScore: {
        median: 0.28,
        peak: 0.4,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      hittingArmPreparationScore: {
        median: 0.35,
        peak: 0.55,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      wristAboveShoulderConfidence: {
        median: 0.18,
        peak: 0.32,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      racketSideElbowHeightScore: {
        median: 0.25,
        peak: 0.38,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      elbowExtensionScore: {
        median: 0.29,
        peak: 0.42,
        observableFrameCount: 8,
        observableCoverage: 1,
        peakFrameIndex: 6,
      },
      contactPreparationScore: {
        median: 0.44,
        peak: 0.56,
        observableFrameCount: 8,
        observableCoverage: 0.75,
        peakFrameIndex: 6,
      },
    }),
    scoreVariance: 0.033,
  }));

  assert.equal(report.suggestions.length, 3);
  assert.ok(report.suggestions.some((item) => item.targetDimensionKey === report.issues[0]?.targetDimensionKey));
  assert.deepEqual(report.suggestions.map((item) => item.suggestionType), [
    'technique_focus',
    'capture_fix',
    'retest_check',
  ]);
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
