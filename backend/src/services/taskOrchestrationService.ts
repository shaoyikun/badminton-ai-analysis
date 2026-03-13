import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ActionType,
  AnalysisTaskRecord,
  PoseAnalysisResult,
  ReportResult,
  StartTaskRequest,
} from '../types/task';
import { createTaskRecord, enterStage, failTask, markTaskStarted, markTaskUploaded, mergeArtifacts, completeTask } from '../domain/analysisTask';
import { fileExists, prepareTaskArtifactsDir, readJsonFile, storeUploadedVideo, writePoseResult, writePreprocessManifest, writeReportFile } from './artifactStore';
import { buildRuleBasedResult, getPoseQualityFailure } from './reportScoringService';
import { buildShadowRuleBasedResult } from './shadowReportScoringService';
import { extractFrames, probeVideo, resolveSelectedSegmentFromScan, scanVideoSegments, validateUploadedVideo } from './preprocessService';
import { buildPoseSummary, readPoseResult, runPoseAnalysis } from './poseService';
import { buildErrorSnapshot, isErrorSnapshot } from './errorCatalog';
import { createTask as createTaskEntry, findLatestCompletedTask, getReportRow, getTask, listCompletedHistory, listProcessingTasks, saveReport, saveTask } from './taskRepository';

type AnalysisWorker = (taskId: string) => Promise<void>;
type UploadPreparationWorker = (taskId: string) => Promise<AnalysisTaskRecord>;

const activeAnalysisTasks = new Map<string, Promise<void>>();

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

function buildRuntimeReport(task: AnalysisTaskRecord, poseResult: PoseAnalysisResult): ReportResult {
  if (task.actionType === 'smash') {
    return buildShadowRuleBasedResult(task, poseResult, { shadowActionType: 'smash' });
  }
  return buildRuleBasedResult(task, poseResult);
}

export function createAnalysisTask(actionType: ActionType) {
  const baselineTaskId = findLatestCompletedTask(actionType)?.taskId;
  const task = createTaskRecord(actionType, baselineTaskId);
  return createTaskEntry(task);
}

export const createTask = createAnalysisTask;

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

async function prepareUploadedTaskForSelectionInternal(taskId: string) {
  const task = getTask(taskId);
  if (!task) {
    throw buildErrorSnapshot('task_not_found', 'task not found after upload');
  }

  const validated = saveTask(await executeValidatingStage(task));
  return saveTask(await executeSegmentScanStage(validated));
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
      status: task.artifacts.preprocess?.status ?? 'queued',
      startedAt: task.startedAt,
      completedAt: task.artifacts.preprocess?.completedAt,
      metadata,
      segmentScan: task.artifacts.preprocess?.segmentScan,
    },
  });
}

