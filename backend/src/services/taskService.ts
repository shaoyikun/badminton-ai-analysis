import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readTasks, writeTasks, saveResult, readResultByTaskId } from './store';
import { ReportResult, RetestComparison, RetestCoachReview, TaskHistoryItem, TaskRecord } from '../types/task';
import { runPreprocess } from './preprocessService';
import { runPoseAnalysis } from './poseService';
import { buildMockResult } from './reportScoringService';

function now() {
  return new Date().toISOString();
}

const activeAnalysisTasks = new Map<string, Promise<void>>();

type AnalysisWorker = (taskId: string) => Promise<void>;

function clampDelta(value: number) {
  return Math.round(value);
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getAnalysisDelayMs() {
  const configured = Number(process.env.MOCK_ANALYSIS_DELAY_MS ?? 2500);
  if (!Number.isFinite(configured) || configured < 0) {
    return 2500;
  }
  return Math.round(configured);
}

function getUploadsDir() {
  return path.resolve(process.cwd(), 'uploads');
}

function getUploadBaseName(fileName: string) {
  const normalized = fileName.replace(/\\/g, '/');
  const baseName = path.posix.basename(normalized).trim();
  return baseName || 'upload.bin';
}

function getSafeUploadExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return /^[.a-z0-9]+$/.test(extension) ? extension : '';
}

function removeFileIfExists(target?: string) {
  if (target && fs.existsSync(target)) {
    fs.rmSync(target, { force: true });
  }
}

function moveFile(sourcePath: string, targetPath: string) {
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
      throw error;
    }

    fs.copyFileSync(sourcePath, targetPath);
    fs.rmSync(sourcePath, { force: true });
  }
}

function getActionLabel(actionType: string) {
  return actionType === 'smash' ? '杀球' : '正手高远球';
}

