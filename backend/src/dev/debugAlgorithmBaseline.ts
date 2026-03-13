import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisTaskRecord, PoseAnalysisResult, PreprocessArtifacts, PreprocessFrameItem, ReportResult } from '../types/task';
import { estimatePoseForTaskDir } from '../services/analysisService';
import { buildRuleBasedResult } from '../services/reportScoringService';

type DebugFormat = 'markdown' | 'json';

export interface DebugArtifactsContext {
  preprocessDir: string;
  taskId: string;
  artifacts: PreprocessArtifacts;
  assumptions: string[];
  manifestFound: boolean;
}

export interface AlgorithmBaselineDebugSnapshot {
  assumptions: string[];
  preprocessDir: string;
  taskId: string;
  preprocessArtifacts: PreprocessArtifacts;
  poseResult: PoseAnalysisResult;
  report: ReportResult;
}

function getBackendRoot() {
  return path.resolve(__dirname, '..', '..');
}

function getRepoRoot() {
  return path.resolve(getBackendRoot(), '..');
}

function normalizePosix(targetPath: string) {
  return targetPath.split(path.sep).join(path.posix.sep);
}

function toBackendRelative(targetPath: string) {
  const backendRoot = getBackendRoot();
  const resolved = path.resolve(targetPath);
  const relative = path.relative(backendRoot, resolved);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    return normalizePosix(relative);
  }
  return normalizePosix(resolved);
}

export function resolvePreprocessDir(inputPath: string) {
  const candidates = [
    inputPath,
    path.resolve(process.cwd(), inputPath),
    path.resolve(getBackendRoot(), inputPath),
    path.resolve(getRepoRoot(), inputPath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return path.resolve(candidate);
    }
  }

  throw new Error(`preprocess directory not found: ${inputPath}`);
}

function inferTaskId(preprocessDir: string) {
  const parts = path.resolve(preprocessDir).split(path.sep);
  const tasksIndex = parts.lastIndexOf('tasks');
  if (tasksIndex >= 0 && parts[tasksIndex + 1]) {
    return parts[tasksIndex + 1];
  }
  return path.basename(path.dirname(preprocessDir)) || path.basename(preprocessDir) || 'task_debug';
}

function buildFrameItemsFromScan(preprocessDir: string): PreprocessFrameItem[] {
  const frameFiles = fs.readdirSync(preprocessDir)
    .filter((fileName) => /^frame-\d+\.(jpg|jpeg|png)$/i.test(fileName))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  return frameFiles.map((fileName, index) => {
    const parsedIndex = Number(path.basename(fileName).match(/\d+/)?.[0] ?? index + 1);
    const absolutePath = path.join(preprocessDir, fileName);
    return {
      index: Number.isFinite(parsedIndex) ? parsedIndex : index + 1,
      timestampSeconds: index + 1,
      fileName,
      relativePath: toBackendRelative(absolutePath),
    };
  });
}

export function loadDebugArtifactsContext(inputPath: string): DebugArtifactsContext {
  const preprocessDir = resolvePreprocessDir(inputPath);
  const manifestPath = path.join(preprocessDir, 'manifest.json');
  const assumptions = ['Debug task defaults to actionType="clear" because the current MVP report only supports clear.'];
  const taskId = inferTaskId(preprocessDir);

  if (fs.existsSync(manifestPath)) {
    const artifacts = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PreprocessArtifacts;
    return {
      preprocessDir,
      taskId,
      artifacts,
      assumptions,
      manifestFound: true,
    };
  }

  const sampledFrames = buildFrameItemsFromScan(preprocessDir);
  assumptions.push('manifest.json is missing, so sampledFrames were reconstructed from frame file names and assigned sequential timestamps.');
  return {
    preprocessDir,
    taskId,
    assumptions,
    manifestFound: false,
    artifacts: {
      normalizedFileName: `${taskId}.mp4`,
      metadataExtractedAt: new Date().toISOString(),
      artifactsDir: toBackendRelative(preprocessDir),
      manifestPath: toBackendRelative(manifestPath),
      framePlan: {
        strategy: 'debug-frame-scan-fallback',
        targetFrameCount: sampledFrames.length,
        sampleTimestamps: sampledFrames.map((frame) => frame.timestampSeconds),
      },
      sampledFrames,
    },
  };
}

