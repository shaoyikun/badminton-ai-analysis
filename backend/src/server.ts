import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { CreateTaskRequest, HistoryListQuery, ReportResult } from './types/task';
import { getTask, getReportRow } from './services/taskRepository';
import { getMaxFileSizeBytes } from './services/preprocessService';
import {
  assertActionType,
  createAnalysisTask,
  getHistoryDetail,
  getPoseResultForDebug,
  getRetestComparison,
  listTaskHistory,
  migrateLegacyStoreIfNeeded,
  recoverStaleTasks,
  saveUpload,
  startAnalysis,
} from './services/taskService';
import { buildErrorSnapshot, getErrorStatusCode } from './services/errorCatalog';
import { getArtifactsDir } from './services/database';
import { toTaskResource } from './types/task';

function sendError(reply: { status: (code: number) => { send: (payload: unknown) => unknown } }, code: Parameters<typeof buildErrorSnapshot>[0], message?: string) {
  const error = buildErrorSnapshot(code, message);
  return reply.status(getErrorStatusCode(code)).send({ error });
}

function readReport(taskId: string) {
  const row = getReportRow(taskId);
  return row ? JSON.parse(row.report_json) as ReportResult : undefined;
}

export async function buildServer() {
  await migrateLegacyStoreIfNeeded();
  recoverStaleTasks();

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: getMaxFileSizeBytes(),
    },
  });

  fs.mkdirSync(getArtifactsDir(), { recursive: true });

  await app.register(fastifyStatic, {
    root: getArtifactsDir(),
    prefix: '/artifacts/',
  });

  app.get('/health', async () => ({ ok: true }));

  app.post('/api/tasks', async (request, reply) => {
    const body = request.body as Partial<CreateTaskRequest>;
    if (!body?.actionType) {
      return sendError(reply, 'invalid_action_type');
    }

    try {
      assertActionType(body.actionType);
      const task = createAnalysisTask(body.actionType);
      return toTaskResource(task);
    } catch (error) {
      return sendError(reply, 'invalid_action_type', error instanceof Error ? error.message : undefined);
    }
  });

  app.get('/api/history', async (request) => {
    const query = request.query as HistoryListQuery;
    return listTaskHistory(query);
  });

  app.post('/api/tasks/:taskId/upload', async (request, reply) => {
    const params = request.params as { taskId: string };
    const task = getTask(params.taskId);
    if (!task) {
      return sendError(reply, 'task_not_found');
    }
    if (task.status !== 'created' || task.stage !== 'upload_pending') {
      return sendError(reply, 'invalid_task_state');
    }

    let file;
    try {
      file = await request.file();
    } catch (error) {
      if (error instanceof Error && /too large/i.test(error.message)) {
        return sendError(reply, 'upload_failed', 'file exceeds current upload limit');
      }
      throw error;
    }

    if (!file) {
      return sendError(reply, 'file_required');
    }

    const stagedUploadPath = path.join(os.tmpdir(), `badminton-upload-${params.taskId}-${randomUUID().slice(0, 8)}.tmp`);

    try {
      await pipeline(file.file, fs.createWriteStream(stagedUploadPath, { flags: 'wx' }));
      if (file.file.truncated) {
        fs.rmSync(stagedUploadPath, { force: true });
        return sendError(reply, 'upload_failed', 'file exceeds current upload limit');
      }
    } catch (error) {
      fs.rmSync(stagedUploadPath, { force: true });
      return sendError(reply, 'upload_failed', error instanceof Error ? error.message : 'failed to persist upload');
    }

    try {
      const updated = saveUpload(params.taskId, file.filename, stagedUploadPath, file.mimetype);
      if (!updated) {
        fs.rmSync(stagedUploadPath, { force: true });
        return sendError(reply, 'task_not_found');
      }

      return {
        ...toTaskResource(updated),
        fileName: updated.artifacts.upload?.fileName,
      };
    } catch (error) {
      fs.rmSync(stagedUploadPath, { force: true });
      return sendError(reply, 'upload_failed', error instanceof Error ? error.message : 'failed to persist upload');
    }
  });

  app.post('/api/tasks/:taskId/start', async (request, reply) => {
    const params = request.params as { taskId: string };
    const task = getTask(params.taskId);
    if (!task) {
      return sendError(reply, 'task_not_found');
    }
    if (task.status !== 'uploaded' || task.stage !== 'uploaded') {
      return sendError(reply, 'invalid_task_state');
    }

    try {
      const updated = await startAnalysis(params.taskId);
      if (!updated) {
        return sendError(reply, 'task_not_found');
      }
      return toTaskResource(updated);
    } catch (error) {
      return sendError(reply, 'internal_error', error instanceof Error ? error.message : undefined);
    }
  });

  app.get('/api/tasks/:taskId', async (request, reply) => {
    const params = request.params as { taskId: string };
    const task = getTask(params.taskId);
    if (!task) {
      return sendError(reply, 'task_not_found');
    }
    return toTaskResource(task);
  });

  app.get('/api/tasks/:taskId/result', async (request, reply) => {
    const params = request.params as { taskId: string };
    const task = getTask(params.taskId);
    if (!task) {
      return sendError(reply, 'task_not_found');
    }
    const report = readReport(params.taskId);
    if (!report) {
      return sendError(reply, 'result_not_ready');
    }
    return report;
  });

  app.get('/api/history/:taskId', async (request, reply) => {
    const params = request.params as { taskId: string };
    const detail = getHistoryDetail(params.taskId);
    if (!detail) {
      return sendError(reply, 'task_not_found');
    }
    return detail;
  });

  app.get('/api/tasks/:taskId/comparison', async (request, reply) => {
    const params = request.params as { taskId: string };
    const query = request.query as { baselineTaskId?: string };
    const payload = getRetestComparison(params.taskId, query.baselineTaskId);

    if (payload === null) {
      return sendError(reply, 'comparison_action_mismatch');
    }
    if (!payload) {
      return sendError(reply, 'result_not_ready', 'comparison unavailable');
    }
    return payload;
  });

  app.get('/api/debug/tasks/:taskId/pose', async (request, reply) => {
    const params = request.params as { taskId: string };
    const result = getPoseResultForDebug(params.taskId);
    if (!result) {
      return sendError(reply, 'result_not_ready');
    }
    return result;
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 8787);

  buildServer()
    .then((app) => app.listen({ port, host: '0.0.0.0' }))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