async function executeSegmentScanStage(task: AnalysisTaskRecord) {
  const sourcePath = task.artifacts.sourceFilePath;
  const metadata = task.artifacts.preprocess?.metadata ?? task.artifacts.upload;
  if (!sourcePath || !metadata || !fileExists(sourcePath)) {
    throw buildErrorSnapshot('preprocess_failed', 'source file missing before segment scan');
  }

  if (task.artifacts.preprocess?.segmentScan?.swingSegments?.length) {
    return task;
  }

  const segmentScan = await scanVideoSegments(sourcePath, metadata);
  return mergeArtifacts(task, {
    preprocess: {
      status: 'queued',
      startedAt: task.startedAt,
      completedAt: task.artifacts.preprocess?.completedAt,
      metadata,
      segmentScan,
      artifacts: task.artifacts.preprocess?.artifacts,
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

  const segmentScan = task.artifacts.preprocess?.segmentScan;
  if (!segmentScan) {
    throw buildErrorSnapshot('preprocess_failed', 'segment scan not found before preprocess');
  }

  const artifacts = await extractFrames(task.taskId, sourcePath, metadata, segmentScan);
  const manifest = writePreprocessManifest(task.taskId, artifacts);
  return mergeArtifacts(task, {
    preprocessManifestPath: manifest.absolutePath,
    preprocess: {
      status: 'completed',
      startedAt: task.startedAt,
      completedAt: new Date().toISOString(),
      metadata,
      segmentScan: {
        ...segmentScan,
        selectedSegmentId: artifacts.selectedSegmentId ?? segmentScan.selectedSegmentId,
        selectedSegmentWindow: artifacts.selectedSegmentWindow ?? segmentScan.selectedSegmentWindow,
        segmentSelectionMode: artifacts.segmentSelectionMode ?? segmentScan.segmentSelectionMode,
      },
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

  const poseResult = readPoseResult(task.artifacts.poseResultPath);
  if (!poseResult) {
    throw buildErrorSnapshot('report_generation_failed', 'pose result missing before report generation');
  }

  const qualityFailure = getPoseQualityFailure(poseResult);
  if (qualityFailure) {
    throw buildErrorSnapshot(qualityFailure.code, qualityFailure.message);
  }

  const report = buildRuntimeReport(task, poseResult);
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

let analysisWorker: AnalysisWorker = runAnalysisPipeline;
let uploadPreparationWorker: UploadPreparationWorker = prepareUploadedTaskForSelectionInternal;

function queueAnalysisTask(taskId: string) {
  if (activeAnalysisTasks.has(taskId)) return;

  const taskPromise = analysisWorker(taskId).finally(() => {
    activeAnalysisTasks.delete(taskId);
  });

  activeAnalysisTasks.set(taskId, taskPromise);
}

function ensureSelectedSegment(task: AnalysisTaskRecord, selectedSegmentId?: string, selectedWindowOverride?: StartTaskRequest['selectedWindowOverride']) {
  const segmentScan = task.artifacts.preprocess?.segmentScan;
  const metadata = task.artifacts.preprocess?.metadata ?? task.artifacts.upload;
  if (!segmentScan?.swingSegments?.length) {
    throw buildErrorSnapshot('invalid_task_state', 'segment scan is not ready');
  }
  if (!metadata) {
    throw buildErrorSnapshot('invalid_task_state', 'video metadata is unavailable');
  }

  const { selectedSegment, selectedWindow, segmentSelectionMode } = resolveSelectedSegmentFromScan(
    metadata,
    segmentScan,
    selectedSegmentId ?? segmentScan.selectedSegmentId ?? segmentScan.recommendedSegmentId,
    selectedWindowOverride,
  );

  return mergeArtifacts(task, {
    preprocess: {
      ...task.artifacts.preprocess,
      status: task.artifacts.preprocess?.status ?? 'queued',
      metadata: task.artifacts.preprocess?.metadata,
      segmentScan: {
        ...segmentScan,
        selectedSegmentId: selectedSegment.segmentId,
        selectedSegmentWindow: selectedWindow,
        segmentSelectionMode,
      },
      artifacts: task.artifacts.preprocess?.artifacts,
    },
  });
}

export async function prepareUploadedTaskForSelection(taskId: string) {
  return uploadPreparationWorker(taskId);
}

export async function startAnalysisWithSelection(taskId: string, request?: StartTaskRequest) {
  const task = getTask(taskId);
  if (!task) return undefined;
  if (task.status === 'processing') return task;

  const prepared = saveTask(ensureSelectedSegment(task, request?.selectedSegmentId, request?.selectedWindowOverride));
  const started = saveTask(markTaskStarted(prepared));
  queueAnalysisTask(taskId);
  return started;
}

export async function startAnalysis(taskId: string) {
  return startAnalysisWithSelection(taskId);
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

export function setUploadPreparationWorkerForTests(worker?: UploadPreparationWorker) {
  uploadPreparationWorker = worker ?? prepareUploadedTaskForSelectionInternal;
}

export function getActiveAnalysisTaskForTests(taskId: string) {
  return activeAnalysisTasks.get(taskId);
}

export const runAnalysisPipelineForTests = runAnalysisPipeline;