function buildTaskHistory(actionType: string, currentTaskId?: string): TaskHistoryItem[] {
  return readTasks()
    .filter((task) => task.actionType === actionType && task.status === 'completed' && task.resultPath)
    .map((task) => {
      const result = readResultByTaskId(task.taskId);
      return {
        taskId: task.taskId,
        actionType: task.actionType,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        totalScore: result?.totalScore,
        summaryText: result?.summaryText,
        poseBased: result?.poseBased,
      } satisfies TaskHistoryItem;
    })
    .filter((item) => item.taskId !== currentTaskId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function buildCoachReview(actionType: string, comparison: Omit<RetestComparison, 'coachReview'>): RetestCoachReview {
  const actionLabel = getActionLabel(actionType);
  const topImprovement = comparison.improvedDimensions[0];
  const topRegression = comparison.declinedDimensions[0];
  const stableDimension = comparison.unchangedDimensions[0];

  let headline = `${actionLabel}这次和对比样本相比，整体还在同一训练方向上。`;
  if (comparison.totalScoreDelta >= 6) {
    headline = `${actionLabel}这次能看出明显进步，不只是分数抬了，动作主线也更顺了。`;
  } else if (comparison.totalScoreDelta > 0) {
    headline = `${actionLabel}这次是在往好的方向走，属于小幅但真实的进步。`;
  } else if (comparison.totalScoreDelta <= -6) {
    headline = `${actionLabel}这次有点往回掉，说明动作还没完全稳定下来。`;
  } else if (comparison.totalScoreDelta < 0) {
    headline = `${actionLabel}这次略有回落，但更像稳定性波动，不一定是方向走错。`;
  }

  const progressNote = topImprovement
    ? `最值得肯定的是 ${topImprovement.name}，从 ${topImprovement.previousScore} 分提到 ${topImprovement.currentScore} 分，说明最近训练已经开始往这个环节起作用了。`
    : stableDimension
      ? `${stableDimension.name} 这次基本和对比样本持平，说明你至少把动作底子维持住了，没有明显跑偏。`
      : '这次虽然没有特别突出的单项提升，但整体动作没有明显散掉，说明训练节奏还在。';

  const keepDoing = topImprovement
    ? `${topImprovement.name} 这一项已经开始抬上来了，这一轮先别换太多练法，优先把现在有效的训练节奏继续保住。`
    : stableDimension
      ? `${stableDimension.name} 这一项基本稳住了，说明当前动作主线没有散，后面继续沿着这个节奏练就行。`
      : undefined;

  const regressionNote = topRegression
    ? `${topRegression.name} 这次从 ${topRegression.previousScore} 分掉到 ${topRegression.currentScore} 分，这更像是击球节奏或准备阶段没接顺，建议先回看这一段，不要急着同时改太多点。`
    : undefined;

  const nextFocus = topRegression
    ? `下一次复测，先优先盯 ${topRegression.name}，同时把 ${topImprovement?.name ?? stableDimension?.name ?? '动作连贯性'} 保住，目标不是一次改完，而是先把最关键的短板收回来。`
    : topImprovement
      ? `下一次复测，优先看 ${topImprovement.name} 能不能继续稳定复现，再顺手观察 ${comparison.improvedDimensions[1]?.name ?? '其余维度'} 有没有被一起带上来。`
      : '下一次复测，先保持同机位和同节奏录制，重点看动作能不能稳定复现，而不是只追求单次最好效果。';

  const nextCheck = topRegression
    ? `下次录制时，先看 ${topRegression.name} 有没有止跌回稳，再确认 ${topImprovement?.name ?? stableDimension?.name ?? '主动作框架'} 有没有被一起保住。`
    : topImprovement
      ? `下次录制时，先确认 ${topImprovement.name} 不是偶尔做对，而是能连续复现。`
      : '下次录制时，重点确认动作节奏、机位和击球过程是否都还能稳定复现。';

  return {
    headline,
    progressNote,
    keepDoing,
    regressionNote,
    nextFocus,
    nextCheck,
  };
}

function buildRetestComparison(actionType: string, previous: ReportResult, current: ReportResult): RetestComparison {
  const deltas = current.dimensionScores.map((dimension) => {
    const previousDimension = previous.dimensionScores.find((item) => item.name === dimension.name);
    const previousScore = previousDimension?.score ?? 0;
    return {
      name: dimension.name,
      previousScore,
      currentScore: dimension.score,
      delta: clampDelta(dimension.score - previousScore),
    };
  });

  const improvedDimensions = deltas.filter((item) => item.delta > 0).sort((a, b) => b.delta - a.delta);
  const declinedDimensions = deltas.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta);
  const unchangedDimensions = deltas.filter((item) => item.delta === 0);
  const totalScoreDelta = clampDelta(current.totalScore - previous.totalScore);

  let summaryText = '和对比样本相比，这次数据整体比较接近，建议继续保持同机位复测，观察动作稳定性。';
  if (totalScoreDelta > 0 && improvedDimensions.length > 0) {
    const names = improvedDimensions.slice(0, 2).map((item) => item.name).join('、');
    summaryText = `和对比样本相比，这次总分提升 ${totalScoreDelta} 分，最明显的进步在 ${names}。`;
  } else if (totalScoreDelta < 0 && declinedDimensions.length > 0) {
    const names = declinedDimensions.slice(0, 2).map((item) => item.name).join('、');
    summaryText = `和对比样本相比，这次总分下降 ${Math.abs(totalScoreDelta)} 分，主要回落在 ${names}，建议优先回看这几个维度。`;
  }

  const comparison = {
    previousTaskId: previous.taskId,
    previousCreatedAt: previous.createdAt,
    currentTaskId: current.taskId,
    currentCreatedAt: current.createdAt,
    totalScoreDelta,
    improvedDimensions,
    declinedDimensions,
    unchangedDimensions,
    summaryText,
  };

  return {
    ...comparison,
    coachReview: buildCoachReview(actionType, comparison),
  };
}

function enrichResultWithHistory(task: TaskRecord, result: ReportResult): ReportResult {
  const history = buildTaskHistory(task.actionType, task.taskId);
  const previousTaskId = task.previousCompletedTaskId ?? history[0]?.taskId;
  const previousResult = previousTaskId ? readResultByTaskId(previousTaskId) : undefined;

  return {
    ...result,
    history,
    comparison: previousResult ? buildRetestComparison(task.actionType, previousResult, result) : undefined,
  };
}

function findLatestCompletedTaskId(actionType: string, excludeTaskId?: string) {
  return readTasks()
    .filter((task) => task.actionType === actionType && task.status === 'completed' && task.resultPath && task.taskId !== excludeTaskId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]?.taskId;
}

function getComparableResult(taskId: string) {
  const task = getTask(taskId);
  const result = readResultByTaskId(taskId);
  if (!task || !result) return undefined;
  return { task, result };
}

export function createTask(actionType: string): TaskRecord {
  const tasks = readTasks();
  const task: TaskRecord = {
    taskId: `task_${randomUUID().slice(0, 8)}`,
    actionType,
    status: 'created',
    preprocess: {
      status: 'idle',
    },
    pose: {
      status: 'idle',
    },
    previousCompletedTaskId: findLatestCompletedTaskId(actionType),
    createdAt: now(),
    updatedAt: now(),
  };
  tasks.push(task);
  writeTasks(tasks);
  return task;
}

export function getTask(taskId: string): TaskRecord | undefined {
  return readTasks().find((task) => task.taskId === taskId);
}

export function listTaskHistory(actionType?: string): TaskHistoryItem[] {
  const tasks = readTasks()
    .filter((task) => task.status === 'completed' && task.resultPath)
    .filter((task) => !actionType || task.actionType === actionType)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return tasks.map((task) => {
    const result = readResultByTaskId(task.taskId);
    return {
      taskId: task.taskId,
      actionType: task.actionType,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      totalScore: result?.totalScore,
      summaryText: result?.summaryText,
      poseBased: result?.poseBased,
    } satisfies TaskHistoryItem;
  });
}

export function getRetestComparison(taskId: string) {
  const task = getTask(taskId);
  if (!task?.resultPath) return undefined;
  const current = readResultByTaskId(taskId);
  if (!current) return undefined;

  const previousTaskId = task.previousCompletedTaskId ?? buildTaskHistory(task.actionType, taskId)[0]?.taskId;
  if (!previousTaskId) {
    return {
      current,
      previous: undefined,
      comparison: undefined,
      history: buildTaskHistory(task.actionType, taskId),
    };
  }

  const previous = readResultByTaskId(previousTaskId);
  return {
    current,
    previous,
    comparison: previous ? buildRetestComparison(task.actionType, previous, current) : undefined,
    history: buildTaskHistory(task.actionType, taskId),
  };
}

export function getCustomRetestComparison(currentTaskId: string, previousTaskId: string) {
  const currentPayload = getComparableResult(currentTaskId);
  const previousPayload = getComparableResult(previousTaskId);
  if (!currentPayload || !previousPayload) return undefined;
  if (currentPayload.task.actionType !== previousPayload.task.actionType) return null;

  return {
    current: currentPayload.result,
    previous: previousPayload.result,
    comparison: buildRetestComparison(currentPayload.task.actionType, previousPayload.result, currentPayload.result),
    history: buildTaskHistory(currentPayload.task.actionType),
  };
}

export function updateTask(taskId: string, patch: Partial<TaskRecord>): TaskRecord | undefined {
  const tasks = readTasks();
  const index = tasks.findIndex((task) => task.taskId === taskId);
  if (index === -1) return undefined;
  tasks[index] = {
    ...tasks[index],
    ...patch,
    preprocess: patch.preprocess ? { ...(tasks[index].preprocess ?? { status: 'idle' }), ...patch.preprocess } : tasks[index].preprocess,
    pose: patch.pose ? { ...(tasks[index].pose ?? { status: 'idle' }), ...patch.pose } : tasks[index].pose,
    updatedAt: now(),
  };
  writeTasks(tasks);
  return tasks[index];
}

export function saveUpload(taskId: string, fileName: string, stagedUploadPath: string, mimeType?: string) {
  const current = getTask(taskId);
  if (!current) {
    removeFileIfExists(stagedUploadPath);
    return undefined;
  }

  const uploadsDir = getUploadsDir();
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const baseFileName = getUploadBaseName(fileName);
  const uploadPath = path.join(uploadsDir, `${taskId}-${randomUUID().slice(0, 8)}${getSafeUploadExtension(baseFileName)}`);

  moveFile(stagedUploadPath, uploadPath);
  if (current.uploadPath && current.uploadPath !== uploadPath) {
    removeFileIfExists(current.uploadPath);
  }

  return updateTask(taskId, {
    fileName: baseFileName,
    mimeType,
    uploadPath,
    status: 'uploaded',
    preprocess: {
      status: 'idle',
      startedAt: undefined,
      completedAt: undefined,
      errorCode: undefined,
      metadata: undefined,
      artifacts: undefined,
      errorMessage: undefined,
    },
    pose: {
      status: 'idle',
      startedAt: undefined,
      completedAt: undefined,
      errorMessage: undefined,
      resultPath: undefined,
      summary: undefined,
    },
  });
}

async function runAnalysisPipeline(taskId: string) {
  let task = getTask(taskId);
  if (!task?.uploadPath) return;

  if (task.preprocess?.status !== 'completed') {
    const preprocessed = await runPreprocess(taskId);
    if (!preprocessed || preprocessed.preprocess?.status !== 'completed') {
      updateTask(taskId, {
        status: 'failed',
        errorCode: preprocessed?.preprocess?.errorCode ?? 'preprocess_failed',
      });
      return;
    }
    task = preprocessed;
  }

  if (task.pose?.status !== 'completed') {
    const posed = await runPoseAnalysis(taskId);
    if (posed) {
      task = posed;
    }
  }

  await delay(getAnalysisDelayMs());

  const latest = getTask(taskId);
  if (!latest || latest.status === 'failed') return;
  const rawResult = buildMockResult(latest);
  const enrichedResult = enrichResultWithHistory(latest, rawResult);
  const resultPath = saveResult(taskId, enrichedResult);
  updateTask(taskId, { status: 'completed', resultPath });
}

let analysisWorker: AnalysisWorker = runAnalysisPipeline;

function queueAnalysisTask(taskId: string) {
  if (activeAnalysisTasks.has(taskId)) return;

  const taskPromise = analysisWorker(taskId)
    .catch((error) => {
      const current = getTask(taskId);
      updateTask(taskId, {
        status: 'failed',
        errorCode: 'preprocess_failed',
        preprocess: {
          ...(current?.preprocess ?? { status: 'failed' }),
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'analysis failed unexpectedly',
        },
      });
    })
    .finally(() => {
      activeAnalysisTasks.delete(taskId);
    });

  activeAnalysisTasks.set(taskId, taskPromise);
}

export async function startMockAnalysis(taskId: string) {
  const current = getTask(taskId);
  if (!current) return undefined;
  if (!current.uploadPath) return undefined;

  if (activeAnalysisTasks.has(taskId) && current.status === 'processing') {
    return current;
  }

  const processingTask = updateTask(taskId, {
    status: 'processing',
    errorCode: undefined,
    preprocess: current.preprocess?.status === 'completed'
      ? current.preprocess
      : {
          ...(current.preprocess ?? { status: 'idle' }),
          status: 'queued',
          startedAt: undefined,
          completedAt: undefined,
          errorCode: undefined,
          errorMessage: undefined,
          metadata: undefined,
          artifacts: undefined,
        },
    pose: current.pose?.status === 'completed'
      ? current.pose
      : {
          ...(current.pose ?? { status: 'idle' }),
          status: 'idle',
          startedAt: undefined,
          completedAt: undefined,
          errorMessage: undefined,
          resultPath: undefined,
          summary: undefined,
        },
  });
  if (!processingTask) return undefined;

  queueAnalysisTask(taskId);
  return processingTask;
}

export function setAnalysisWorkerForTests(worker?: AnalysisWorker) {
  analysisWorker = worker ?? runAnalysisPipeline;
}

export function getActiveAnalysisTaskForTests(taskId: string) {
  return activeAnalysisTasks.get(taskId);
}
