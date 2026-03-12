import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from './database';
import type {
  ActionType,
  AnalysisTaskRecord,
  ArtifactRow,
  HistoryListQuery,
  ReportRow,
  TaskHistoryItem,
  TaskResource,
  TaskRow,
} from '../types/task';
import { parseJson, serializeJson, toTaskResource } from '../types/task';

function db() {
  return getDatabase();
}

function mapTask(row: TaskRow | undefined, artifactRow?: ArtifactRow): AnalysisTaskRecord | undefined {
  if (!row) return undefined;
  return {
    taskId: row.task_id,
    actionType: row.action_type,
    status: row.status,
    stage: row.stage,
    progressPercent: row.progress_percent,
    baselineTaskId: row.baseline_task_id ?? undefined,
    error: parseJson(row.error_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    artifacts: {
      sourceFilePath: artifactRow?.source_file_path ?? undefined,
      preprocessManifestPath: artifactRow?.preprocess_manifest_path ?? undefined,
      poseResultPath: artifactRow?.pose_result_path ?? undefined,
      reportPath: artifactRow?.report_path ?? undefined,
      upload: parseJson(artifactRow?.upload_json),
      preprocess: parseJson(artifactRow?.preprocess_json),
      poseSummary: parseJson(artifactRow?.pose_summary_json),
    },
  };
}

function getArtifactRow(database: DatabaseSync, taskId: string) {
  return database.prepare(`
    SELECT task_id, source_file_path, preprocess_manifest_path, pose_result_path, report_path, upload_json, preprocess_json, pose_summary_json
    FROM analysis_task_artifacts
    WHERE task_id = ?
  `).get(taskId) as ArtifactRow | undefined;
}

export function getTask(taskId: string) {
  const database = db();
  const row = database.prepare(`
    SELECT task_id, action_type, status, stage, progress_percent, baseline_task_id, error_json, created_at, updated_at, started_at, completed_at, stage_started_at
    FROM analysis_tasks
    WHERE task_id = ?
  `).get(taskId) as TaskRow | undefined;
  return mapTask(row, getArtifactRow(database, taskId));
}

export function createTask(task: AnalysisTaskRecord) {
  const database = db();
  database.prepare(`
    INSERT INTO analysis_tasks (
      task_id, action_type, status, stage, progress_percent, baseline_task_id, error_json, created_at, updated_at, started_at, completed_at, stage_started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.taskId,
    task.actionType,
    task.status,
    task.stage,
    task.progressPercent,
    task.baselineTaskId ?? null,
    task.error ? serializeJson(task.error) : null,
    task.createdAt,
    task.updatedAt,
    task.startedAt ?? null,
    task.completedAt ?? null,
    task.updatedAt,
  );

  database.prepare(`
    INSERT INTO analysis_task_artifacts (
      task_id, source_file_path, preprocess_manifest_path, pose_result_path, report_path, upload_json, preprocess_json, pose_summary_json
    ) VALUES (?, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  `).run(task.taskId);

  return task;
}

export function saveTask(task: AnalysisTaskRecord) {
  const database = db();
  database.prepare(`
    UPDATE analysis_tasks
    SET action_type = ?,
        status = ?,
        stage = ?,
        progress_percent = ?,
        baseline_task_id = ?,
        error_json = ?,
        created_at = ?,
        updated_at = ?,
        started_at = ?,
        completed_at = ?,
        stage_started_at = ?
    WHERE task_id = ?
  `).run(
    task.actionType,
    task.status,
    task.stage,
    task.progressPercent,
    task.baselineTaskId ?? null,
    task.error ? serializeJson(task.error) : null,
    task.createdAt,
    task.updatedAt,
    task.startedAt ?? null,
    task.completedAt ?? null,
    task.updatedAt,
    task.taskId,
  );

  database.prepare(`
    INSERT INTO analysis_task_artifacts (
      task_id, source_file_path, preprocess_manifest_path, pose_result_path, report_path, upload_json, preprocess_json, pose_summary_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      source_file_path = excluded.source_file_path,
      preprocess_manifest_path = excluded.preprocess_manifest_path,
      pose_result_path = excluded.pose_result_path,
      report_path = excluded.report_path,
      upload_json = excluded.upload_json,
      preprocess_json = excluded.preprocess_json,
      pose_summary_json = excluded.pose_summary_json
  `).run(
    task.taskId,
    task.artifacts.sourceFilePath ?? null,
    task.artifacts.preprocessManifestPath ?? null,
    task.artifacts.poseResultPath ?? null,
    task.artifacts.reportPath ?? null,
    task.artifacts.upload ? serializeJson(task.artifacts.upload) : null,
    task.artifacts.preprocess ? serializeJson(task.artifacts.preprocess) : null,
    task.artifacts.poseSummary ? serializeJson(task.artifacts.poseSummary) : null,
  );

  return task;
}

export function saveReport(taskId: string, report: string, totalScore: number, summaryText?: string, poseBased?: boolean) {
  const database = db();
  const createdAt = new Date().toISOString();
  database.prepare(`
    INSERT INTO analysis_reports (task_id, total_score, summary_text, pose_based, report_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      total_score = excluded.total_score,
      summary_text = excluded.summary_text,
      pose_based = excluded.pose_based,
      report_json = excluded.report_json,
      created_at = excluded.created_at
  `).run(taskId, totalScore, summaryText ?? null, poseBased ? 1 : 0, report, createdAt);
}

export function getReportRow(taskId: string) {
  return db().prepare(`
    SELECT task_id, total_score, summary_text, pose_based, report_json, created_at
    FROM analysis_reports
    WHERE task_id = ?
  `).get(taskId) as ReportRow | undefined;
}

export function listCompletedHistory(query: HistoryListQuery): TaskHistoryItem[] {
  const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 50);
  const cursor = query.cursor ? new Date(query.cursor).toISOString() : undefined;

  const rows = db().prepare(`
    SELECT
      t.task_id,
      t.action_type,
      t.created_at,
      t.completed_at,
      r.total_score,
      r.summary_text,
      r.pose_based
    FROM analysis_tasks t
    JOIN analysis_reports r ON r.task_id = t.task_id
    WHERE t.status = 'completed'
      AND (? IS NULL OR t.action_type = ?)
      AND (? IS NULL OR t.completed_at < ?)
    ORDER BY t.completed_at DESC, t.task_id DESC
    LIMIT ?
  `).all(query.actionType ?? null, query.actionType ?? null, cursor ?? null, cursor ?? null, limit) as Array<{
    task_id: string;
    action_type: ActionType;
    created_at: string;
    completed_at: string;
    total_score: number | null;
    summary_text: string | null;
    pose_based: number;
  }>;

  return rows.map((row) => ({
    taskId: row.task_id,
    actionType: row.action_type,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    totalScore: row.total_score ?? undefined,
    summaryText: row.summary_text ?? undefined,
    poseBased: Boolean(row.pose_based),
  }));
}

export function listProcessingTasks() {
  const rows = db().prepare(`
    SELECT task_id, action_type, status, stage, progress_percent, baseline_task_id, error_json, created_at, updated_at, started_at, completed_at, stage_started_at
    FROM analysis_tasks
    WHERE status = 'processing'
  `).all() as unknown as TaskRow[];

  return rows
    .map((row) => mapTask(row, getArtifactRow(db(), row.task_id)))
    .filter((task): task is AnalysisTaskRecord => Boolean(task));
}

export function findLatestCompletedTask(actionType: ActionType, excludeTaskId?: string) {
  const row = db().prepare(`
    SELECT task_id, action_type, status, stage, progress_percent, baseline_task_id, error_json, created_at, updated_at, started_at, completed_at, stage_started_at
    FROM analysis_tasks
    WHERE action_type = ?
      AND status = 'completed'
      AND (? IS NULL OR task_id != ?)
    ORDER BY completed_at DESC, updated_at DESC
    LIMIT 1
  `).get(actionType, excludeTaskId ?? null, excludeTaskId ?? null) as TaskRow | undefined;

  return mapTask(row, row ? getArtifactRow(db(), row.task_id) : undefined);
}

export function listComparableCompletedTasks(actionType: ActionType, excludeTaskId?: string): TaskResource[] {
  const rows = db().prepare(`
    SELECT task_id, action_type, status, stage, progress_percent, baseline_task_id, error_json, created_at, updated_at, started_at, completed_at, stage_started_at
    FROM analysis_tasks
    WHERE action_type = ?
      AND status = 'completed'
      AND (? IS NULL OR task_id != ?)
    ORDER BY completed_at DESC, updated_at DESC
  `).all(actionType, excludeTaskId ?? null, excludeTaskId ?? null) as unknown as TaskRow[];

  return rows
    .map((row) => mapTask(row, getArtifactRow(db(), row.task_id)))
    .filter((task): task is AnalysisTaskRecord => Boolean(task))
    .map(toTaskResource);
}