export function buildDebugTaskRecord(context: DebugArtifactsContext): AnalysisTaskRecord {
  const now = new Date().toISOString();
  return {
    taskId: context.taskId,
    actionType: 'clear',
    status: 'processing',
    stage: 'generating_report',
    progressPercent: 90,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    artifacts: {
      preprocess: {
        status: 'completed',
        startedAt: now,
        completedAt: now,
        artifacts: context.artifacts,
      },
    },
  };
}

export function buildAlgorithmBaselineDebugSnapshot(
  context: DebugArtifactsContext,
  poseResult: PoseAnalysisResult,
): AlgorithmBaselineDebugSnapshot {
  const task = buildDebugTaskRecord(context);
  return {
    assumptions: context.assumptions,
    preprocessDir: context.preprocessDir,
    taskId: context.taskId,
    preprocessArtifacts: context.artifacts,
    poseResult,
    report: buildRuleBasedResult(task, poseResult),
  };
}

function formatDebugValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return Number(value.toFixed(4)).toString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function formatObservableFeatureCount(metrics: PoseAnalysisResult['frames'][number]['metrics']) {
  const observability = metrics?.debug?.specialized?.observability;
  if (!observability) return '—';
  const entries = Object.values(observability);
  if (!entries.length) return '0';
  return `${entries.filter((entry) => entry?.observable).length}/${entries.length}`;
}

