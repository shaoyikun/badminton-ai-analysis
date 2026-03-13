import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ActionType, AnalysisTaskRecord, PoseAnalysisResult, PreprocessArtifacts, ReportResult } from '../types/task';
import { readJsonFile, writePreprocessManifest } from '../services/artifactStore';
import { estimatePoseForTaskDir } from '../services/analysisService';
import { getArtifactsDir } from '../services/database';
import { extractFrames, probeVideo, validateUploadedVideo } from '../services/preprocessService';
import { buildRuleBasedResult, getPoseQualityFailure } from '../services/reportScoringService';
import { buildDebugTaskRecord, loadDebugArtifactsContext } from './debugAlgorithmBaseline';

export type EvaluationCameraQuality = 'good' | 'limited' | 'poor';
export type EvaluationDisposition = 'rejected' | 'low_confidence' | 'analyzable';

export interface EvaluationFixtureInput {
  videoPath?: string;
  preprocessDir?: string;
  poseResultPath?: string;
}

export interface EvaluationFixtureExpected {
  cameraQuality: EvaluationCameraQuality;
  majorIssueLabels: string[];
  analysisDisposition: EvaluationDisposition;
}

export interface EvaluationFixtureCase {
  id: string;
  actionType: ActionType;
  input: EvaluationFixtureInput;
  expected: EvaluationFixtureExpected;
  notes?: string;
  reviewerNotes?: string;
}

export interface EvaluationFixtureIndex {
  fixtures: EvaluationFixtureCase[];
}

export interface EvaluationBaselineCase {
  analysisDisposition: EvaluationDisposition;
  rejectionReasons: string[];
  lowConfidenceReasons: string[];
  topIssueLabels: string[];
  totalScore: number | null;
  confidenceScore: number | null;
  scoreVariance: number | null;
  temporalConsistency: number | null;
  motionContinuity: number | null;
  fallbacksUsed: string[];
}

export interface EvaluationBaselineFile {
  schemaVersion: 1;
  generatedAt: string;
  fixtures: Record<string, EvaluationBaselineCase>;
}

export interface EvaluationCaseResult {
  id: string;
  actionType: ActionType;
  inputMode: 'video' | 'preprocess' | 'pose';
  expected: EvaluationFixtureExpected;
  actual: {
    analysisDisposition: EvaluationDisposition;
    cameraQuality: EvaluationCameraQuality;
    rejectionReasons: string[];
    lowConfidenceReasons: string[];
    topIssueLabels: string[];
    totalScore: number | null;
    confidenceScore: number | null;
    scoreVariance: number | null;
    temporalConsistency: number | null;
    motionContinuity: number | null;
    fallbacksUsed: string[];
    qualityFailureCode: string | null;
  };
  expectationCheck: {
    analysisDispositionMatched: boolean;
    cameraQualityMatched: boolean;
    matchedIssueLabels: string[];
    missedIssueLabels: string[];
  };
  baseline: {
    exists: boolean;
    changed: boolean;
    differences: string[];
  };
  notes?: string;
  reviewerNotes?: string;
}

export interface EvaluationAggregateReport {
  summary: {
    totalFixtures: number;
    successCount: number;
    successRate: number;
    dispositionDistribution: Record<string, number>;
    rejectionReasonDistribution: Record<string, number>;
    lowConfidenceDistribution: Record<string, number>;
    issueHit: {
      expectedLabelCount: number;
      matchedLabelCount: number;
      hitRate: number;
      missedCases: Array<{
        id: string;
        expected: string[];
        missed: string[];
      }>;
    };
    scoreVariance: NumericSummary;
    temporalConsistency: NumericSummary;
    motionContinuity: NumericSummary;
    baselineComparison: {
      missingBaselineCount: number;
      changedCaseCount: number;
      changedCases: Array<{
        id: string;
        differences: string[];
      }>;
    };
  };
  cases: EvaluationCaseResult[];
}

type NumericSummary = {
  count: number;
  mean: number | null;
  p50: number | null;
  min: number | null;
  max: number | null;
};

