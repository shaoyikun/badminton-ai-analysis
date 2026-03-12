import fs from 'node:fs';
import path from 'node:path';
import type { PoseAnalysisResult, PreprocessArtifacts, ReportResult, VideoMetadata } from '../types/task';
import { getArtifactsDir } from './database';

function ensureDir(target: string) {
  fs.mkdirSync(target, { recursive: true });
}

function getTaskDir(taskId: string) {
  return path.join(getArtifactsDir(), 'tasks', taskId);
}

function getRelativePath(target: string) {
  return path.relative(process.cwd(), target).split(path.sep).join(path.posix.sep);
}

function moveFile(sourcePath: string, targetPath: string) {
  ensureDir(path.dirname(targetPath));

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

export function prepareTaskArtifactsDir(taskId: string) {
  const taskDir = getTaskDir(taskId);
  ensureDir(taskDir);
  return taskDir;
}

export function storeUploadedVideo(taskId: string, sourcePath: string, fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const targetPath = path.join(getTaskDir(taskId), `source${extension || '.bin'}`);
  moveFile(sourcePath, targetPath);
  return {
    absolutePath: targetPath,
    relativePath: getRelativePath(targetPath),
  };
}

export function getPreprocessDir(taskId: string) {
  const dir = path.join(getTaskDir(taskId), 'preprocess');
  ensureDir(dir);
  return dir;
}

export function writePreprocessManifest(taskId: string, artifacts: PreprocessArtifacts) {
  const manifestPath = path.join(getPreprocessDir(taskId), 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(artifacts, null, 2), 'utf8');
  return {
    absolutePath: manifestPath,
    relativePath: getRelativePath(manifestPath),
  };
}

export function writePoseResult(taskId: string, result: PoseAnalysisResult) {
  const targetDir = path.join(getTaskDir(taskId), 'pose');
  ensureDir(targetDir);
  const targetPath = path.join(targetDir, 'result.json');
  fs.writeFileSync(targetPath, JSON.stringify(result, null, 2), 'utf8');
  return {
    absolutePath: targetPath,
    relativePath: getRelativePath(targetPath),
  };
}

export function writeReportFile(taskId: string, result: ReportResult) {
  const targetDir = path.join(getTaskDir(taskId), 'report');
  ensureDir(targetDir);
  const targetPath = path.join(targetDir, 'report.json');
  fs.writeFileSync(targetPath, JSON.stringify(result, null, 2), 'utf8');
  return {
    absolutePath: targetPath,
    relativePath: getRelativePath(targetPath),
  };
}

export function readJsonFile<T>(targetPath: string): T {
  return JSON.parse(fs.readFileSync(targetPath, 'utf8')) as T;
}

export function fileExists(targetPath?: string) {
  return Boolean(targetPath) && fs.existsSync(targetPath!);
}

export function copyLegacyFileIfExists(sourcePath: string | undefined, targetPath: string) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return false;
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

export function copyLegacyDirectoryIfExists(sourcePath: string | undefined, targetPath: string) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return false;
  ensureDir(path.dirname(targetPath));
  fs.cpSync(sourcePath, targetPath, { recursive: true });
  return true;
}

export function buildUploadMetadata(fileName: string, fileSizeBytes: number, mimeType?: string): VideoMetadata {
  return {
    fileName,
    fileSizeBytes,
    mimeType,
    extension: path.extname(fileName).toLowerCase(),
  };
}
