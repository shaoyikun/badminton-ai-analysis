import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildServer } from './server';
import { getTask, saveReport, saveTask } from './services/taskRepository';
import { buildErrorSnapshot } from './services/errorCatalog';
import { failTask } from './domain/analysisTask';
import { setAnalysisWorkerForTests, setUploadPreparationWorkerForTests } from './services/taskService';
import { writePoseResult } from './services/artifactStore';
import type { PoseAnalysisResult, ReportResult } from './types/task';

function buildMultipartPayload(fileName: string, content: Buffer | string, mimeType = 'video/mp4') {
  const boundary = `----badminton-test-${Date.now()}`;
  const fileBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  return {
    boundary,
    payload: Buffer.concat([header, fileBuffer, footer]),
  };
}

async function withTempWorkspace(run: (workspace: string) => Promise<void>) {
  const originalCwd = process.cwd();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-backend-test-'));

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

test('health endpoint returns ok', async (t) => {
  await withTempWorkspace(async () => {
    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });
  });
});

test('task lifecycle endpoints expose new task resource shape', async (t) => {
  await withTempWorkspace(async (workspace) => {
    setUploadPreparationWorkerForTests(async (taskId) => {
      const task = getTask(taskId)!;
      const updated = {
        ...task,
        artifacts: {
          ...task.artifacts,
          preprocess: {
            status: 'queued' as const,
            metadata: {
              ...task.artifacts.upload!,
              durationSeconds: 8,
              estimatedFrames: 80,
              width: 720,
              height: 1280,
              frameRate: 10,
              metadataSource: 'manual' as const,
            },
            segmentScan: {
              status: 'completed' as const,
              segmentDetectionVersion: 'coarse_motion_scan_v2',
              recommendedSegmentId: 'segment-02',
              selectedSegmentId: 'segment-02',
              selectedSegmentWindow: {
                startTimeMs: 6300,
                endTimeMs: 8100,
                startFrame: 48,
                endFrame: 62,
              },
              segmentSelectionMode: 'auto_recommended' as const,
              swingSegments: [
                {
                  segmentId: 'segment-01',
                  startTimeMs: 1200,
                  endTimeMs: 2100,
                  startFrame: 10,
                  endFrame: 18,
                  durationMs: 900,
                  motionScore: 0.54,
                  confidence: 0.71,
                  rankingScore: 0.61,
                  coarseQualityFlags: ['too_short'],
                  detectionSource: 'coarse_motion_scan_v2',
                },
                {
                  segmentId: 'segment-02',
                  startTimeMs: 6300,
                  endTimeMs: 8100,
                  startFrame: 48,
                  endFrame: 62,
                  durationMs: 1800,
                  motionScore: 0.84,
                  confidence: 0.88,
                  rankingScore: 0.83,
                  coarseQualityFlags: [],
                  detectionSource: 'coarse_motion_scan_v2',
                },
              ],
            },
          },
        },
      } satisfies typeof task;
      return saveTask(updated);
    });

    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'clear' },
    });

    assert.equal(createResponse.statusCode, 200);
    const created = createResponse.json() as { taskId: string; status: string; stage: string; progressPercent: number };
    assert.equal(created.status, 'created');
    assert.equal(created.stage, 'upload_pending');
    assert.equal(created.progressPercent, 0);

    const multipart = buildMultipartPayload('nested/../../clip.mp4', 'video-content');
    const uploadResponse = await app.inject({
      method: 'POST',
      url: `/api/tasks/${created.taskId}/upload`,
      headers: {
        'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
      },
      payload: multipart.payload,
    });

    assert.equal(uploadResponse.statusCode, 200);
    const uploadPayload = uploadResponse.json() as {
      status: string;
      stage: string;
      fileName?: string;
      segmentScan?: { recommendedSegmentId?: string; swingSegments?: Array<{ segmentId: string }> };
    };
    assert.equal(uploadPayload.status, 'uploaded');
    assert.equal(uploadPayload.stage, 'uploaded');
    assert.equal(uploadPayload.fileName, 'clip.mp4');
    assert.equal(uploadPayload.segmentScan?.recommendedSegmentId, 'segment-02');
    assert.equal(uploadPayload.segmentScan?.swingSegments?.length, 2);

    const storedTask = getTask(created.taskId);
    assert.ok(storedTask?.artifacts.sourceFilePath);
    assert.equal(fs.realpathSync(path.dirname(storedTask!.artifacts.sourceFilePath!)), fs.realpathSync(path.join(workspace, 'artifacts', 'tasks', created.taskId)));
  });
});

