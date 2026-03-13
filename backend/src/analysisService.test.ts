import assert from 'node:assert/strict';
import test from 'node:test';
import { AnalysisServiceExecutionError, detectSwingSegmentsForVideo, estimatePoseForTaskDir, setRunJsonCommandForTests } from './services/analysisService';
import { setAnalysisServiceConcurrencyForTests } from './services/analysisServiceRunner';
import { CommandExecutionError } from './services/commandRunner';

function buildPoseResult() {
  return {
    engine: 'mediapipe-pose',
    frameCount: 1,
    detectedFrameCount: 1,
    summary: {
      bestFrameIndex: 1,
      usableFrameCount: 1,
      coverageRatio: 1,
      medianStabilityScore: 0.9,
      medianBodyTurnScore: 0.5,
      medianRacketArmLiftScore: 0.5,
      scoreVariance: 0,
      rejectionReasons: [],
      humanSummary: 'ok',
    },
    frames: [],
  };
}

test.afterEach(() => {
  setRunJsonCommandForTests();
  setAnalysisServiceConcurrencyForTests();
});

test('estimatePoseForTaskDir maps timeout failures to analysis-service execution error', async () => {
  setRunJsonCommandForTests(async () => {
    throw new CommandExecutionError({
      command: 'python3',
      args: ['app.py'],
      stage: 'analysis-service pose estimation',
      timedOut: true,
      failureKind: 'timeout',
      message: 'timed out',
    });
  });

  await assert.rejects(
    () => estimatePoseForTaskDir('artifacts/tasks/task_timeout/preprocess'),
    (error: unknown) => (
      error instanceof AnalysisServiceExecutionError
      && error.stage === 'pose'
      && error.failureKind === 'timeout'
    ),
  );
});

test('estimatePoseForTaskDir maps invalid JSON failures to analysis-service execution error', async () => {
  setRunJsonCommandForTests(async () => {
    throw new CommandExecutionError({
      command: 'python3',
      args: ['app.py'],
      stage: 'analysis-service pose estimation',
      failureKind: 'invalid_json',
      message: 'invalid json',
    });
  });

  await assert.rejects(
    () => estimatePoseForTaskDir('artifacts/tasks/task_invalid_json/preprocess'),
    (error: unknown) => (
      error instanceof AnalysisServiceExecutionError
      && error.stage === 'pose'
      && error.failureKind === 'invalid_json'
    ),
  );
});

test('detectSwingSegmentsForVideo maps non-zero exit failures to analysis-service execution error', async () => {
  setRunJsonCommandForTests(async () => {
    throw new CommandExecutionError({
      command: 'python3',
      args: ['app.py', 'detect-segments'],
      stage: 'analysis-service segment detection',
      exitCode: 1,
      failureKind: 'non_zero_exit',
      message: 'exit 1',
    });
  });

  await assert.rejects(
    () => detectSwingSegmentsForVideo('/tmp/clip.mp4'),
    (error: unknown) => (
      error instanceof AnalysisServiceExecutionError
      && error.stage === 'segment_detection'
      && error.failureKind === 'non_zero_exit'
    ),
  );
});

test('analysis-service concurrency limit keeps only two active executions at a time', async () => {
  setAnalysisServiceConcurrencyForTests(2);

  let activeCount = 0;
  let maxActiveCount = 0;
  let releaseResolver: (() => void) | undefined;
  const releasePromise = new Promise<void>((resolve) => {
    releaseResolver = resolve;
  });

  setRunJsonCommandForTests((async () => {
    activeCount += 1;
    maxActiveCount = Math.max(maxActiveCount, activeCount);
    await releasePromise;
    activeCount -= 1;
    return { result: buildPoseResult() };
  }) as typeof import('./services/commandRunner').runJsonCommand);

  const executions = [
    estimatePoseForTaskDir('artifacts/tasks/task_concurrency_01/preprocess'),
    estimatePoseForTaskDir('artifacts/tasks/task_concurrency_02/preprocess'),
    estimatePoseForTaskDir('artifacts/tasks/task_concurrency_03/preprocess'),
  ];

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(maxActiveCount, 2);
  releaseResolver?.();
  await Promise.all(executions);
  assert.equal(maxActiveCount, 2);
});
