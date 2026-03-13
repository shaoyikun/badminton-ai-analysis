import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { PoseAnalysisResult, ReportResult } from './types/task';
import { writePoseResult } from './services/artifactStore';
import { getReportRow, getTask, saveReport, saveTask } from './services/taskRepository';
import {
  createTask,
  getActiveAnalysisTaskForTests,
  getRetestComparison,
  runAnalysisPipelineForTests,
  saveUpload,
  setAnalysisWorkerForTests,
  setUploadPreparationWorkerForTests,
  startMockAnalysis,
} from './services/taskService';

async function withTempWorkspace(run: (workspace: string) => Promise<void>) {
  const originalCwd = process.cwd();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-task-service-test-'));

  process.chdir(workspace);
  fs.mkdirSync(path.join(workspace, 'data'), { recursive: true });

  try {
    await run(workspace);
  } finally {
    setAnalysisWorkerForTests();
    setUploadPreparationWorkerForTests();
    process.chdir(originalCwd);
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

function buildPhaseBreakdown(
  overrides?: Partial<Record<'preparation' | 'backswing' | 'contactCandidate' | 'followThrough', 'ok' | 'attention' | 'insufficient_evidence'>>,
): NonNullable<ReportResult['phaseBreakdown']> {
  return [
    { phaseKey: 'preparation', label: '准备', status: overrides?.preparation ?? 'ok', summary: '准备阶段摘要' },
    { phaseKey: 'backswing', label: '引拍', status: overrides?.backswing ?? 'ok', summary: '引拍阶段摘要' },
    { phaseKey: 'contactCandidate', label: '击球候选', status: overrides?.contactCandidate ?? 'ok', summary: '击球候选阶段摘要' },
    { phaseKey: 'followThrough', label: '随挥', status: overrides?.followThrough ?? 'ok', summary: '随挥阶段摘要' },
  ];
}

test('saveUpload strips directory segments and stores source video under artifact task directory', async () => {
  await withTempWorkspace(async (workspace) => {
    const task = createTask('clear');
    const stagedUploadPath = path.join(workspace, 'incoming.tmp');
    fs.writeFileSync(stagedUploadPath, 'demo');

    const updated = saveUpload(task.taskId, 'nested/../../clip.mp4', stagedUploadPath, 'video/mp4');

    assert.ok(updated);
    assert.equal(updated?.artifacts.upload?.fileName, 'clip.mp4');
    assert.ok(updated?.artifacts.sourceFilePath);
    assert.equal(fs.realpathSync(path.dirname(updated!.artifacts.sourceFilePath!)), fs.realpathSync(path.join(workspace, 'artifacts', 'tasks', task.taskId)));
    assert.match(path.basename(updated!.artifacts.sourceFilePath!), /^source\.mp4$/);
  });
});

test('startMockAnalysis returns before background worker finishes', async () => {
  await withTempWorkspace(async (workspace) => {
    const task = createTask('clear');
    const stagedUploadPath = path.join(workspace, 'clip.mp4');
    fs.writeFileSync(stagedUploadPath, 'demo');
    saveUpload(task.taskId, 'clip.mp4', stagedUploadPath, 'video/mp4');
    saveTask({
      ...getTask(task.taskId)!,
      artifacts: {
        ...getTask(task.taskId)!.artifacts,
        preprocess: {
          status: 'queued',
          segmentScan: {
            status: 'completed',
            segmentDetectionVersion: 'coarse_motion_scan_v1',
            recommendedSegmentId: 'segment-01',
            selectedSegmentId: 'segment-01',
            segmentSelectionMode: 'auto_recommended',
            swingSegments: [{
              segmentId: 'segment-01',
              startTimeMs: 1000,
              endTimeMs: 2000,
              startFrame: 10,
              endFrame: 20,
              durationMs: 1000,
              motionScore: 0.7,
              confidence: 0.8,
              rankingScore: 0.78,
              coarseQualityFlags: [],
              detectionSource: 'coarse_motion_scan_v1',
            }],
          },
        },
      },
    });

    let resolveWorker: (() => void) | undefined;
    const workerDone = new Promise<void>((resolve) => {
      resolveWorker = resolve;
    });

    setAnalysisWorkerForTests(async () => {
      await workerDone;
    });

    const started = await Promise.race([
      startMockAnalysis(task.taskId),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), 100);
      }),
    ]);

    if (started === 'timeout') {
      assert.fail('startMockAnalysis should not wait for the background worker');
    }

    assert.ok(started);
    assert.equal(started.status, 'processing');
    assert.equal(started.stage, 'validating');
    assert.ok(getActiveAnalysisTaskForTests(task.taskId));
    assert.equal(getTask(task.taskId)?.status, 'processing');

    resolveWorker?.();
    await getActiveAnalysisTaskForTests(task.taskId);
  });
});