type EvaluateFixtureOptions = {
  estimatePoseForPreprocessDir?: (preprocessDir: string) => Promise<PoseAnalysisResult>;
  baseline?: EvaluationBaselineFile;
  now?: () => string;
};

type EvaluateSuiteOptions = EvaluateFixtureOptions & {
  indexPath?: string;
};

type FixtureExecution = {
  task: AnalysisTaskRecord;
  poseResult: PoseAnalysisResult;
  cleanup?: () => void;
};

function getBackendRoot() {
  return path.resolve(__dirname, '..', '..');
}

function getRepoRoot() {
  return path.resolve(getBackendRoot(), '..');
}

function getEvaluationRoot() {
  return path.join(getRepoRoot(), 'evaluation');
}

function sanitizeFixtureId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function nowIso() {
  return new Date().toISOString();
}

function buildTaskRecord(
  taskId: string,
  actionType: ActionType,
  preprocess?: {
    metadata?: AnalysisTaskRecord['artifacts']['upload'];
    artifacts?: PreprocessArtifacts;
  },
  now = nowIso(),
): AnalysisTaskRecord {
  return {
    taskId,
    actionType,
    status: 'processing',
    stage: 'generating_report',
    progressPercent: 90,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    artifacts: preprocess
      ? {
        preprocess: {
          status: 'completed',
          startedAt: now,
          completedAt: now,
          metadata: preprocess.metadata,
          artifacts: preprocess.artifacts,
        },
      }
      : {},
  };
}

function requireInputPath(
  indexDir: string,
  filePath: string | undefined,
  label: string,
  fixtureId: string,
) {
  if (!filePath) {
    throw new Error(`fixture "${fixtureId}" is missing ${label}`);
  }

  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(indexDir, filePath);
}

function guessMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.m4v':
      return 'video/x-m4v';
    default:
      return 'video/mp4';
  }
}

