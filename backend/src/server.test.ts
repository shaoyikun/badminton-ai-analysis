import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildServer } from './server';
import { updateTask } from './services/taskRepository';
import { setAnalysisWorkerForTests } from './services/taskService';

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

test('upload endpoint stores streamed file inside uploads directory', async (t) => {
  await withTempWorkspace(async (workspace) => {
    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'clear' },
    });
    const createPayload = createResponse.json() as { taskId: string };
    const multipart = buildMultipartPayload('nested/../../clip.mp4', 'video-content');

    const uploadResponse = await app.inject({
      method: 'POST',
      url: `/api/tasks/${createPayload.taskId}/upload`,
      headers: {
        'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
      },
      payload: multipart.payload,
    });

    assert.equal(uploadResponse.statusCode, 200);

    const tasks = JSON.parse(fs.readFileSync(path.join(workspace, 'data', 'tasks.json'), 'utf8')) as Array<{ fileName?: string; uploadPath?: string }>;
    const task = tasks[0];
    assert.equal(task?.fileName, 'clip.mp4');
    assert.ok(task?.uploadPath);
    assert.equal(fs.realpathSync(path.dirname(task!.uploadPath!)), fs.realpathSync(path.join(workspace, 'uploads')));
  });
});

test('upload endpoint rejects files above configured limit before buffering them in memory', async (t) => {
  const originalLimit = process.env.UPLOAD_MAX_FILE_SIZE_BYTES;
  process.env.UPLOAD_MAX_FILE_SIZE_BYTES = '4';

  await withTempWorkspace(async () => {
    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });
    t.after(() => {
      if (originalLimit === undefined) {
        delete process.env.UPLOAD_MAX_FILE_SIZE_BYTES;
        return;
      }
      process.env.UPLOAD_MAX_FILE_SIZE_BYTES = originalLimit;
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'clear' },
    });
    const createPayload = createResponse.json() as { taskId: string };
    const multipart = buildMultipartPayload('clip.mp4', '12345');

    const uploadResponse = await app.inject({
      method: 'POST',
      url: `/api/tasks/${createPayload.taskId}/upload`,
      headers: {
        'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
      },
      payload: multipart.payload,
    });

    assert.equal(uploadResponse.statusCode, 413);
    assert.equal((uploadResponse.json() as { errorCode?: string }).errorCode, 'upload_failed');
  });
});

test('status endpoint surfaces invalid_duration after analyze starts', async (t) => {
  await withTempWorkspace(async (workspace) => {
    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });
    t.after(() => {
      setAnalysisWorkerForTests();
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'clear' },
    });
    const createPayload = createResponse.json() as { taskId: string };

    setAnalysisWorkerForTests(async (taskId) => {
      updateTask(taskId, {
        status: 'failed',
        errorCode: 'invalid_duration',
        preprocess: {
          status: 'failed',
          errorCode: 'invalid_duration',
          errorMessage: 'video duration should be between 5 and 15 seconds',
        },
      });
    });

    const multipart = buildMultipartPayload('too-short.mp4', 'demo-video');

    const uploadResponse = await app.inject({
      method: 'POST',
      url: `/api/tasks/${createPayload.taskId}/upload`,
      headers: {
        'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
      },
      payload: multipart.payload,
    });
    assert.equal(uploadResponse.statusCode, 200);

    const analyzeResponse = await app.inject({
      method: 'POST',
      url: `/api/tasks/${createPayload.taskId}/analyze`,
    });

    assert.equal(analyzeResponse.statusCode, 200);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const statusResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${createPayload.taskId}`,
    });

    assert.equal(statusResponse.statusCode, 200);
    const statusPayload = statusResponse.json() as { status: string; errorCode?: string; preprocessStatus: string };
    assert.equal(statusPayload.status, 'failed');
    assert.equal(statusPayload.errorCode, 'invalid_duration');
    assert.equal(statusPayload.preprocessStatus, 'failed');
  });
});

test('pose failure returns pose_failed and is visible from task status endpoint', async (t) => {
  await withTempWorkspace(async (workspace) => {
    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'smash' },
    });
    const createPayload = createResponse.json() as { taskId: string };

    updateTask(createPayload.taskId, {
      status: 'processing',
      preprocess: {
        status: 'completed',
        artifacts: {
          normalizedFileName: 'clip.mp4',
          metadataExtractedAt: new Date().toISOString(),
          artifactsDir: path.join(workspace, 'missing-artifacts'),
          manifestPath: 'data/preprocess/missing/manifest.json',
          framePlan: {
            strategy: 'uniform-sampling-ffmpeg-v1',
            targetFrameCount: 6,
            sampleTimestamps: [1, 2, 3],
          },
          sampledFrames: [],
        },
      },
    });

    const poseResponse = await app.inject({
      method: 'POST',
      url: `/api/tasks/${createPayload.taskId}/pose`,
    });

    assert.equal(poseResponse.statusCode, 422);
    const posePayload = poseResponse.json() as { errorCode?: string; poseStatus?: string };
    assert.equal(posePayload.errorCode, 'pose_failed');
    assert.equal(posePayload.poseStatus, 'failed');

    const statusResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${createPayload.taskId}`,
    });

    assert.equal(statusResponse.statusCode, 200);
    const statusPayload = statusResponse.json() as { status: string; errorCode?: string; poseStatus: string; errorMessage?: string };
    assert.equal(statusPayload.status, 'failed');
    assert.equal(statusPayload.errorCode, 'pose_failed');
    assert.equal(statusPayload.poseStatus, 'failed');
    assert.match(statusPayload.errorMessage ?? '', /no such file|not found/i);
  });
});

test('create task persists task state into local store', async (t) => {
  await withTempWorkspace(async (workspace) => {
    const app = await buildServer();
    t.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { actionType: 'clear' },
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as { taskId: string; status: string };
    assert.match(payload.taskId, /^task_/);
    assert.equal(payload.status, 'created');

    const tasksFile = path.join(workspace, 'data', 'tasks.json');
    assert.equal(fs.existsSync(tasksFile), true);

    const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8')) as Array<{ taskId: string; actionType: string; status: string }>;
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.taskId, payload.taskId);
    assert.equal(tasks[0]?.actionType, 'clear');
    assert.equal(tasks[0]?.status, 'created');
  });
});
