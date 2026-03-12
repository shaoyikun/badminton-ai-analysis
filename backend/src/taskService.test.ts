import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getTask } from './services/taskRepository';
import { createTask, getActiveAnalysisTaskForTests, saveUpload, setAnalysisWorkerForTests, startMockAnalysis } from './services/taskService';

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

test('saveUpload strips directory segments from uploaded filename', async () => {
  await withTempWorkspace(async (workspace) => {
    const task = createTask('clear');
    const stagedUploadPath = path.join(workspace, 'incoming.tmp');
    fs.writeFileSync(stagedUploadPath, 'demo');

    const updated = saveUpload(task.taskId, 'nested/../../clip.mp4', stagedUploadPath, 'video/mp4');

    assert.ok(updated);
    assert.equal(updated?.fileName, 'clip.mp4');
    assert.ok(updated?.uploadPath);
    assert.equal(fs.realpathSync(path.dirname(updated!.uploadPath!)), fs.realpathSync(path.join(workspace, 'uploads')));
    assert.match(path.basename(updated!.uploadPath!), /^task_[a-z0-9]{8}-[a-z0-9]{8}\.mp4$/);
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
    assert.equal(started.preprocess?.status, 'queued');
    assert.ok(getActiveAnalysisTaskForTests(task.taskId));
    assert.equal(getTask(task.taskId)?.status, 'processing');

    resolveWorker?.();
    await getActiveAnalysisTaskForTests(task.taskId);
  });
});
