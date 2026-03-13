import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ActionType,
  AnalysisTaskRecord,
  ComparisonResponse,
  HistoryDetailResponse,
  HistoryListQuery,
  HistoryListResponse,
  PoseAnalysisResult,
  ReportResult,
  RetestComparison,
  RetestCoachReview,
  TaskHistoryItem,
  TaskResource,
} from '../types/task';
import { createTaskRecord, enterStage, failTask, markTaskStarted, markTaskUploaded, mergeArtifacts, completeTask } from '../domain/analysisTask';
import { fileExists, prepareTaskArtifactsDir, readJsonFile, storeUploadedVideo, writePoseResult, writePreprocessManifest, writeReportFile } from './artifactStore';
import { buildRuleBasedResult, getPoseQualityFailure } from './reportScoringService';
import { getMaxFileSizeBytes, extractFrames, probeVideo, validateUploadedVideo } from './preprocessService';
import { buildPoseSummary, readPoseResult, runPoseAnalysis } from './poseService';
import { buildErrorSnapshot } from './errorCatalog';
import { createTask as createTaskEntry, findLatestCompletedTask, getReportRow, getTask, listCompletedHistory, listProcessingTasks, saveReport, saveTask } from './taskRepository';
import { toTaskResource } from '../types/task';

function clampDelta(value: number) {
  return Math.round(value);
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getAnalysisDelayMs() {
  const configured = Number(process.env.MOCK_ANALYSIS_DELAY_MS ?? 800);
  if (!Number.isFinite(configured) || configured < 0) {
    return 800;
  }
  return Math.round(configured);
}

function getUploadBaseName(fileName: string) {
  const normalized = fileName.replace(/\\/g, '/');
  const baseName = path.posix.basename(normalized).trim();
  return baseName || `upload-${randomUUID().slice(0, 6)}.bin`;
}

function getActionLabel(actionType: ActionType) {
  return actionType === 'smash' ? '杀球' : '正手高远球';
}

const activeAnalysisTasks = new Map<string, Promise<void>>();

type AnalysisWorker = (taskId: string) => Promise<void>;

function buildCoachReview(actionType: ActionType, comparison: Omit<RetestComparison, 'coachReview'>): RetestCoachReview {
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

function buildRetestComparison(actionType: ActionType, previous: ReportResult, current: ReportResult): RetestComparison {
  const previousModelVersion = previous.scoringEvidence?.scoringModelVersion;
  const currentModelVersion = current.scoringEvidence?.scoringModelVersion;
  const comparableByDimension = Boolean(
    previousModelVersion
      && currentModelVersion
      && previousModelVersion === currentModelVersion,
  );
  const totalScoreDelta = clampDelta(current.totalScore - previous.totalScore);

  if (!comparableByDimension) {
    const summaryText = '评分模型已升级，本次仅保留总分级对比，维度结果不直接可比。';
    const comparison = {
      previousTaskId: previous.taskId,
      previousCreatedAt: previous.createdAt,
      currentTaskId: current.taskId,
      currentCreatedAt: current.createdAt,
      totalScoreDelta,
      improvedDimensions: [],
      declinedDimensions: [],
      unchangedDimensions: [],
      summaryText,
    };

    return {
      ...comparison,
      coachReview: buildCoachReview(actionType, comparison),
    };
  }

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

function readReport(taskId: string) {
  const row = getReportRow(taskId);
  return row ? JSON.parse(row.report_json) as ReportResult : undefined;
}

function validateActionType(actionType: string): actionType is ActionType {
  return actionType === 'clear' || actionType === 'smash';
}

export function assertActionType(actionType: string): asserts actionType is ActionType {
  if (!validateActionType(actionType)) {
    throw Object.assign(new Error('invalid action type'), { code: 'invalid_action_type' as const });
  }
}

export function assertSupportedActionType(actionType: ActionType) {
  if (actionType !== 'clear') {
    throw Object.assign(new Error('only clear is supported in the current MVP'), { code: 'unsupported_action_scope' as const });
  }
}

export function createAnalysisTask(actionType: ActionType) {
  const baselineTaskId = findLatestCompletedTask(actionType)?.taskId;
  const task = createTaskRecord(actionType, baselineTaskId);
  return createTaskEntry(task);
}

export const createTask = createAnalysisTask;

export function listTaskHistory(query: HistoryListQuery): HistoryListResponse {
  const items = listCompletedHistory(query);
  const nextCursor = items.length > 0 ? items[items.length - 1]?.completedAt : undefined;
  return { items, nextCursor };
}

export function getHistoryDetail(taskId: string): HistoryDetailResponse | undefined {
  const task = getTask(taskId);
  const report = readReport(taskId);
  if (!task || !report || task.status !== 'completed') return undefined;
  return {
    task: toTaskResource(task),
    report,
  };
}

export function getRetestComparison(taskId: string, baselineTaskId?: string): ComparisonResponse | undefined | null {
  const currentTask = getTask(taskId);
  const currentReport = readReport(taskId);
  if (!currentTask || !currentReport || currentTask.status !== 'completed') return undefined;

  const baseline = baselineTaskId
    ? getTask(baselineTaskId)
    : currentTask.baselineTaskId
      ? getTask(currentTask.baselineTaskId)
      : findLatestCompletedTask(currentTask.actionType, taskId);

  if (!baseline || baseline.status !== 'completed') return undefined;
  if (baseline.actionType !== currentTask.actionType) return null;

  const baselineReport = readReport(baseline.taskId);
  if (!baselineReport) return undefined;

  return {
    currentTask: toTaskResource(currentTask),
    baselineTask: toTaskResource(baseline),
    comparison: buildRetestComparison(currentTask.actionType, baselineReport, currentReport),
  };
}

export function getPoseResultForDebug(taskId: string): PoseAnalysisResult | undefined {
  const task = getTask(taskId);
  if (!task) return undefined;
  return readPoseResult(task.artifacts.poseResultPath);
}

export function saveUpload(taskId: string, fileName: string, stagedUploadPath: string, mimeType?: string) {
  const task = getTask(taskId);
  if (!task) {
    fs.rmSync(stagedUploadPath, { force: true });
    return undefined;
  }

  const normalizedName = getUploadBaseName(fileName);
  const stat = fs.statSync(stagedUploadPath);
  const stored = storeUploadedVideo(taskId, stagedUploadPath, normalizedName);
  const upload = {
    fileName: normalizedName,
    fileSizeBytes: stat.size,
    mimeType,
    extension: path.extname(normalizedName).toLowerCase(),
  };

  const updated = markTaskUploaded(task, upload, stored.absolutePath);
  return saveTask(updated);
}

async function executeValidatingStage(task: AnalysisTaskRecord) {
  const sourcePath = task.artifacts.sourceFilePath;
  const upload = task.artifacts.upload;
  if (!sourcePath || !upload || !fileExists(sourcePath)) {
    throw buildErrorSnapshot('upload_failed', 'upload file not found');
  }

  if (task.artifacts.preprocess?.metadata) {
    return task;
  }

  const metadata = await probeVideo(sourcePath, {
    fileName: upload.fileName,
    mimeType: upload.mimeType,
  });
  const validation = validateUploadedVideo(metadata);
  if (validation) {
    throw buildErrorSnapshot(validation.errorCode, validation.errorMessage);
  }

  return mergeArtifacts(task, {
    upload: metadata,
    preprocess: {
      status: 'completed',
      startedAt: task.startedAt,
      completedAt: new Date().toISOString(),
      metadata,
    },
  });
}

async function executePreprocessStage(task: AnalysisTaskRecord) {
  const sourcePath = task.artifacts.sourceFilePath;
  const metadata = task.artifacts.upload;
  if (!sourcePath || !metadata || !fileExists(sourcePath)) {
    throw buildErrorSnapshot('preprocess_failed', 'source file missing before preprocess');
  }

  if (task.artifacts.preprocess?.artifacts && fileExists(path.resolve(process.cwd(), task.artifacts.preprocess.artifacts.manifestPath))) {
    return task;
  }

  const artifacts = await extractFrames(task.taskId, sourcePath, metadata);
  const manifest = writePreprocessManifest(task.taskId, artifacts);
  return mergeArtifacts(task, {
    preprocessManifestPath: manifest.absolutePath,
    preprocess: {
      status: 'completed',
      startedAt: task.startedAt,
      completedAt: new Date().toISOString(),
      metadata,
      artifacts,
    },
  });
}

async function executePoseStage(task: AnalysisTaskRecord) {
  const preprocess = task.artifacts.preprocess?.artifacts;
  if (!preprocess?.artifactsDir) {
    throw buildErrorSnapshot('pose_failed', 'preprocess artifacts not found');
  }

  if (task.artifacts.poseResultPath && fileExists(task.artifacts.poseResultPath)) {
    return task;
  }

  const result = await runPoseAnalysis(preprocess.artifactsDir);
  const stored = writePoseResult(task.taskId, result);
  return mergeArtifacts(task, {
    poseResultPath: stored.absolutePath,
    poseSummary: buildPoseSummary(result),
  });
}

async function executeReportStage(task: AnalysisTaskRecord) {
  const reportRow = getReportRow(task.taskId);
  if (reportRow) {
    return mergeArtifacts(task, {
      reportPath: task.artifacts.reportPath,
    });
  }

  await delay(getAnalysisDelayMs());
  if (task.actionType !== 'clear') {
    throw buildErrorSnapshot('unsupported_action_scope', 'only clear is supported in the current MVP');
  }

  const poseResult = readPoseResult(task.artifacts.poseResultPath);
  if (!poseResult) {
    throw buildErrorSnapshot('report_generation_failed', 'pose result missing before report generation');
  }

  const qualityFailure = getPoseQualityFailure(poseResult);
  if (qualityFailure) {
    throw buildErrorSnapshot(qualityFailure.code, qualityFailure.message);
  }

  const report = buildRuleBasedResult(task, poseResult);
  const reportFile = writeReportFile(task.taskId, report);
  saveReport(task.taskId, JSON.stringify(report), report.totalScore, report.summaryText, report.poseBased);
  return mergeArtifacts(task, {
    reportPath: reportFile.absolutePath,
  });
}

async function runAnalysisPipeline(taskId: string) {
  let task = getTask(taskId);
  if (!task) return;

  if (task.status === 'uploaded' && task.stage === 'uploaded') {
    task = saveTask(markTaskStarted(task));
  }

  if (!task || task.status !== 'processing') return;

  try {
    if (task.actionType !== 'clear') {
      throw buildErrorSnapshot('unsupported_action_scope', 'only clear is supported in the current MVP');
    }

    if (task.stage === 'validating') {
      task = saveTask(await executeValidatingStage(task));
      task = saveTask(enterStage(task, 'extracting_frames'));
    }

    if (task.stage === 'extracting_frames') {
      task = saveTask(await executePreprocessStage(task));
      task = saveTask(enterStage(task, 'estimating_pose'));
    }

    if (task.stage === 'estimating_pose') {
      task = saveTask(await executePoseStage(task));
      task = saveTask(enterStage(task, 'generating_report'));
    }

    if (task.stage === 'generating_report') {
      task = saveTask(await executeReportStage(task));
      if (!task.artifacts.reportPath) {
        throw buildErrorSnapshot('report_generation_failed', 'report file missing after generation');
      }
      saveTask(completeTask(task, task.artifacts.reportPath));
    }
  } catch (error) {
    const snapshot = isErrorSnapshot(error)
      ? error
      : buildErrorSnapshot('internal_error', error instanceof Error ? error.message : 'analysis failed unexpectedly');
    const latest = getTask(taskId);
    if (latest) {
      saveTask(failTask(latest, snapshot));
    }
  }
}

function isErrorSnapshot(value: unknown): value is ReturnType<typeof buildErrorSnapshot> {
  return Boolean(value) && typeof value === 'object' && 'code' in (value as object) && 'category' in (value as object);
}

let analysisWorker: AnalysisWorker = runAnalysisPipeline;

function queueAnalysisTask(taskId: string) {
  if (activeAnalysisTasks.has(taskId)) return;

  const taskPromise = analysisWorker(taskId).finally(() => {
    activeAnalysisTasks.delete(taskId);
  });

  activeAnalysisTasks.set(taskId, taskPromise);
}

export async function startAnalysis(taskId: string) {
  const task = getTask(taskId);
  if (!task) return undefined;
  if (task.status === 'processing') return task;

  const started = saveTask(markTaskStarted(task));
  queueAnalysisTask(taskId);
  return started;
}

export const startMockAnalysis = startAnalysis;

export function recoverStaleTasks() {
  const staleTasks = listProcessingTasks();
  for (const task of staleTasks) {
    if (!task.artifacts.sourceFilePath || !fileExists(task.artifacts.sourceFilePath)) {
      saveTask(failTask(task, buildErrorSnapshot('task_recovery_failed', 'source file missing during recovery')));
      continue;
    }
    queueAnalysisTask(task.taskId);
  }
}

export async function migrateLegacyStoreIfNeeded() {
  const legacyTasksPath = path.resolve(process.cwd(), 'data', 'tasks.json');
  if (!fs.existsSync(legacyTasksPath)) return;
  if (listCompletedHistory({ limit: 1 }).length > 0 || listProcessingTasks().length > 0) return;

  const rawTasks = JSON.parse(fs.readFileSync(legacyTasksPath, 'utf8')) as Array<{
    taskId: string;
    actionType: ActionType;
    status: string;
    createdAt: string;
    updatedAt: string;
    fileName?: string;
    mimeType?: string;
    uploadPath?: string;
    resultPath?: string;
    previousCompletedTaskId?: string;
  }>;

  for (const legacy of rawTasks) {
    if (getTask(legacy.taskId)) continue;
    const base: AnalysisTaskRecord = {
      taskId: legacy.taskId,
      actionType: legacy.actionType,
      status: legacy.status === 'completed' ? 'completed' : legacy.status === 'failed' ? 'failed' : legacy.status === 'uploaded' ? 'uploaded' : legacy.status === 'processing' ? 'processing' : 'created',
      stage: legacy.status === 'completed' ? 'completed' : legacy.status === 'failed' ? 'failed' : legacy.status === 'uploaded' ? 'uploaded' : legacy.status === 'processing' ? 'generating_report' : 'upload_pending',
      progressPercent: legacy.status === 'completed' || legacy.status === 'failed' ? 100 : legacy.status === 'uploaded' ? 10 : legacy.status === 'processing' ? 90 : 0,
      baselineTaskId: legacy.previousCompletedTaskId,
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
      completedAt: legacy.status === 'completed' || legacy.status === 'failed' ? legacy.updatedAt : undefined,
      artifacts: {},
    };

    let task = createTaskEntry(base);
    if (legacy.uploadPath && fs.existsSync(legacy.uploadPath)) {
      prepareTaskArtifactsDir(task.taskId);
      const stored = storeUploadedVideo(task.taskId, legacy.uploadPath, legacy.fileName ?? path.basename(legacy.uploadPath));
      task = saveTask(mergeArtifacts(task, {
        sourceFilePath: stored.absolutePath,
        upload: {
          fileName: legacy.fileName ?? path.basename(legacy.uploadPath),
          fileSizeBytes: fs.statSync(stored.absolutePath).size,
          mimeType: legacy.mimeType,
          extension: path.extname(legacy.fileName ?? stored.absolutePath).toLowerCase(),
        },
      }));
    }

    if (legacy.resultPath && fs.existsSync(legacy.resultPath)) {
      const report = readJsonFile<ReportResult>(legacy.resultPath);
      const reportFile = writeReportFile(task.taskId, report);
      saveReport(task.taskId, JSON.stringify(report), report.totalScore, report.summaryText, report.poseBased);
      task = saveTask(mergeArtifacts(task, { reportPath: reportFile.absolutePath }));
    }

    saveTask(task);
  }
}

export function setAnalysisWorkerForTests(worker?: AnalysisWorker) {
  analysisWorker = worker ?? runAnalysisPipeline;
}

export function getActiveAnalysisTaskForTests(taskId: string) {
  return activeAnalysisTasks.get(taskId);
}

export const runAnalysisPipelineForTests = runAnalysisPipeline;
