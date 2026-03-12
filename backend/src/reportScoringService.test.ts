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
      ...summaryOverrides,
    },
    frames: [],
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
});
