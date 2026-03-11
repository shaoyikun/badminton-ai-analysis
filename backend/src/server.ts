import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createTask, getTask, saveUpload, startMockAnalysis } from './services/taskService';
import { readResult } from './services/store';

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

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
    const body = request.body as { fileName?: string; contentBase64?: string };
    if (!body?.fileName) {
      return reply.status(400).send({ error: 'fileName is required' });
    }
    const task = saveUpload(params.taskId, body.fileName, body.contentBase64);
    if (!task) {
      return reply.status(404).send({ error: 'task not found' });
    }
    return { taskId: task.taskId, status: task.status, fileName: task.fileName };
  });

  app.post('/api/tasks/:taskId/analyze', async (request, reply) => {
    const params = request.params as { taskId: string };
    const task = await startMockAnalysis(params.taskId);
    if (!task) {
      return reply.status(404).send({ error: 'task not found' });
    }
    return { taskId: task.taskId, status: 'processing' };
  });

  app.get('/api/tasks/:taskId', async (request, reply) => {
    const params = request.params as { taskId: string };
    const task = getTask(params.taskId);
    if (!task) {
      return reply.status(404).send({ error: 'task not found' });
    }
    return { taskId: task.taskId, status: task.status };
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