function buildLowConfidencePoseResult(): PoseAnalysisResult {
  return {
    engine: 'mediapipe-pose',
    frameCount: 12,
    detectedFrameCount: 10,
    summary: {
      bestFrameIndex: 5,
      usableFrameCount: 8,
      coverageRatio: 0.6667,
      medianStabilityScore: 0.74,
      medianBodyTurnScore: 0.51,
      medianRacketArmLiftScore: 0.47,
      scoreVariance: 0.032,
      rejectionReasons: ['invalid_camera_angle'],
      rejectionReasonDetails: [],
      humanSummary: '可分析，但机位和动作稳定性让证据置信度偏低。',
      viewProfile: 'front',
      viewConfidence: 0.54,
      viewStability: 0.52,
      dominantRacketSide: 'right',
      racketSideConfidence: 0.68,
      bestPreparationFrameIndex: 6,
      phaseCandidates: {
        preparation: {
          anchorFrameIndex: null,
          windowStartFrameIndex: null,
          windowEndFrameIndex: null,
          score: null,
          sourceMetric: 'contactPreparationScore',
          detectionStatus: 'missing',
          missingReason: 'insufficient_preparation_evidence',
        },
        backswing: {
          anchorFrameIndex: null,
          windowStartFrameIndex: null,
          windowEndFrameIndex: null,
          score: null,
          sourceMetric: 'hittingArmPreparationScore',
          detectionStatus: 'missing',
          missingReason: 'insufficient_preparation_evidence',
        },
        contactCandidate: {
          anchorFrameIndex: 5,
          windowStartFrameIndex: 5,
          windowEndFrameIndex: 5,
          score: null,
          sourceMetric: 'bestFrameIndex',
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
        sideOnReadinessScore: { median: null, peak: null, observableFrameCount: 0, observableCoverage: 0, peakFrameIndex: null },
        shoulderHipRotationScore: { median: null, peak: null, observableFrameCount: 0, observableCoverage: 0, peakFrameIndex: null },
        trunkCoilScore: { median: null, peak: null, observableFrameCount: 0, observableCoverage: 0, peakFrameIndex: null },
        hittingArmPreparationScore: { median: null, peak: null, observableFrameCount: 0, observableCoverage: 0, peakFrameIndex: null },
        wristAboveShoulderConfidence: { median: null, peak: null, observableFrameCount: 0, observableCoverage: 0, peakFrameIndex: null },
        racketSideElbowHeightScore: { median: null, peak: null, observableFrameCount: 0, observableCoverage: 0, peakFrameIndex: null },
        elbowExtensionScore: { median: null, peak: null, observableFrameCount: 0, observableCoverage: 0, peakFrameIndex: null },
        contactPreparationScore: { median: null, peak: null, observableFrameCount: 0, observableCoverage: 0, peakFrameIndex: null },
      },
      debugCounts: {
        tooSmallCount: 0,
        lowStabilityCount: 0,
        unknownViewCount: 5,
        usableFrameCount: 8,
        detectedFrameCount: 10,
      },
    },
    frames: [],
  };
}

function buildBoundaryCoveragePoseResult(): PoseAnalysisResult {
  return {
    engine: 'mediapipe-pose',
    frameCount: 10,
    detectedFrameCount: 7,
    summary: {
      bestFrameIndex: 4,
      usableFrameCount: 5,
      coverageRatio: 0.5,
      medianStabilityScore: 0.62,
      medianBodyTurnScore: 0.52,
      medianRacketArmLiftScore: 0.49,
      scoreVariance: 0.022,
      temporalConsistency: 0.45,
      motionContinuity: 0.5,
      rejectionReasons: ['insufficient_pose_coverage'],
      rejectionReasonDetails: [],
      humanSummary: 'coverage 边界但仍可生成低置信报告。',
      viewProfile: 'rear_left_oblique',
      viewConfidence: 0.8,
      viewStability: 0.75,
      dominantRacketSide: 'right',
      racketSideConfidence: 0.61,
      bestPreparationFrameIndex: 4,
      phaseCandidates: {
        preparation: {
          anchorFrameIndex: 4,
          windowStartFrameIndex: 3,
          windowEndFrameIndex: 4,
          score: 0.55,
          sourceMetric: 'contactPreparationScore',
          detectionStatus: 'detected',
        },
        backswing: {
          anchorFrameIndex: 4,
          windowStartFrameIndex: 3,
          windowEndFrameIndex: 4,
          score: 0.57,
          sourceMetric: 'hittingArmPreparationScore',
          detectionStatus: 'detected',
        },
        contactCandidate: {
          anchorFrameIndex: 4,
          windowStartFrameIndex: 4,
          windowEndFrameIndex: 4,
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
      specializedFeatureSummary: {
        sideOnReadinessScore: { median: 0.53, peak: 0.64, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 4 },
        shoulderHipRotationScore: { median: 0.5, peak: 0.61, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 4 },
        trunkCoilScore: { median: 0.49, peak: 0.6, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 4 },
        hittingArmPreparationScore: { median: 0.51, peak: 0.63, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 4 },
        wristAboveShoulderConfidence: { median: 0.48, peak: 0.58, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 4 },
        racketSideElbowHeightScore: { median: 0.47, peak: 0.57, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 4 },
        elbowExtensionScore: { median: 0.45, peak: 0.54, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 4 },
        contactPreparationScore: { median: 0.44, peak: 0.55, observableFrameCount: 5, observableCoverage: 0.5, peakFrameIndex: 4 },
      },
      debugCounts: {
        tooSmallCount: 0,
        lowStabilityCount: 0,
        unknownViewCount: 0,
        usableFrameCount: 5,
        detectedFrameCount: 7,
      },
    },
    frames: [],
  };
}

function buildSevereCoveragePoseResult(): PoseAnalysisResult {
  return {
    engine: 'mediapipe-pose',
    frameCount: 10,
    detectedFrameCount: 6,
    summary: {
      bestFrameIndex: 4,
      usableFrameCount: 4,
      coverageRatio: 0.4,
      medianStabilityScore: 0.58,
      medianBodyTurnScore: 0.44,
      medianRacketArmLiftScore: 0.42,
      scoreVariance: 0.027,
      temporalConsistency: 0.32,
      motionContinuity: 0.41,
      rejectionReasons: ['insufficient_pose_coverage'],
      rejectionReasonDetails: [],
      humanSummary: 'coverage 明显不足，仍应失败。',
      viewProfile: 'rear_left_oblique',
      viewConfidence: 0.74,
      viewStability: 0.69,
      dominantRacketSide: 'right',
      racketSideConfidence: 0.56,
      bestPreparationFrameIndex: 4,
      phaseCandidates: {
        preparation: {
          anchorFrameIndex: 4,
          windowStartFrameIndex: 4,
          windowEndFrameIndex: 4,
          score: 0.47,
          sourceMetric: 'contactPreparationScore',
          detectionStatus: 'detected',
        },
        backswing: {
          anchorFrameIndex: 4,
          windowStartFrameIndex: 4,
          windowEndFrameIndex: 4,
          score: 0.46,
          sourceMetric: 'hittingArmPreparationScore',
          detectionStatus: 'detected',
        },
        contactCandidate: {
          anchorFrameIndex: 4,
          windowStartFrameIndex: 4,
          windowEndFrameIndex: 4,
          score: 0.45,
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
        sideOnReadinessScore: { median: 0.42, peak: 0.54, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 4 },
        shoulderHipRotationScore: { median: 0.4, peak: 0.51, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 4 },
        trunkCoilScore: { median: 0.39, peak: 0.5, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 4 },
        hittingArmPreparationScore: { median: 0.43, peak: 0.55, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 4 },
        wristAboveShoulderConfidence: { median: 0.4, peak: 0.52, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 4 },
        racketSideElbowHeightScore: { median: 0.39, peak: 0.49, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 4 },
        elbowExtensionScore: { median: 0.37, peak: 0.46, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 4 },
        contactPreparationScore: { median: 0.36, peak: 0.47, observableFrameCount: 4, observableCoverage: 0.4, peakFrameIndex: 4 },
      },
      debugCounts: {
        tooSmallCount: 0,
        lowStabilityCount: 1,
        unknownViewCount: 0,
        usableFrameCount: 4,
        detectedFrameCount: 6,
      },
    },
    frames: [],
  };
}

function buildSmashPoseResult(): PoseAnalysisResult {
  return {
    engine: 'mediapipe-pose',
    frameCount: 12,
    detectedFrameCount: 10,
    summary: {
      bestFrameIndex: 6,
      usableFrameCount: 8,
      coverageRatio: 0.6667,
      medianStabilityScore: 0.78,
      medianBodyTurnScore: 0.52,
      medianRacketArmLiftScore: 0.48,
      scoreVariance: 0.011,
      temporalConsistency: 0.46,
      motionContinuity: 0.52,
      rejectionReasons: [],
      rejectionReasonDetails: [],
      humanSummary: '杀球样本已经完成姿态摘要计算。',
      viewProfile: 'rear_left_oblique',
      viewConfidence: 0.84,
      viewStability: 0.75,
      dominantRacketSide: 'right',
      racketSideConfidence: 0.71,
      bestPreparationFrameIndex: 6,
      phaseCandidates: {
        preparation: {
          anchorFrameIndex: 6,
          windowStartFrameIndex: 5,
          windowEndFrameIndex: 6,
          score: 0.57,
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
          score: 0.49,
          sourceMetric: 'compositeScore',
          detectionStatus: 'detected',
        },
        followThrough: {
          anchorFrameIndex: 7,
          windowStartFrameIndex: 6,
          windowEndFrameIndex: 7,
          score: 0.46,
          sourceMetric: 'postContactMotionScore',
          detectionStatus: 'detected',
        },
      },
      specializedFeatureSummary: {
        sideOnReadinessScore: { median: 0.38, peak: 0.54, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        shoulderHipRotationScore: { median: 0.41, peak: 0.58, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        trunkCoilScore: { median: 0.36, peak: 0.52, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        hittingArmPreparationScore: { median: 0.42, peak: 0.59, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        wristAboveShoulderConfidence: { median: 0.33, peak: 0.51, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        racketSideElbowHeightScore: { median: 0.35, peak: 0.5, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        elbowExtensionScore: { median: 0.31, peak: 0.48, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
        contactPreparationScore: { median: 0.44, peak: 0.57, observableFrameCount: 8, observableCoverage: 1, peakFrameIndex: 6 },
      },
      debugCounts: {
        tooSmallCount: 0,
        lowStabilityCount: 0,
        unknownViewCount: 0,
        usableFrameCount: 8,
        detectedFrameCount: 10,
      },
    },
    frames: [],
  };
}

test('runAnalysisPipeline completes low-confidence sample and still stores a report', async () => {
  await withTempWorkspace(async () => {
    const originalDelay = process.env.MOCK_ANALYSIS_DELAY_MS;
    process.env.MOCK_ANALYSIS_DELAY_MS = '0';

    try {
      const task = createTask('clear');
      const stored = writePoseResult(task.taskId, buildLowConfidencePoseResult());
      saveTask({
        ...task,
        status: 'processing',
        stage: 'generating_report',
        progressPercent: 90,
        startedAt: new Date().toISOString(),
        artifacts: {
          ...task.artifacts,
          poseResultPath: stored.absolutePath,
          preprocess: {
            status: 'completed',
            artifacts: {
              normalizedFileName: 'clip.mp4',
              metadataExtractedAt: '2026-03-13T10:00:00.000Z',
              artifactsDir: 'artifacts/tasks/task_low_confidence/preprocess',
              manifestPath: 'artifacts/tasks/task_low_confidence/preprocess/manifest.json',
              segmentDetectionVersion: 'coarse_motion_scan_v1',
              recommendedSegmentId: 'segment-02',
              selectedSegmentId: 'segment-02',
              segmentSelectionMode: 'auto_recommended',
              swingSegments: [
                {
                  segmentId: 'segment-01',
                  startTimeMs: 120,
                  endTimeMs: 820,
                  startFrame: 2,
                  endFrame: 8,
                  durationMs: 700,
                  motionScore: 0.33,
                  confidence: 0.5,
                  rankingScore: 0.42,
                  coarseQualityFlags: ['too_short'],
                  detectionSource: 'coarse_motion_scan_v1',
                },
                {
                  segmentId: 'segment-02',
                  startTimeMs: 1200,
                  endTimeMs: 2360,
                  startFrame: 13,
                  endFrame: 24,
                  durationMs: 1160,
                  motionScore: 0.71,
                  confidence: 0.84,
                  rankingScore: 0.8,
                  coarseQualityFlags: [],
                  detectionSource: 'coarse_motion_scan_v1',
                },
              ],
              framePlan: {
                strategy: 'segment-aware-uniform-sampling-ffmpeg-v1',
                targetFrameCount: 6,
                sampleTimestamps: [1.35, 1.52, 1.69, 1.86, 2.03, 2.2],
                sourceWindow: {
                  startTimeMs: 1200,
                  endTimeMs: 2360,
                  startFrame: 13,
                  endFrame: 24,
                },
              },
              sampledFrames: [
                {
                  index: 1,
                  timestampSeconds: 1.35,
                  fileName: 'frame-01.jpg',
                  relativePath: 'artifacts/tasks/task_low_confidence/preprocess/frame-01.jpg',
                },
              ],
            },
          },
        },
      });

      await runAnalysisPipelineForTests(task.taskId);

      const completedTask = getTask(task.taskId);
      const reportRow = getReportRow(task.taskId);
      const report = reportRow ? JSON.parse(reportRow.report_json) as ReportResult : null;

      assert.equal(completedTask?.status, 'completed');
      assert.equal(completedTask?.stage, 'completed');
      assert.ok(reportRow);
      assert.equal(report?.scoringEvidence?.analysisDisposition, 'low_confidence');
      assert.ok((report?.confidenceScore ?? 100) < 70);
      assert.equal(report?.recommendedSegmentId, 'segment-02');
      assert.equal(report?.selectedSegmentId, 'segment-02');
      assert.equal(report?.segmentSelectionMode, 'auto_recommended');
      assert.equal(report?.swingSegments?.length, 2);
    } finally {
      if (originalDelay === undefined) {
        delete process.env.MOCK_ANALYSIS_DELAY_MS;
      } else {
        process.env.MOCK_ANALYSIS_DELAY_MS = originalDelay;
      }
    }
  });
});

test('runAnalysisPipeline completes boundary coverage sample as low confidence', async () => {
  await withTempWorkspace(async () => {
    const originalDelay = process.env.MOCK_ANALYSIS_DELAY_MS;
    process.env.MOCK_ANALYSIS_DELAY_MS = '0';

    try {
      const task = createTask('clear');
      const stored = writePoseResult(task.taskId, buildBoundaryCoveragePoseResult());
      saveTask({
        ...task,
        status: 'processing',
        stage: 'generating_report',
        progressPercent: 90,
        startedAt: new Date().toISOString(),
        artifacts: {
          ...task.artifacts,
          poseResultPath: stored.absolutePath,
        },
      });

      await runAnalysisPipelineForTests(task.taskId);

      const completedTask = getTask(task.taskId);
      const reportRow = getReportRow(task.taskId);
      const report = reportRow ? JSON.parse(reportRow.report_json) as ReportResult : null;

      assert.equal(completedTask?.status, 'completed');
      assert.equal(completedTask?.error?.code, undefined);
      assert.ok(reportRow);
      assert.equal(report?.scoringEvidence?.analysisDisposition, 'low_confidence');
      assert.ok(report?.scoringEvidence?.rejectionDecision?.lowConfidenceReasons?.includes('insufficient_pose_coverage'));
    } finally {
      if (originalDelay === undefined) {
        delete process.env.MOCK_ANALYSIS_DELAY_MS;
      } else {
        process.env.MOCK_ANALYSIS_DELAY_MS = originalDelay;
      }
    }
  });
});

test('runAnalysisPipeline completes smash sample with public smash report payload', async () => {
  await withTempWorkspace(async () => {
    const originalDelay = process.env.MOCK_ANALYSIS_DELAY_MS;
    process.env.MOCK_ANALYSIS_DELAY_MS = '0';

    try {
      const task = createTask('smash');
      const stored = writePoseResult(task.taskId, buildSmashPoseResult());
      saveTask({
        ...task,
        status: 'processing',
        stage: 'generating_report',
        progressPercent: 90,
        startedAt: new Date().toISOString(),
        artifacts: {
          ...task.artifacts,
          poseResultPath: stored.absolutePath,
        },
      });

      await runAnalysisPipelineForTests(task.taskId);

      const completedTask = getTask(task.taskId);
      const reportRow = getReportRow(task.taskId);
      const report = reportRow ? JSON.parse(reportRow.report_json) as ReportResult : null;

      assert.equal(completedTask?.status, 'completed');
      assert.equal(completedTask?.stage, 'completed');
      assert.ok(reportRow);
      assert.equal(report?.actionType, 'smash');
      assert.equal(report?.scoringEvidence?.scoringModelVersion, 'rule-v3-smash-shadow');
      assert.equal(report?.standardComparison?.standardReference.imagePath, '/standard-references/smash-reference-real.jpg');
      assert.ok(report?.issues.some((item) => item.issueCategory === 'smash_loading_gap'));
    } finally {
      if (originalDelay === undefined) {
        delete process.env.MOCK_ANALYSIS_DELAY_MS;
      } else {
        process.env.MOCK_ANALYSIS_DELAY_MS = originalDelay;
      }
    }
  });
});

test('runAnalysisPipeline still fails severe coverage deficit', async () => {
  await withTempWorkspace(async () => {
    const originalDelay = process.env.MOCK_ANALYSIS_DELAY_MS;
    process.env.MOCK_ANALYSIS_DELAY_MS = '0';

    try {
      const task = createTask('clear');
      const stored = writePoseResult(task.taskId, buildSevereCoveragePoseResult());
      saveTask({
        ...task,
        status: 'processing',
        stage: 'generating_report',
        progressPercent: 90,
        startedAt: new Date().toISOString(),
        artifacts: {
          ...task.artifacts,
          poseResultPath: stored.absolutePath,
        },
      });

      await runAnalysisPipelineForTests(task.taskId);

      const failedTask = getTask(task.taskId);
      const reportRow = getReportRow(task.taskId);

      assert.equal(failedTask?.status, 'failed');
      assert.equal(failedTask?.error?.code, 'insufficient_pose_coverage');
      assert.equal(reportRow, undefined);
    } finally {
      if (originalDelay === undefined) {
        delete process.env.MOCK_ANALYSIS_DELAY_MS;
      } else {
        process.env.MOCK_ANALYSIS_DELAY_MS = originalDelay;
      }
    }
  });
});

test('getRetestComparison writes improvement summary with focused coach review', async () => {
  await withTempWorkspace(async () => {
    const first = createTask('clear');
    const second = createTask('clear');
    const now = new Date().toISOString();

    saveTask({
      ...first,
      status: 'completed',
      stage: 'completed',
      progressPercent: 100,
      completedAt: now,
    });
    saveTask({
      ...second,
      status: 'completed',
      stage: 'completed',
      progressPercent: 100,
      completedAt: now,
      baselineTaskId: first.taskId,
    });

    const firstReport: ReportResult = {
      taskId: first.taskId,
      actionType: 'clear',
      totalScore: 70,
      summaryText: 'baseline',
      dimensionScores: [
        { name: '身体准备', score: 68 },
        { name: '挥拍臂准备', score: 64 },
        { name: '挥拍复现稳定性', score: 72 },
      ],
      issues: [],
      suggestions: [],
      retestAdvice: 'retry',
      createdAt: now,
      poseBased: true,
      phaseBreakdown: buildPhaseBreakdown({
        preparation: 'attention',
        backswing: 'attention',
      }),
      scoringEvidence: {
        scoringModelVersion: 'rule-v3-phase-aware',
      },
    };
    const secondReport: ReportResult = {
      taskId: second.taskId,
      actionType: 'clear',
      totalScore: 76,
      summaryText: 'current',
      dimensionScores: [
        { name: '身体准备', score: 74 },
        { name: '挥拍臂准备', score: 69 },
        { name: '挥拍复现稳定性', score: 72 },
      ],
      issues: [],
      suggestions: [],
      retestAdvice: 'retry',
      createdAt: now,
      poseBased: true,
      phaseBreakdown: buildPhaseBreakdown(),
      scoringEvidence: {
        scoringModelVersion: 'rule-v3-phase-aware',
      },
    };

    saveReport(first.taskId, JSON.stringify(firstReport), firstReport.totalScore, firstReport.summaryText, firstReport.poseBased);
    saveReport(second.taskId, JSON.stringify(secondReport), secondReport.totalScore, secondReport.summaryText, secondReport.poseBased);

    const comparison = getRetestComparison(second.taskId, first.taskId);

    assert.ok(comparison);
    assert.ok(comparison.comparison);
    assert.match(comparison.comparison.summaryText ?? '', /最明显的提升在 身体准备、挥拍臂准备/);
    assert.deepEqual(comparison.comparison.coachReview.focusDimensions, ['身体准备', '挥拍臂准备']);
    assert.match(comparison.comparison.coachReview.nextFocus ?? '', /先只盯 身体准备、挥拍臂准备/);
    assert.match(comparison.comparison.coachReview.nextCheck ?? '', /身体准备/);
    assert.equal(comparison.comparison.phaseDeltas[0]?.phaseKey, 'preparation');
  });
});

test('getRetestComparison writes decline summary with explicit changed dimensions', async () => {
  await withTempWorkspace(async () => {
    const first = createTask('clear');
    const second = createTask('clear');
    const now = new Date().toISOString();

    saveTask({
      ...first,
      status: 'completed',
      stage: 'completed',
      progressPercent: 100,
      completedAt: now,
    });
    saveTask({
      ...second,
      status: 'completed',
      stage: 'completed',
      progressPercent: 100,
      completedAt: now,
      baselineTaskId: first.taskId,
    });

    const firstReport: ReportResult = {
      taskId: first.taskId,
      actionType: 'clear',
      totalScore: 80,
      summaryText: 'baseline',
      dimensionScores: [
        { name: '身体准备', score: 80 },
        { name: '挥拍臂准备', score: 78 },
        { name: '挥拍复现稳定性', score: 76 },
      ],
      issues: [],
      suggestions: [],
      retestAdvice: 'retry',
      createdAt: now,
      poseBased: true,
      phaseBreakdown: buildPhaseBreakdown(),
      scoringEvidence: {
        scoringModelVersion: 'rule-v3-phase-aware',
      },
    };
    const secondReport: ReportResult = {
      taskId: second.taskId,
      actionType: 'clear',
      totalScore: 74,
      summaryText: 'current',
      dimensionScores: [
        { name: '身体准备', score: 80 },
        { name: '挥拍臂准备', score: 74 },
        { name: '挥拍复现稳定性', score: 70 },
      ],
      issues: [],
      suggestions: [],
      retestAdvice: 'retry',
      createdAt: now,
      poseBased: true,
      phaseBreakdown: buildPhaseBreakdown({
        contactCandidate: 'attention',
        followThrough: 'attention',
      }),
      scoringEvidence: {
        scoringModelVersion: 'rule-v3-phase-aware',
      },
    };

    saveReport(first.taskId, JSON.stringify(firstReport), firstReport.totalScore, firstReport.summaryText, firstReport.poseBased);
    saveReport(second.taskId, JSON.stringify(secondReport), secondReport.totalScore, secondReport.summaryText, secondReport.poseBased);

    const comparison = getRetestComparison(second.taskId, first.taskId);

    assert.ok(comparison);
    assert.ok(comparison.comparison);
    assert.match(comparison.comparison.summaryText ?? '', /主要回落在 挥拍复现稳定性、挥拍臂准备/);
    assert.match(comparison.comparison.summaryText ?? '', /身体准备 还基本守住/);
    assert.deepEqual(comparison.comparison.coachReview.focusDimensions, ['挥拍复现稳定性', '身体准备']);
    assert.match(comparison.comparison.coachReview.nextFocus ?? '', /先只盯 挥拍复现稳定性、身体准备/);
    assert.match(comparison.comparison.coachReview.regressionNote ?? '', /挥拍复现稳定性 这次从 76 分掉到 70 分/);
    assert.ok(comparison.comparison.phaseDeltas.some((item) => item.phaseKey === 'followThrough' && item.changed));
  });
});

test('getRetestComparison disables comparison across scoring model versions', async () => {
  await withTempWorkspace(async () => {
    const first = createTask('clear');
    const second = createTask('clear');
    const now = new Date().toISOString();

    saveTask({
      ...first,
      status: 'completed',
      stage: 'completed',
      progressPercent: 100,
      completedAt: now,
    });
    saveTask({
      ...second,
      status: 'completed',
      stage: 'completed',
      progressPercent: 100,
      completedAt: now,
      baselineTaskId: first.taskId,
    });

    const firstReport: ReportResult = {
      taskId: first.taskId,
      actionType: 'clear',
      totalScore: 70,
      summaryText: 'legacy',
      dimensionScores: [{ name: '准备姿态', score: 70 }],
      issues: [],
      suggestions: [],
      retestAdvice: 'retry',
      createdAt: now,
      poseBased: false,
    };
    const secondReport: ReportResult = {
      taskId: second.taskId,
      actionType: 'clear',
      totalScore: 75,
      confidenceScore: 82,
      summaryText: 'new',
      dimensionScores: [{ name: '身体准备', score: 75 }],
      issues: [],
      suggestions: [],
      retestAdvice: 'retry',
      createdAt: now,
      poseBased: true,
      scoringEvidence: {
        scoringModelVersion: 'rule-v3-phase-aware',
      },
    };

    saveReport(first.taskId, JSON.stringify(firstReport), firstReport.totalScore, firstReport.summaryText, firstReport.poseBased);
    saveReport(second.taskId, JSON.stringify(secondReport), secondReport.totalScore, secondReport.summaryText, secondReport.poseBased);

    const comparison = getRetestComparison(second.taskId, first.taskId);

    assert.ok(comparison);
    assert.equal(comparison.comparison, null);
    assert.equal(comparison.unavailableReason, 'scoring_model_mismatch');
  });
});

test('getRetestComparison returns null across different action types', async () => {
  await withTempWorkspace(async () => {
    const clearTask = createTask('clear');
    const smashTask = createTask('smash');
    const now = new Date().toISOString();

    saveTask({
      ...clearTask,
      status: 'completed',
      stage: 'completed',
      progressPercent: 100,
      completedAt: now,
    });
    saveTask({
      ...smashTask,
      status: 'completed',
      stage: 'completed',
      progressPercent: 100,
      completedAt: now,
      baselineTaskId: clearTask.taskId,
    });

    const clearReport: ReportResult = {
      taskId: clearTask.taskId,
      actionType: 'clear',
      totalScore: 70,
      summaryText: 'clear',
      dimensionScores: [{ name: '身体准备', score: 70 }],
      issues: [],
      suggestions: [],
      retestAdvice: 'retry',
      createdAt: now,
      poseBased: true,
      scoringEvidence: {
        scoringModelVersion: 'rule-v3-phase-aware',
      },
    };
    const smashReport: ReportResult = {
      taskId: smashTask.taskId,
      actionType: 'smash',
      totalScore: 72,
      summaryText: 'smash',
      dimensionScores: [{ name: '身体加载', score: 72 }],
      issues: [],
      suggestions: [],
      retestAdvice: 'retry',
      createdAt: now,
      poseBased: true,
      scoringEvidence: {
        scoringModelVersion: 'rule-v3-smash-shadow',
      },
    };

    saveReport(clearTask.taskId, JSON.stringify(clearReport), clearReport.totalScore, clearReport.summaryText, clearReport.poseBased);
    saveReport(smashTask.taskId, JSON.stringify(smashReport), smashReport.totalScore, smashReport.summaryText, smashReport.poseBased);

    const comparison = getRetestComparison(smashTask.taskId, clearTask.taskId);

    assert.equal(comparison, null);
  });
});
