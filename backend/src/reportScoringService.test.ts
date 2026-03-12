import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisTaskRecord, PoseAnalysisResult } from './types/task';
import { buildRuleBasedResult, getPoseQualityFailure } from './services/reportScoringService';

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
      rejectionReasons: [],
      humanSummary: '本次基于 8/12 帧稳定识别结果生成：已经能看到较稳定的侧身展开和挥拍臂上举。',
      viewProfile: 'rear_left_oblique',
      viewConfidence: 0.84,
      viewStability: 0.75,
      dominantRacketSide: 'right',
      racketSideConfidence: 0.71,
      bestFrameOverlayRelativePath: 'artifacts/tasks/task_report_test/pose/overlays/frame-05-overlay.jpg',
      overlayFrameCount: 1,
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

test('getPoseQualityFailure returns the first rejection reason', () => {
  const result = buildPoseResult({
    rejectionReasons: ['insufficient_pose_coverage', 'invalid_camera_angle'],
    usableFrameCount: 4,
    coverageRatio: 0.3333,
  });

  const failure = getPoseQualityFailure(result);

  assert.deepEqual(failure, {
    code: 'insufficient_pose_coverage',
    message: 'stable pose coverage is below the minimum report threshold',
  });
});

test('buildRuleBasedResult maps report fields from pose evidence only', () => {
  const report = buildRuleBasedResult(buildTask(), buildPoseResult());

  assert.equal(report.poseBased, true);
  assert.equal(report.actionType, 'clear');
  assert.match(report.summaryText ?? '', /本次基于 8\/12 帧稳定识别结果生成/);
  assert.equal(report.dimensionScores.length, 4);
  assert.equal(report.scoringEvidence?.dimensionEvidence?.length, 4);
  assert.equal(report.scoringEvidence?.usableFrameCount, 8);
  assert.equal(report.scoringEvidence?.rejectionReasons?.length, 0);
  assert.equal(report.recognitionContext?.viewLabel, '左后斜');
  assert.equal(report.recognitionContext?.dominantRacketSideLabel, '右手挥拍侧');
  assert.equal(report.visualEvidence?.bestFrameImagePath, 'artifacts/tasks/task_report_test/preprocess/frame-05.jpg');
  assert.equal(report.visualEvidence?.bestFrameOverlayPath, 'artifacts/tasks/task_report_test/pose/overlays/frame-05-overlay.jpg');
  assert.equal(report.visualEvidence?.overlayFrames.length, 2);
});

test('buildRuleBasedResult keeps visual evidence usable when overlay is missing', () => {
  const report = buildRuleBasedResult(buildTask(), buildPoseResult({
    bestFrameOverlayRelativePath: undefined,
  }));

  assert.equal(report.visualEvidence?.bestFrameImagePath, 'artifacts/tasks/task_report_test/preprocess/frame-05.jpg');
  assert.equal(report.visualEvidence?.bestFrameOverlayPath, 'artifacts/tasks/task_report_test/pose/overlays/frame-05-overlay.jpg');
});