export function renderAlgorithmBaselineMarkdown(snapshot: AlgorithmBaselineDebugSnapshot) {
  const summary = snapshot.poseResult.summary;
  const frameLines = snapshot.poseResult.frames.map((frame) => {
    const metrics = frame.metrics;
    return `| ${frame.frameIndex} | ${frame.status} | ${frame.viewProfile ?? 'unknown'} | ${frame.dominantRacketSide ?? 'unknown'} | ${formatDebugValue(metrics?.stabilityScore)} | ${formatDebugValue(metrics?.bodyTurnScore)} | ${formatDebugValue(metrics?.racketArmLiftScore)} | ${formatDebugValue(metrics?.specialized?.trunkCoilScore)} | ${formatDebugValue(metrics?.specialized?.hittingArmPreparationScore)} | ${formatDebugValue(metrics?.specialized?.headStabilityScore)} | ${formatDebugValue(metrics?.specialized?.contactPreparationScore)} | ${formatObservableFeatureCount(metrics)} | ${formatDebugValue(metrics?.compositeScore)} | ${formatDebugValue(metrics?.debug?.statusReasons?.join(', '))} |`;
  });
  const rejectionLines = (summary.rejectionReasonDetails ?? []).map((detail) => (
    `| ${detail.code} | ${detail.triggered ? 'yes' : 'no'} | ${formatDebugValue(detail.observed)} | ${formatDebugValue(detail.threshold)} | ${detail.comparator} | ${detail.explanation} |`
  ));
  const specializedSummaryLines = Object.entries(summary.specializedFeatureSummary ?? {}).map(([featureName, featureSummary]) => (
    `| ${featureName} | ${formatDebugValue(featureSummary.median)} | ${formatDebugValue(featureSummary.peak)} | ${formatDebugValue(featureSummary.observableFrameCount)} | ${formatDebugValue(featureSummary.observableCoverage)} | ${formatDebugValue(featureSummary.peakFrameIndex)} |`
  ));

  return [
    '# Algorithm Baseline Debug Summary',
    '',
    `- preprocessDir: \`${snapshot.preprocessDir}\``,
    `- taskId: \`${snapshot.taskId}\``,
    `- manifestFound: ${snapshot.preprocessArtifacts.framePlan.strategy !== 'debug-frame-scan-fallback' ? 'yes' : 'no'}`,
    ...snapshot.assumptions.map((item) => `- assumption: ${item}`),
    '',
    '## Pose Summary',
    '',
    `- engine: \`${snapshot.poseResult.engine}\``,
    `- usableFrameCount: ${summary.usableFrameCount}/${snapshot.poseResult.frameCount}`,
    `- coverageRatio: ${formatDebugValue(summary.coverageRatio)}`,
    `- medianStabilityScore: ${formatDebugValue(summary.medianStabilityScore)}`,
    `- medianBodyTurnScore: ${formatDebugValue(summary.medianBodyTurnScore)}`,
    `- medianRacketArmLiftScore: ${formatDebugValue(summary.medianRacketArmLiftScore)}`,
    `- bestPreparationFrameIndex: ${formatDebugValue(summary.bestPreparationFrameIndex)}`,
    `- scoreVariance: ${formatDebugValue(summary.scoreVariance)}`,
    `- bestFrameIndex: ${formatDebugValue(summary.bestFrameIndex)}`,
    `- rejectionReasons: ${summary.rejectionReasons.length > 0 ? summary.rejectionReasons.join(', ') : 'none'}`,
    '',
    '## Rejection Detail',
    '',
    '| code | triggered | observed | threshold | comparator | explanation |',
    '| --- | --- | --- | --- | --- | --- |',
    ...(rejectionLines.length > 0 ? rejectionLines : ['| none | no | — | — | — | No rejection rules were evaluated. |']),
    '',
    '## Specialized Feature Summary',
    '',
    '| feature | median | peak | observableFrames | observableCoverage | peakFrameIndex |',
    '| --- | --- | --- | --- | --- | --- |',
    ...(specializedSummaryLines.length > 0 ? specializedSummaryLines : ['| none | — | — | — | — | — |']),
    '',
    '## Per-frame Metrics',
    '',
    '| frame | status | view | racketSide | stability | turn | lift | trunkCoil | armPrep | head | contactPrep | observable | composite | statusReasons |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...(frameLines.length > 0 ? frameLines : ['| — | — | — | — | — | — | — | — | — | — | — | — | — | — |']),
    '',
    '## Report Summary',
    '',
    `- totalScore: ${snapshot.report.totalScore}`,
    `- summaryText: ${snapshot.report.summaryText ?? '—'}`,
    `- issues: ${snapshot.report.issues.map((item) => item.title).join(', ') || 'none'}`,
    '',
    '## Scoring Evidence',
    '',
    '```json',
    JSON.stringify(snapshot.report.scoringEvidence ?? {}, null, 2),
    '```',
  ].join('\n');
}

function parseCliArgs(argv: string[]) {
  let format: DebugFormat = 'markdown';
  let preprocessArg: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--format') {
      const next = argv[index + 1];
      if (next === 'json' || next === 'markdown') {
        format = next;
        index += 1;
        continue;
      }
      throw new Error('--format must be one of: markdown, json');
    }

    if (!preprocessArg) {
      preprocessArg = current;
      continue;
    }

    throw new Error(`unexpected argument: ${current}`);
  }

  if (!preprocessArg) {
    throw new Error('usage: debugAlgorithmBaseline.ts <preprocess-task-dir> [--format markdown|json]');
  }

  return {
    preprocessArg,
    format,
  };
}

export async function generateAlgorithmBaselineDebug(inputPath: string) {
  const context = loadDebugArtifactsContext(inputPath);
  const poseResult = await estimatePoseForTaskDir(context.preprocessDir);
  return buildAlgorithmBaselineDebugSnapshot(context, poseResult);
}

async function main() {
  const { preprocessArg, format } = parseCliArgs(process.argv.slice(2));
  const snapshot = await generateAlgorithmBaselineDebug(preprocessArg);
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderAlgorithmBaselineMarkdown(snapshot)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : 'debug algorithm baseline failed';
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