test('create task accepts smash as a public action type', async (t) => {
  await withTempWorkspace(async () => {
    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'smash' },
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as { actionType?: string; status?: string; stage?: string };
    assert.equal(payload.actionType, 'smash');
    assert.equal(payload.status, 'created');
    assert.equal(payload.stage, 'upload_pending');
  });
});

test('create task rejects unknown action type as invalid', async (t) => {
  await withTempWorkspace(async () => {
    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'drop' },
    });

    assert.equal(response.statusCode, 400);
    const payload = response.json() as { error?: { code?: string; category?: string } };
    assert.equal(payload.error?.code, 'invalid_action_type');
    assert.equal(payload.error?.category, 'request_validation');
  });
});

test('start endpoint triggers worker and task status exposes unified error object', async (t) => {
  await withTempWorkspace(async () => {
    setUploadPreparationWorkerForTests(async (taskId) => {
      const task = getTask(taskId)!;
      const updated = {
        ...task,
        artifacts: {
          ...task.artifacts,
          preprocess: {
            status: 'queued',
            metadata: {
              ...task.artifacts.upload!,
              durationSeconds: 8,
              estimatedFrames: 80,
              width: 720,
              height: 1280,
              frameRate: 10,
              metadataSource: 'manual',
            },
            segmentScan: {
              status: 'completed',
              segmentDetectionVersion: 'coarse_motion_scan_v1',
              recommendedSegmentId: 'segment-01',
              selectedSegmentId: 'segment-01',
              segmentSelectionMode: 'auto_recommended',
              swingSegments: [{
                segmentId: 'segment-01',
                startTimeMs: 1200,
                endTimeMs: 2100,
                startFrame: 10,
                endFrame: 18,
                durationMs: 900,
                motionScore: 0.54,
                confidence: 0.71,
                rankingScore: 0.61,
                coarseQualityFlags: [],
                detectionSource: 'coarse_motion_scan_v1',
              }],
            },
          },
        },
      } satisfies typeof task;
      return saveTask(updated);
    });

    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'clear' },
    });
    const created = createResponse.json() as { taskId: string };
    const multipart = buildMultipartPayload('clip.mp4', 'video-content');
    await app.inject({
      method: 'POST',
      url: `/api/tasks/${created.taskId}/upload`,
      headers: {
        'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
      },
      payload: multipart.payload,
    });

    setAnalysisWorkerForTests(async (taskId) => {
      const current = getTask(taskId);
      if (!current) return;
      saveTask(failTask(current, buildErrorSnapshot('invalid_duration', 'video duration should be between 5 and 15 seconds')));
    });

    const startResponse = await app.inject({
      method: 'POST',
      url: `/api/tasks/${created.taskId}/start`,
    });

    assert.equal(startResponse.statusCode, 200);
    const started = startResponse.json() as { status: string; stage: string };
    assert.equal(started.status, 'processing');
    assert.equal(started.stage, 'validating');

    await new Promise((resolve) => setTimeout(resolve, 200));

    const statusResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${created.taskId}`,
    });

    assert.equal(statusResponse.statusCode, 200);
    const statusPayload = statusResponse.json() as { status: string; stage: string; error?: { code?: string; category?: string } };
    assert.equal(statusPayload.status, 'failed');
    assert.equal(statusPayload.stage, 'failed');
    assert.equal(statusPayload.error?.code, 'invalid_duration');
    assert.equal(statusPayload.error?.category, 'media_validation');
  });
});

test('start endpoint persists the user-selected segment before analysis starts', async (t) => {
  await withTempWorkspace(async () => {
    setUploadPreparationWorkerForTests(async (taskId) => {
      const task = getTask(taskId)!;
      const updated = {
        ...task,
        artifacts: {
          ...task.artifacts,
          preprocess: {
            status: 'queued',
            metadata: {
              ...task.artifacts.upload!,
              durationSeconds: 8,
              estimatedFrames: 80,
              width: 720,
              height: 1280,
              frameRate: 10,
              metadataSource: 'manual',
            },
            segmentScan: {
              status: 'completed',
              segmentDetectionVersion: 'coarse_motion_scan_v1',
              recommendedSegmentId: 'segment-02',
              selectedSegmentId: 'segment-02',
              segmentSelectionMode: 'auto_recommended',
              swingSegments: [
                {
                  segmentId: 'segment-01',
                  startTimeMs: 1100,
                  endTimeMs: 2100,
                  startFrame: 8,
                  endFrame: 16,
                  durationMs: 1000,
                  motionScore: 0.52,
                  confidence: 0.68,
                  rankingScore: 0.58,
                  coarseQualityFlags: ['too_short'],
                  detectionSource: 'coarse_motion_scan_v1',
                },
                {
                  segmentId: 'segment-02',
                  startTimeMs: 6000,
                  endTimeMs: 7900,
                  startFrame: 44,
                  endFrame: 60,
                  durationMs: 1900,
                  motionScore: 0.84,
                  confidence: 0.88,
                  rankingScore: 0.82,
                  coarseQualityFlags: [],
                  detectionSource: 'coarse_motion_scan_v1',
                },
              ],
            },
          },
        },
      } satisfies typeof task;
      return saveTask(updated);
    });

    setAnalysisWorkerForTests(async () => {});

    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'clear' },
    });
    const created = createResponse.json() as { taskId: string };
    const multipart = buildMultipartPayload('clip.mp4', 'video-content');
    await app.inject({
      method: 'POST',
      url: `/api/tasks/${created.taskId}/upload`,
      headers: {
        'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
      },
      payload: multipart.payload,
    });

    const startResponse = await app.inject({
      method: 'POST',
      url: `/api/tasks/${created.taskId}/start`,
      payload: {
        selectedSegmentId: 'segment-01',
        selectedWindowOverride: {
          startTimeMs: 900,
          endTimeMs: 2400,
        },
      },
    });

    assert.equal(startResponse.statusCode, 200);
    const started = startResponse.json() as { segmentScan?: { selectedSegmentId?: string; selectedSegmentWindow?: { startTimeMs: number; endTimeMs: number } } };
    assert.equal(started.segmentScan?.selectedSegmentId, 'segment-01');
    assert.deepEqual(started.segmentScan?.selectedSegmentWindow, {
      startTimeMs: 900,
      endTimeMs: 2400,
      startFrame: 8,
      endFrame: 16,
    });
    assert.equal(getTask(created.taskId)?.artifacts.preprocess?.segmentScan?.selectedSegmentId, 'segment-01');
    assert.deepEqual(getTask(created.taskId)?.artifacts.preprocess?.segmentScan?.selectedSegmentWindow, {
      startTimeMs: 900,
      endTimeMs: 2400,
      startFrame: 8,
      endFrame: 16,
    });
  });
});

test('history detail and comparison endpoints read from dedicated projections', async (t) => {
  await withTempWorkspace(async () => {
    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });

    const first = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'clear' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'clear' },
    });

    const firstTaskId = (first.json() as { taskId: string }).taskId;
    const secondTaskId = (second.json() as { taskId: string }).taskId;
    const now = new Date().toISOString();

    const firstTask = getTask(firstTaskId)!;
    const secondTask = getTask(secondTaskId)!;
    saveTask({
      ...firstTask,
      status: 'completed',
      stage: 'completed',
      progressPercent: 100,
      completedAt: now,
      updatedAt: now,
    });
    saveTask({
      ...secondTask,
      status: 'completed',
      stage: 'completed',
      progressPercent: 100,
      baselineTaskId: firstTaskId,
      completedAt: now,
      updatedAt: now,
    });

    const firstReport: ReportResult = {
      taskId: firstTaskId,
      actionType: 'clear',
      totalScore: 70,
      summaryText: 'first',
      dimensionScores: [{ name: '准备姿态', score: 70 }],
      issues: [],
      suggestions: [],
      retestAdvice: 'retry',
      createdAt: now,
      poseBased: false,
      phaseBreakdown: [
        { phaseKey: 'preparation', label: '准备', status: 'ok', summary: '准备阶段稳定' },
        { phaseKey: 'backswing', label: '引拍', status: 'ok', summary: '引拍阶段稳定' },
        { phaseKey: 'contactCandidate', label: '击球候选', status: 'ok', summary: '击球候选阶段稳定' },
        { phaseKey: 'followThrough', label: '随挥', status: 'ok', summary: '随挥阶段稳定' },
      ],
      scoringEvidence: {
        scoringModelVersion: 'rule-v3-phase-aware',
      },
    };
    const secondReport: ReportResult = {
      taskId: secondTaskId,
      actionType: 'clear',
      totalScore: 75,
      summaryText: 'second',
      dimensionScores: [{ name: '准备姿态', score: 75 }],
      issues: [],
      suggestions: [],
      retestAdvice: 'retry',
      createdAt: now,
      poseBased: false,
      swingSegments: [
        {
          segmentId: 'segment-01',
          startTimeMs: 1200,
          endTimeMs: 2300,
          startFrame: 11,
          endFrame: 20,
          durationMs: 1100,
          motionScore: 0.74,
          confidence: 0.83,
          rankingScore: 0.8,
          coarseQualityFlags: [],
          detectionSource: 'coarse_motion_scan_v1',
        },
      ],
      recommendedSegmentId: 'segment-01',
      segmentDetectionVersion: 'coarse_motion_scan_v1',
      segmentSelectionMode: 'auto_recommended',
      selectedSegmentId: 'segment-01',
      phaseBreakdown: [
        { phaseKey: 'preparation', label: '准备', status: 'ok', summary: '准备阶段稳定' },
        { phaseKey: 'backswing', label: '引拍', status: 'ok', summary: '引拍阶段稳定' },
        { phaseKey: 'contactCandidate', label: '击球候选', status: 'ok', summary: '击球候选阶段稳定' },
        { phaseKey: 'followThrough', label: '随挥', status: 'ok', summary: '随挥阶段稳定' },
      ],
      scoringEvidence: {
        scoringModelVersion: 'rule-v3-phase-aware',
      },
    };
    saveReport(firstTaskId, JSON.stringify(firstReport), firstReport.totalScore, firstReport.summaryText, firstReport.poseBased);
    saveReport(secondTaskId, JSON.stringify(secondReport), secondReport.totalScore, secondReport.summaryText, secondReport.poseBased);

    const historyResponse = await app.inject({
      method: 'GET',
      url: '/api/history?actionType=clear',
    });
    assert.equal(historyResponse.statusCode, 200);
    const historyPayload = historyResponse.json() as { items: Array<{ taskId: string }> };
    assert.equal(historyPayload.items.length, 2);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/history/${secondTaskId}`,
    });
    assert.equal(detailResponse.statusCode, 200);
    const detailPayload = detailResponse.json() as {
      task: { taskId: string };
      report: {
        summaryText?: string;
        recommendedSegmentId?: string;
        selectedSegmentId?: string;
        swingSegments?: Array<{ segmentId: string }>;
      };
    };
    assert.equal(detailPayload.task.taskId, secondTaskId);
    assert.equal(detailPayload.report.summaryText, 'second');
    assert.equal(detailPayload.report.recommendedSegmentId, 'segment-01');
    assert.equal(detailPayload.report.selectedSegmentId, 'segment-01');
    assert.equal(detailPayload.report.swingSegments?.[0]?.segmentId, 'segment-01');

    const resultResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${secondTaskId}/result`,
    });
    assert.equal(resultResponse.statusCode, 200);
    const resultPayload = resultResponse.json() as {
      recommendedSegmentId?: string;
      segmentSelectionMode?: string;
      swingSegments?: Array<{ segmentId: string }>;
    };
    assert.equal(resultPayload.recommendedSegmentId, 'segment-01');
    assert.equal(resultPayload.segmentSelectionMode, 'auto_recommended');
    assert.equal(resultPayload.swingSegments?.length, 1);

    const comparisonResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${secondTaskId}/comparison`,
    });
    assert.equal(comparisonResponse.statusCode, 200);
    const comparisonPayload = comparisonResponse.json() as { baselineTask: { taskId: string }; comparison: { totalScoreDelta: number } | null };
    assert.equal(comparisonPayload.baselineTask.taskId, firstTaskId);
    assert.equal(comparisonPayload.comparison?.totalScoreDelta, 5);
  });
});

