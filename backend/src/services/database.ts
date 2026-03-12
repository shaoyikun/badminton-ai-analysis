import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let database: DatabaseSync | undefined;

export function getDataDir() {
  return path.resolve(process.cwd(), 'data');
}

export function getArtifactsDir() {
  return path.resolve(process.cwd(), 'artifacts');
}

export function getDatabasePath() {
  return path.join(getDataDir(), 'app.db');
}

function ensureStorageRoots() {
  fs.mkdirSync(getDataDir(), { recursive: true });
  fs.mkdirSync(getArtifactsDir(), { recursive: true });
}

function initializeSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS analysis_tasks (
      task_id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      progress_percent INTEGER NOT NULL,
      baseline_task_id TEXT,
      error_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      stage_started_at TEXT
    );

    CREATE TABLE IF NOT EXISTS analysis_task_artifacts (
      task_id TEXT PRIMARY KEY,
      source_file_path TEXT,
      preprocess_manifest_path TEXT,
      pose_result_path TEXT,
      report_path TEXT,
      upload_json TEXT,
      preprocess_json TEXT,
      pose_summary_json TEXT,
      FOREIGN KEY(task_id) REFERENCES analysis_tasks(task_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS analysis_reports (
      task_id TEXT PRIMARY KEY,
      total_score INTEGER NOT NULL,
      summary_text TEXT,
      pose_based INTEGER NOT NULL,
      report_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES analysis_tasks(task_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_analysis_tasks_action_completed
      ON analysis_tasks(action_type, completed_at DESC);
  `);
}

export function getDatabase() {
  if (database) return database;
  ensureStorageRoots();
  database = new DatabaseSync(getDatabasePath());
  initializeSchema(database);
  return database;
}