function classifyCameraQuality(report: ReportResult) {
  const cameraSuitability = report.scoringEvidence?.cameraSuitability ?? 0;
  const lowConfidenceReasons = report.scoringEvidence?.rejectionDecision?.lowConfidenceReasons ?? [];
  if (cameraSuitability < 55 || lowConfidenceReasons.includes('invalid_camera_angle')) {
    return 'poor' as const;
  }
  if (cameraSuitability < 75) {
    return 'limited' as const;
  }
  return 'good' as const;
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function getActualIssueLabels(report: ReportResult, disposition: EvaluationDisposition) {
  if (disposition === 'rejected') return [];
  return uniqueStrings(report.issues.map((issue) => issue.issueCategory ?? issue.targetDimensionKey ?? issue.title));
}

function toBaselineCase(result: EvaluationCaseResult): EvaluationBaselineCase {
  return {
    analysisDisposition: result.actual.analysisDisposition,
    rejectionReasons: [...result.actual.rejectionReasons].sort(),
    lowConfidenceReasons: [...result.actual.lowConfidenceReasons].sort(),
    topIssueLabels: [...result.actual.topIssueLabels],
    totalScore: result.actual.totalScore,
    confidenceScore: result.actual.confidenceScore,
    scoreVariance: result.actual.scoreVariance,
    temporalConsistency: result.actual.temporalConsistency,
    motionContinuity: result.actual.motionContinuity,
    fallbacksUsed: [...result.actual.fallbacksUsed].sort(),
  };
}

function compareStringArrays(label: string, baseline: string[], current: string[]) {
  const normalizedBaseline = JSON.stringify(baseline);
  const normalizedCurrent = JSON.stringify(current);
  if (normalizedBaseline === normalizedCurrent) return [];
  return [`${label}: ${baseline.join(', ') || 'none'} -> ${current.join(', ') || 'none'}`];
}

function compareNumeric(label: string, baseline: number | null, current: number | null) {
  if (baseline === current) return [];
  return [`${label}: ${baseline ?? 'null'} -> ${current ?? 'null'}`];
}

function compareBaselineCase(baseline: EvaluationBaselineCase | undefined, current: EvaluationBaselineCase) {
  if (!baseline) {
    return ['missing baseline'];
  }

  return [
    ...(baseline.analysisDisposition === current.analysisDisposition
      ? []
      : [`analysisDisposition: ${baseline.analysisDisposition} -> ${current.analysisDisposition}`]),
    ...compareStringArrays('rejectionReasons', baseline.rejectionReasons, current.rejectionReasons),
    ...compareStringArrays('lowConfidenceReasons', baseline.lowConfidenceReasons, current.lowConfidenceReasons),
    ...compareStringArrays('topIssueLabels', baseline.topIssueLabels, current.topIssueLabels),
    ...compareStringArrays('fallbacksUsed', baseline.fallbacksUsed, current.fallbacksUsed),
    ...compareNumeric('totalScore', baseline.totalScore, current.totalScore),
    ...compareNumeric('confidenceScore', baseline.confidenceScore, current.confidenceScore),
    ...compareNumeric('scoreVariance', baseline.scoreVariance, current.scoreVariance),
    ...compareNumeric('temporalConsistency', baseline.temporalConsistency, current.temporalConsistency),
    ...compareNumeric('motionContinuity', baseline.motionContinuity, current.motionContinuity),
  ];
}

function summarizeNumbers(values: Array<number | null | undefined>): NumericSummary {
  const normalized = values
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((left, right) => left - right);

  if (normalized.length === 0) {
    return { count: 0, mean: null, p50: null, min: null, max: null };
  }

  const midpoint = Math.floor(normalized.length / 2);
  const p50 = normalized.length % 2 === 0
    ? Number(((normalized[midpoint - 1] + normalized[midpoint]) / 2).toFixed(4))
    : normalized[midpoint];
  const mean = normalized.reduce((sum, value) => sum + value, 0) / normalized.length;

  return {
    count: normalized.length,
    mean: Number(mean.toFixed(4)),
    p50,
    min: normalized[0] ?? null,
    max: normalized[normalized.length - 1] ?? null,
  };
}

function incrementCounter(counter: Record<string, number>, values: string[]) {
  for (const value of values) {
    counter[value] = (counter[value] ?? 0) + 1;
  }
}

function loadBaselineFile(baselinePath: string) {
  if (!fs.existsSync(baselinePath)) {
    return undefined;
  }

  return readJsonFile<EvaluationBaselineFile>(baselinePath);
}

function loadFixtureIndex(indexPath: string) {
  const index = readJsonFile<EvaluationFixtureIndex>(indexPath);
  if (!Array.isArray(index.fixtures) || index.fixtures.length === 0) {
    throw new Error(`fixture index is empty: ${indexPath}`);
  }

  for (const fixture of index.fixtures) {
    if (!fixture.id) {
      throw new Error('fixture id is required');
    }
    if (fixture.actionType !== 'clear') {
      throw new Error(`fixture "${fixture.id}" must use clear actionType in clear-only mode`);
    }
    if (
      !fixture.input?.videoPath
      && !fixture.input?.preprocessDir
      && !fixture.input?.poseResultPath
    ) {
      throw new Error(`fixture "${fixture.id}" must provide videoPath, preprocessDir, or poseResultPath`);
    }
  }

  return index;
}

async function executeVideoFixture(
  fixture: EvaluationFixtureCase,
  indexDir: string,
  estimatePose = estimatePoseForTaskDir,
  now = nowIso(),
): Promise<FixtureExecution> {
  const videoPath = requireInputPath(indexDir, fixture.input.videoPath, 'input.videoPath', fixture.id);
  const fileName = path.basename(videoPath);
  const metadata = await probeVideo(videoPath, {
    fileName,
    mimeType: guessMimeType(videoPath),
  });
  const validation = validateUploadedVideo(metadata);
  if (validation) {
    throw new Error(`fixture "${fixture.id}" video validation failed: ${validation.errorCode} (${validation.errorMessage})`);
  }

  const taskId = `evaluation_${sanitizeFixtureId(fixture.id)}_${randomUUID().slice(0, 8)}`;
  const artifacts = await extractFrames(taskId, videoPath, metadata);
  writePreprocessManifest(taskId, artifacts);
  const preprocessDir = path.join(getArtifactsDir(), 'tasks', taskId, 'preprocess');
  const poseResult = await estimatePose(preprocessDir);

  return {
    task: buildTaskRecord(taskId, fixture.actionType, { metadata, artifacts }, now),
    poseResult,
    cleanup: () => {
      fs.rmSync(path.join(getArtifactsDir(), 'tasks', taskId), { recursive: true, force: true });
    },
  };
}

async function executePreprocessFixture(
  fixture: EvaluationFixtureCase,
  indexDir: string,
  estimatePose = estimatePoseForTaskDir,
): Promise<FixtureExecution> {
  const preprocessDir = requireInputPath(indexDir, fixture.input.preprocessDir, 'input.preprocessDir', fixture.id);
  const context = loadDebugArtifactsContext(preprocessDir);
  const poseResult = await estimatePose(context.preprocessDir);
  return {
    task: buildDebugTaskRecord(context),
    poseResult,
  };
}

async function executePoseFixture(
  fixture: EvaluationFixtureCase,
  indexDir: string,
  now = nowIso(),
): Promise<FixtureExecution> {
  const poseResultPath = requireInputPath(indexDir, fixture.input.poseResultPath, 'input.poseResultPath', fixture.id);
  const poseResult = readJsonFile<PoseAnalysisResult>(poseResultPath);
  if (fixture.input.preprocessDir) {
    const preprocessDir = requireInputPath(indexDir, fixture.input.preprocessDir, 'input.preprocessDir', fixture.id);
    const context = loadDebugArtifactsContext(preprocessDir);
    return {
      task: buildTaskRecord(`evaluation_${sanitizeFixtureId(fixture.id)}`, fixture.actionType, {
        artifacts: context.artifacts,
      }, now),
      poseResult,
    };
  }

  return {
    task: buildTaskRecord(`evaluation_${sanitizeFixtureId(fixture.id)}`, fixture.actionType, undefined, now),
    poseResult,
  };
}

async function executeFixture(
  fixture: EvaluationFixtureCase,
  indexDir: string,
  options: EvaluateFixtureOptions,
): Promise<FixtureExecution & { inputMode: EvaluationCaseResult['inputMode'] }> {
  const estimatePose = options.estimatePoseForPreprocessDir ?? estimatePoseForTaskDir;
  const now = options.now?.() ?? nowIso();

  if (fixture.input.videoPath) {
    const execution = await executeVideoFixture(fixture, indexDir, estimatePose, now);
    return { ...execution, inputMode: 'video' };
  }

  if (fixture.input.preprocessDir) {
    const execution = await executePreprocessFixture(fixture, indexDir, estimatePose);
    return { ...execution, inputMode: 'preprocess' };
  }

  const execution = await executePoseFixture(fixture, indexDir, now);
  return { ...execution, inputMode: 'pose' };
}

export async function evaluateFixtureCase(
  fixture: EvaluationFixtureCase,
  indexDir: string,
  options: EvaluateFixtureOptions = {},
): Promise<EvaluationCaseResult> {
  const execution = await executeFixture(fixture, indexDir, options);

  try {
    const report = buildRuleBasedResult(execution.task, execution.poseResult);
    const analysisDisposition = report.scoringEvidence?.analysisDisposition ?? 'analyzable';
    const topIssueLabels = getActualIssueLabels(report, analysisDisposition);
    const lowConfidenceReasons = report.scoringEvidence?.rejectionDecision?.lowConfidenceReasons ?? [];
    const rejectionReasons = [...(execution.poseResult.summary.rejectionReasons ?? [])];
    const actual: EvaluationCaseResult['actual'] = {
      analysisDisposition,
      cameraQuality: classifyCameraQuality(report),
      rejectionReasons,
      lowConfidenceReasons,
      topIssueLabels,
      totalScore: analysisDisposition === 'rejected' ? null : report.totalScore,
      confidenceScore: analysisDisposition === 'rejected' ? null : report.confidenceScore ?? null,
      scoreVariance: execution.poseResult.summary.scoreVariance ?? null,
      temporalConsistency: execution.poseResult.summary.temporalConsistency ?? null,
      motionContinuity: execution.poseResult.summary.motionContinuity ?? null,
      fallbacksUsed: report.scoringEvidence?.fallbacksUsed ?? [],
      qualityFailureCode: getPoseQualityFailure(execution.poseResult)?.code ?? null,
    };

    const matchedIssueLabels = fixture.expected.majorIssueLabels.filter((label) => topIssueLabels.includes(label));
    const missedIssueLabels = fixture.expected.majorIssueLabels.filter((label) => !topIssueLabels.includes(label));
    const baselineCase = toBaselineCase({
      id: fixture.id,
      actionType: fixture.actionType,
      inputMode: execution.inputMode,
      expected: fixture.expected,
      actual,
      expectationCheck: {
        analysisDispositionMatched: false,
        cameraQualityMatched: false,
        matchedIssueLabels,
        missedIssueLabels,
      },
      baseline: {
        exists: false,
        changed: false,
        differences: [],
      },
      notes: fixture.notes,
      reviewerNotes: fixture.reviewerNotes,
    });
    const baseline = options.baseline?.fixtures?.[fixture.id];
    const differences = compareBaselineCase(baseline, baselineCase);

    return {
      id: fixture.id,
      actionType: fixture.actionType,
      inputMode: execution.inputMode,
      expected: fixture.expected,
      actual,
      expectationCheck: {
        analysisDispositionMatched: fixture.expected.analysisDisposition === actual.analysisDisposition,
        cameraQualityMatched: fixture.expected.cameraQuality === actual.cameraQuality,
        matchedIssueLabels,
        missedIssueLabels,
      },
      baseline: {
        exists: Boolean(baseline),
        changed: differences.length > 0,
        differences,
      },
      notes: fixture.notes,
      reviewerNotes: fixture.reviewerNotes,
    };
  } finally {
    execution.cleanup?.();
  }
}

export async function evaluateFixtureSuite(options: EvaluateSuiteOptions = {}): Promise<{
  report: EvaluationAggregateReport;
  baseline: EvaluationBaselineFile;
  baselinePath: string;
  indexPath: string;
}> {
  const indexPath = options.indexPath
    ? path.resolve(options.indexPath)
    : path.join(getEvaluationRoot(), 'fixtures', 'index.json');
  const baselinePath = path.join(getEvaluationRoot(), 'baseline.json');
  const baseline = options.baseline ?? loadBaselineFile(baselinePath);
  const index = loadFixtureIndex(indexPath);
  const indexDir = path.dirname(indexPath);

  const results: EvaluationCaseResult[] = [];
  for (const fixture of index.fixtures) {
    results.push(await evaluateFixtureCase(fixture, indexDir, {
      estimatePoseForPreprocessDir: options.estimatePoseForPreprocessDir,
      baseline,
      now: options.now,
    }));
  }

  const nextBaseline: EvaluationBaselineFile = {
    schemaVersion: 1,
    generatedAt: options.now?.() ?? nowIso(),
    fixtures: Object.fromEntries(results.map((result) => [result.id, toBaselineCase(result)])),
  };

  const successCount = results.filter((result) => result.actual.analysisDisposition !== 'rejected').length;
  const dispositionDistribution: Record<string, number> = {};
  const rejectionReasonDistribution: Record<string, number> = {};
  const lowConfidenceDistribution: Record<string, number> = {};
  for (const result of results) {
    dispositionDistribution[result.actual.analysisDisposition] = (dispositionDistribution[result.actual.analysisDisposition] ?? 0) + 1;
    incrementCounter(rejectionReasonDistribution, result.actual.rejectionReasons);
    incrementCounter(lowConfidenceDistribution, result.actual.lowConfidenceReasons);
  }

  const missedCases = results
    .filter((result) => result.expectationCheck.missedIssueLabels.length > 0)
    .map((result) => ({
      id: result.id,
      expected: result.expected.majorIssueLabels,
      missed: result.expectationCheck.missedIssueLabels,
    }));
  const expectedLabelCount = results.reduce((sum, result) => sum + result.expected.majorIssueLabels.length, 0);
  const matchedLabelCount = results.reduce((sum, result) => sum + result.expectationCheck.matchedIssueLabels.length, 0);
  const changedCases = results
    .filter((result) => result.baseline.changed)
    .map((result) => ({
      id: result.id,
      differences: result.baseline.differences,
    }));

  return {
    report: {
      summary: {
        totalFixtures: results.length,
        successCount,
        successRate: Number((successCount / Math.max(1, results.length)).toFixed(4)),
        dispositionDistribution,
        rejectionReasonDistribution,
        lowConfidenceDistribution,
        issueHit: {
          expectedLabelCount,
          matchedLabelCount,
          hitRate: Number((matchedLabelCount / Math.max(1, expectedLabelCount)).toFixed(4)),
          missedCases,
        },
        scoreVariance: summarizeNumbers(results.map((result) => result.actual.scoreVariance)),
        temporalConsistency: summarizeNumbers(results.map((result) => result.actual.temporalConsistency)),
        motionContinuity: summarizeNumbers(results.map((result) => result.actual.motionContinuity)),
        baselineComparison: {
          missingBaselineCount: results.filter((result) => !result.baseline.exists).length,
          changedCaseCount: changedCases.length,
          changedCases,
        },
      },
      cases: results,
    },
    baseline: nextBaseline,
    baselinePath,
    indexPath,
  };
}

export function renderEvaluationSummary(report: EvaluationAggregateReport) {
  const lines = [
    '# Offline Evaluation Summary',
    '',
    `- fixtures: ${report.summary.totalFixtures}`,
    `- successRate: ${report.summary.successCount}/${report.summary.totalFixtures} (${report.summary.successRate})`,
    `- dispositionDistribution: ${Object.entries(report.summary.dispositionDistribution).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
    `- rejectionReasons: ${Object.entries(report.summary.rejectionReasonDistribution).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
    `- lowConfidenceReasons: ${Object.entries(report.summary.lowConfidenceDistribution).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
    `- issueHitRate: ${report.summary.issueHit.matchedLabelCount}/${report.summary.issueHit.expectedLabelCount} (${report.summary.issueHit.hitRate})`,
    `- scoreVariance: mean=${report.summary.scoreVariance.mean ?? 'null'}, p50=${report.summary.scoreVariance.p50 ?? 'null'}, min=${report.summary.scoreVariance.min ?? 'null'}, max=${report.summary.scoreVariance.max ?? 'null'}`,
    `- temporalConsistency: mean=${report.summary.temporalConsistency.mean ?? 'null'}, p50=${report.summary.temporalConsistency.p50 ?? 'null'}, min=${report.summary.temporalConsistency.min ?? 'null'}, max=${report.summary.temporalConsistency.max ?? 'null'}`,
    `- motionContinuity: mean=${report.summary.motionContinuity.mean ?? 'null'}, p50=${report.summary.motionContinuity.p50 ?? 'null'}, min=${report.summary.motionContinuity.min ?? 'null'}, max=${report.summary.motionContinuity.max ?? 'null'}`,
    `- baselineChangedCases: ${report.summary.baselineComparison.changedCaseCount}`,
  ];

  if (report.summary.issueHit.missedCases.length > 0) {
    lines.push('', '## Missed Issue Labels', '');
    for (const item of report.summary.issueHit.missedCases) {
      lines.push(`- ${item.id}: missed ${item.missed.join(', ')} (expected ${item.expected.join(', ')})`);
    }
  }

  if (report.summary.baselineComparison.changedCases.length > 0) {
    lines.push('', '## Baseline Differences', '');
    for (const item of report.summary.baselineComparison.changedCases) {
      lines.push(`- ${item.id}: ${item.differences.join('; ')}`);
    }
  }

  return lines.join('\n');
}

export function writeBaselineFile(baselinePath: string, baseline: EvaluationBaselineFile) {
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

export function createTempEvaluationWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-eval-'));
}