test('debug pose endpoint returns richer pose payload without changing route shape', async (t) => {
  await withTempWorkspace(async () => {
    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'clear' },
    });
    const taskId = (createResponse.json() as { taskId: string }).taskId;
    const poseResult: PoseAnalysisResult = {
      engine: 'mediapipe-pose',
      frameCount: 1,
      detectedFrameCount: 1,
      summary: {
        bestFrameIndex: 1,
        usableFrameCount: 1,
        coverageRatio: 1,
        medianStabilityScore: 0.84,
        medianBodyTurnScore: 0.58,
        medianRacketArmLiftScore: 0.52,
        scoreVariance: 0.01,
        rejectionReasons: [],
        rejectionReasonDetails: [{
          code: 'invalid_camera_angle',
          triggered: false,
          observed: 0,
          threshold: 4,
          comparator: '>=',
          explanation: 'debug',
        }],
        humanSummary: 'debug summary',
        viewProfile: 'rear_left_oblique',
        viewConfidence: 0.84,
        viewStability: 1,
        dominantRacketSide: 'right',
        racketSideConfidence: 0.72,
        phaseCandidates: {
          preparation: {
            anchorFrameIndex: 1,
            windowStartFrameIndex: 1,
            windowEndFrameIndex: 1,
            score: 0.72,
            sourceMetric: 'contactPreparationScore',
            detectionStatus: 'detected',
          },
          backswing: {
            anchorFrameIndex: 1,
            windowStartFrameIndex: 1,
            windowEndFrameIndex: 1,
            score: 0.66,
            sourceMetric: 'hittingArmPreparationScore',
            detectionStatus: 'detected',
          },
          contactCandidate: {
            anchorFrameIndex: 1,
            windowStartFrameIndex: 1,
            windowEndFrameIndex: 1,
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
        bestFrameOverlayRelativePath: 'artifacts/tasks/debug/pose/overlays/frame-01-overlay.jpg',
        overlayFrameCount: 1,
        debugCounts: {
          tooSmallCount: 0,
          lowStabilityCount: 0,
          unknownViewCount: 0,
          usableFrameCount: 1,
          detectedFrameCount: 1,
        },
      },
      frames: [{
        frameIndex: 1,
        fileName: 'frame-01.jpg',
        status: 'usable',
        keypoints: [],
        metrics: {
          stabilityScore: 0.84,
          shoulderSpan: 0.18,
          hipSpan: 0.14,
          bodyTurnScore: 0.58,
          racketArmLiftScore: 0.52,
          subjectScale: 0.24,
          compositeScore: 0.67,
          debug: {
            torsoHeight: 0.24,
            statusReasons: ['all_thresholds_passed'],
          },
          summaryText: 'debug',
        },
        viewProfile: 'rear_left_oblique',
        viewConfidence: 0.84,
        dominantRacketSide: 'right',
        racketSideConfidence: 0.72,
      }],
    };
    const stored = writePoseResult(taskId, poseResult);
    const task = getTask(taskId)!;
    saveTask({
      ...task,
      artifacts: {
        ...task.artifacts,
        poseResultPath: stored.absolutePath,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/debug/tasks/${taskId}/pose`,
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as typeof poseResult;
    assert.equal(payload.summary.rejectionReasonDetails?.[0]?.code, 'invalid_camera_angle');
    assert.equal(payload.summary.debugCounts?.detectedFrameCount, 1);
    assert.equal(payload.summary.phaseCandidates?.preparation.anchorFrameIndex, 1);
    assert.equal(payload.summary.phaseCandidates?.followThrough.missingReason, 'no_post_contact_frames');
    assert.equal(payload.frames[0]?.metrics?.compositeScore, 0.67);
  });
});
