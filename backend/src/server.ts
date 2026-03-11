import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { createTask, getTask, saveUpload, startMockAnalysis } from './services/taskService';
import { getPreprocessSummary, runPreprocess } from './services/preprocessService';
import { readResult } from './services/store';

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

  await app.register(multipart);

  app.get('/health', async () => ({ ok: true }));

  app.post('/api/tasks', async (request, reply) => {
    const body = request.body as { actionType?: string };
    const actionType = body?.actionType;
    if (!actionType) {
      return reply.status(400).send({ error: 'actionType is required' });
    }
    const task = createTask(actionType);
    return { taskId: task.taskId, status: task.status };
  });

  app.post('/api/tasks/:taskId/upload', async (request, reply) => {
    const params = request.params as { taskId: string };
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'file is required' });
    }
    const buffer = await file.toBuffer();
    const task = saveUpload(params.taskId, file.filename, buffer, file.mimetype);
    if (!task) {
      return reply.status(404).send({ error: 'task not found' });
    }
    return {
      taskId: task.taskId,
      status: task.status,
      fileName: task.fileName,
      preprocessStatus: task.preprocess?.status ?? 'idle',
    };
  });

  app.post('/api/tasks/:taskId/preprocess', async (request, reply) => {
    const params = request.params as { taskId: string };
    const task = getTask(params.taskId);
    if (!task) {
      return reply.status(404).send({ error: 'task not found' });
    }
    if (!task.uploadPath) {
      return reply.status(409).send({ error: 'upload required before preprocess' });
    }
    const updated = await runPreprocess(params.taskId);
    if (!updated) {
      return reply.status(500).send({ error: 'preprocess failed to start' });
    }
    return {
      taskId: updated.taskId,
      status: updated.status,
      preprocess: updated.preprocess,
    };
  });

  app.get('/api/tasks/:taskId/preprocess', async (request, reply) => {
    const params = request.params as { taskId: string };
    const summary = getPreprocessSummary(params.taskId);
    if (!summary) {
      return reply.status(404).send({ error: 'task not found' });
    }
    return summary;
  });

  app.post('/api/tasks/:taskId/analyze', async (request, reply) => {
    const params = request.params as { taskId: string };
    const task = getTask(params.taskId);
    if (!task) {
      return reply.status(404).send({ error: 'task not found' });
    }
    if (!task.uploadPath) {
      return reply.status(409).send({ error: 'upload required before analyze' });
    }
    const updated = await startMockAnalysis(params.taskId);
    if (!updated) {
      return reply.status(500).send({ error: 'failed to start analysis' });
    }
    return {
      taskId: updated.taskId,
      status: updated.status,
      preprocessStatus: updated.preprocess?.status ?? 'idle',
    };
  });

  app.get('/api/tasks/:taskId', async (request, reply) => {
    const params = request.params as { taskId: string };
    const task = getTask(params.taskId);
    if (!task) {
      return reply.status(404).send({ error: 'task not found' });
    }
    return {
      taskId: task.taskId,
      status: task.status,
      preprocessStatus: task.preprocess?.status ?? 'idle',
      updatedAt: task.updatedAt,
    };
  });

  app.get('/api/tasks/:taskId/result', async (request, reply) => {
    const params = request.params as { taskId: string };
    const task = getTask(params.taskId);
    if (!task) {
      return reply.status(404).send({ error: 'task not found' });
    }
    if (!task.resultPath) {
      return reply.status(409).send({ error: 'result not ready' });
    }
    return readResult(task.resultPath);
  });

  return app;
}

buildServer()
  .then((app) => app.listen({ port: 8787, host: '0.0.0.0' }))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
