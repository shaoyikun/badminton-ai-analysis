import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PoseAnalysisResult } from '../types/task';

const execFileAsync = promisify(execFile);

function getAnalysisServiceEntry() {
  const repoRoot = path.resolve(process.cwd(), '..');
  return path.join(repoRoot, 'analysis-service', 'app.py');
}

function getTaskArtifactsDir(relativeArtifactsDir: string) {
  return path.join(process.cwd(), relativeArtifactsDir);
}

export async function estimatePoseForArtifacts(relativeArtifactsDir: string): Promise<PoseAnalysisResult> {
  const pythonBin = process.env.PYTHON_BIN || 'python3';
  const analysisEntry = getAnalysisServiceEntry();
  const taskDir = getTaskArtifactsDir(relativeArtifactsDir);
  const { stdout } = await execFileAsync(pythonBin, [analysisEntry, taskDir], {
    encoding: 'utf8',
  });
  const output = stdout.trim();
  const parsed = JSON.parse(output) as { result?: PoseAnalysisResult };

  if (!parsed.result) {
    throw new Error('analysis-service returned no pose result');
  }

  return parsed.result;
}
