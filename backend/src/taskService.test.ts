import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { PoseAnalysisResult, ReportResult } from './types/task';
import { writePoseResult } from './services/artifactStore';
import { getReportRow, getTask, saveReport, saveTask } from './services/taskRepository';
import { createTask, getActiveAnalysisTaskForTests, getRetestComparison, runAnalysisPipelineForTests, saveUpload, setAnalysisWorkerForTests, startMockAnalysis } from './services/taskService';

async function withTempWorkspace(run: (workspace: string) => Promise<void>) {
  const originalCwd = process.cwd();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-task-service-test-'));

  process.chdir(workspace);
  fs.mkdirSync(path.join(workspace, 'data'), { recursive: true });

  try {
    await run(workspace);
  } finally {
    setAnalysisWorkerForTests();
    process.chdir(originalCwd);
    fs.rmSync(workspace, { recursive: true, force: true });
  }
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
      scoringEvidence: {
        scoringModelVersion: 'rule-v2-evidence-confidence',
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
      scoringEvidence: {
        scoringModelVersion: 'rule-v2-evidence-confidence',
      },
    };

    saveReport(first.taskId, JSON.stringify(firstReport), firstReport.totalScore, firstReport.summaryText, firstReport.poseBased);
    saveReport(second.taskId, JSON.stringify(secondReport), secondReport.totalScore, secondReport.summaryText, secondReport.poseBased);

    const comparison = getRetestComparison(second.taskId, first.taskId);

    assert.ok(comparison);
    assert.match(comparison?.comparison.summaryText ?? '', /最明显的提升在 身体准备、挥拍臂准备/);
    assert.deepEqual(comparison?.comparison.coachReview.focusDimensions, ['身体准备', '挥拍臂准备']);
    assert.match(comparison?.comparison.coachReview.nextFocus ?? '', /先只盯 身体准备、挥拍臂准备/);
    assert.match(comparison?.comparison.coachReview.nextCheck ?? '', /身体准备/);
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
      scoringEvidence: {
        scoringModelVersion: 'rule-v2-evidence-confidence',
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
      scoringEvidence: {
        scoringModelVersion: 'rule-v2-evidence-confidence',
      },
    };

    saveReport(first.taskId, JSON.stringify(firstReport), firstReport.totalScore, firstReport.summaryText, firstReport.poseBased);
    saveReport(second.taskId, JSON.stringify(secondReport), secondReport.totalScore, secondReport.summaryText, secondReport.poseBased);

    const comparison = getRetestComparison(second.taskId, first.taskId);

    assert.ok(comparison);
    assert.match(comparison?.comparison.summaryText ?? '', /主要回落在 挥拍复现稳定性、挥拍臂准备/);
    assert.match(comparison?.comparison.summaryText ?? '', /身体准备 还基本守住/);
    assert.deepEqual(comparison?.comparison.coachReview.focusDimensions, ['挥拍复现稳定性', '身体准备']);
    assert.match(comparison?.comparison.coachReview.nextFocus ?? '', /先只盯 挥拍复现稳定性、身体准备/);
    assert.match(comparison?.comparison.coachReview.regressionNote ?? '', /挥拍复现稳定性 这次从 76 分掉到 70 分/);
  });
});

test('getRetestComparison degrades to total-score-only comparison across scoring model versions', async () => {
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
        scoringModelVersion: 'rule-v2-evidence-confidence',
      },
    };

    saveReport(first.taskId, JSON.stringify(firstReport), firstReport.totalScore, firstReport.summaryText, firstReport.poseBased);
    saveReport(second.taskId, JSON.stringify(secondReport), secondReport.totalScore, secondReport.summaryText, secondReport.poseBased);

    const comparison = getRetestComparison(second.taskId, first.taskId);

    assert.ok(comparison);
    assert.equal(comparison?.comparison.totalScoreDelta, 5);
    assert.deepEqual(comparison?.comparison.improvedDimensions, []);
    assert.deepEqual(comparison?.comparison.declinedDimensions, []);
    assert.deepEqual(comparison?.comparison.unchangedDimensions, []);
    assert.match(comparison?.comparison.summaryText ?? '', /评分模型已升级/);
  });
});
