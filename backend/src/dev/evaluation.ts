import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ActionType, AnalysisTaskRecord, PoseAnalysisResult, PreprocessArtifacts, ReportResult } from '../types/task';
import { readJsonFile, writePreprocessManifest } from '../services/artifactStore';
import { estimatePoseForTaskDir } from '../services/analysisService';
import { getArtifactsDir } from '../services/database';
import { extractFrames, probeVideo, validateUploadedVideo } from '../services/preprocessService';
import { getPoseQualityFailure } from '../services/reportScoringService';
import { buildShadowRuleBasedResult, type ShadowActionType } from '../services/shadowReportScoringService';
import { buildDebugTaskRecord, loadDebugArtifactsContext } from './debugAlgorithmBaseline';

export type EvaluationCameraQuality = 'good' | 'limited' | 'poor';
export type EvaluationDisposition = 'rejected' | 'low_confidence' | 'analyzable';
export type EvaluationCoverageTag =
  | 'bad_camera'
  | 'subject_too_small'
  | 'poor_lighting_or_occlusion'
  | 'weak_preparation'
  | 'stable_preparation'
  | 'weak_loading'
  | 'stable_loading';

export const DEFAULT_REQUIRED_COVERAGE_TAGS_BY_ACTION: Record<ShadowActionType, EvaluationCoverageTag[]> = {
  clear: [
    'bad_camera',
    'subject_too_small',
    'poor_lighting_or_occlusion',
    'weak_preparation',
    'stable_preparation',
  ],
  smash: [
    'bad_camera',
    'subject_too_small',
    'weak_loading',
    'stable_loading',
  ],
};

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
  actionType: ShadowActionType;
  input: EvaluationFixtureInput;
  expected: EvaluationFixtureExpected;
  coverageTags: EvaluationCoverageTag[];
  notes?: string;
  reviewerNotes?: string;
}

export interface EvaluationFixtureIndex {
  requiredCoverageTags?: EvaluationCoverageTag[];
  requiredCoverageTagsByAction?: Partial<Record<ShadowActionType, EvaluationCoverageTag[]>>;
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
  recommendedSegmentAvailable: boolean;
  selectedSegmentAvailable: boolean;
  analyzedSegmentConsistent: boolean;
  samplingStrategyVersion: string | null;
  sampledFrameCount: number;
  motionBoostedFrameCount: number;
  sampledFrameDiversity: number | null;
  motionWindowCount: number;
  phaseCoverage: number | null;
  insufficientEvidenceRatio: number | null;
  inputQualityRejectRatio: number | null;
  lowConfidenceRatio: number | null;
}

export interface EvaluationBaselineFile {
  schemaVersion: 1;
  generatedAt: string;
  fixtures: Record<string, EvaluationBaselineCase>;
}

export interface EvaluationCaseResult {
  id: string;
  actionType: ShadowActionType;
  inputMode: 'video' | 'preprocess' | 'pose';
  coverageTags: EvaluationCoverageTag[];
  expected: EvaluationFixtureExpected;
  actual: {
    analysisDisposition: EvaluationDisposition;
    cameraQuality: EvaluationCameraQuality;
    primaryErrorCode: string;
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
    recommendedSegmentAvailable: boolean;
    selectedSegmentAvailable: boolean;
    analyzedSegmentConsistent: boolean;
    samplingStrategyVersion: string | null;
    sampledFrameCount: number;
    motionBoostedFrameCount: number;
    sampledFrameDiversity: number | null;
    motionWindowCount: number;
    phaseCoverage: number | null;
    insufficientEvidenceRatio: number | null;
    inputQualityRejectRatio: number | null;
    lowConfidenceRatio: number | null;
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

export interface EvaluationActionSummary {
  totalFixtures: number;
  dispositionDistribution: Record<string, number>;
  coverageStatus: {
    required: EvaluationCoverageTag[];
    present: EvaluationCoverageTag[];
    missing: EvaluationCoverageTag[];
  };
  issueHit: {
    expectedLabelCount: number;
    matchedLabelCount: number;
    hitRate: number;
  };
  baselineComparison: {
    missingBaselineCount: number;
    changedCaseCount: number;
  };
}

export interface EvaluationAggregateReport {
  summary: {
    totalFixtures: number;
    successCount: number;
    successRate: number;
    dispositionDistribution: Record<string, number>;
    primaryErrorCodeDistribution: Record<string, number>;
    rejectionReasonDistribution: Record<string, number>;
    lowConfidenceDistribution: Record<string, number>;
    expectationConsistency: {
      dispositionMatchCount: number;
      dispositionMatchRate: number;
      cameraQualityMatchCount: number;
      cameraQualityMatchRate: number;
    };
    coverageStatus: {
      required: EvaluationCoverageTag[];
      present: EvaluationCoverageTag[];
      missing: EvaluationCoverageTag[];
    };
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
    phaseCoverage: NumericSummary;
    motionBoostedFrameCount: NumericSummary;
    insufficientEvidenceRatio: NumericSummary;
    lowConfidenceRatio: NumericSummary;
    selectedSegmentAvailabilityRate: number;
    analyzedSegmentConsistencyRate: number;
    baselineComparison: {
      missingBaselineCount: number;
      changedCaseCount: number;
      changedCases: Array<{
        id: string;
        differences: string[];
      }>;
    };
    byAction: Partial<Record<ShadowActionType, EvaluationActionSummary>>;
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
  actionTypeFilter?: ShadowActionType | 'all';
  indexPath?: string;
};

type LoadFixtureIndexOptions = {
  actionTypeFilter: ShadowActionType | 'all';
  requireDeclaredCoverageTags: boolean;
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

function getDefaultIndexPath() {
  return path.join(getEvaluationRoot(), 'fixtures', 'index.json');
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

function toRuntimeActionType(actionType: ShadowActionType): ActionType {
  return actionType;
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

function classifyCameraQuality(report: Pick<ReportResult, 'scoringEvidence'>) {
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

function derivePhaseCoverageRatio(poseResult: PoseAnalysisResult) {
  const explicit = poseResult.summary.phaseCoverage?.coverageRatio;
  if (typeof explicit === 'number') {
    return explicit;
  }

  const phaseCandidates = poseResult.summary.phaseCandidates;
  if (!phaseCandidates) {
    return null;
  }

  const detectedPhaseCount = (['preparation', 'backswing', 'contactCandidate', 'followThrough'] as const)
    .filter((phaseKey) => phaseCandidates[phaseKey]?.detectionStatus === 'detected')
    .length;
  return Number((detectedPhaseCount / 4).toFixed(4));
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function getPrimaryErrorCode(
  analysisDisposition: EvaluationDisposition,
  qualityFailureCode: string | null,
  lowConfidenceReasons: string[],
) {
  if (analysisDisposition === 'rejected') {
    return qualityFailureCode ?? 'unknown_rejection_reason';
  }
  if (analysisDisposition === 'low_confidence') {
    return lowConfidenceReasons[0] ?? 'unknown_low_confidence_reason';
  }
  return 'none';
}

function getActualIssueLabels(report: Pick<ReportResult, 'issues'>, disposition: EvaluationDisposition) {
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
    recommendedSegmentAvailable: result.actual.recommendedSegmentAvailable,
    selectedSegmentAvailable: result.actual.selectedSegmentAvailable,
    analyzedSegmentConsistent: result.actual.analyzedSegmentConsistent,
    samplingStrategyVersion: result.actual.samplingStrategyVersion,
    sampledFrameCount: result.actual.sampledFrameCount,
    motionBoostedFrameCount: result.actual.motionBoostedFrameCount,
    sampledFrameDiversity: result.actual.sampledFrameDiversity,
    motionWindowCount: result.actual.motionWindowCount,
    phaseCoverage: result.actual.phaseCoverage,
    insufficientEvidenceRatio: result.actual.insufficientEvidenceRatio,
    inputQualityRejectRatio: result.actual.inputQualityRejectRatio,
    lowConfidenceRatio: result.actual.lowConfidenceRatio,
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

function compareBoolean(label: string, baseline: boolean, current: boolean) {
  if (baseline === current) return [];
  return [`${label}: ${baseline ? 'yes' : 'no'} -> ${current ? 'yes' : 'no'}`];
}

function withDriftExplanation(differences: string[]) {
  return differences.map((difference) => {
    if (difference.startsWith('samplingStrategyVersion:')) {
      return `${difference} (sampling strategy changed)`;
    }
    if (difference.startsWith('motionBoostedFrameCount:') || difference.startsWith('motionWindowCount:')) {
      return `${difference} (motion boosted sampling coverage changed)`;
    }
    if (difference.startsWith('phaseCoverage:')) {
      return `${difference} (phase coverage changed)`;
    }
    if (difference.startsWith('insufficientEvidenceRatio:') || difference.startsWith('lowConfidenceReasons:')) {
      return `${difference} (evidence gating changed)`;
    }
    if (difference.startsWith('inputQualityRejectRatio:') || difference.startsWith('rejectionReasons:')) {
      return `${difference} (input quality gating changed)`;
    }
    return difference;
  });
}

function compareBaselineCase(baseline: EvaluationBaselineCase | undefined, current: EvaluationBaselineCase) {
  if (!baseline) {
    return ['missing baseline'];
  }

  const normalizedBaseline = {
    ...baseline,
    recommendedSegmentAvailable: baseline.recommendedSegmentAvailable ?? false,
    selectedSegmentAvailable: baseline.selectedSegmentAvailable ?? false,
    analyzedSegmentConsistent: baseline.analyzedSegmentConsistent ?? false,
    samplingStrategyVersion: baseline.samplingStrategyVersion ?? null,
    sampledFrameCount: baseline.sampledFrameCount ?? 0,
    motionBoostedFrameCount: baseline.motionBoostedFrameCount ?? 0,
    sampledFrameDiversity: baseline.sampledFrameDiversity ?? null,
    motionWindowCount: baseline.motionWindowCount ?? 0,
    phaseCoverage: baseline.phaseCoverage ?? null,
    insufficientEvidenceRatio: baseline.insufficientEvidenceRatio ?? 0,
    inputQualityRejectRatio: baseline.inputQualityRejectRatio ?? 0,
    lowConfidenceRatio: baseline.lowConfidenceRatio ?? 0,
  };

  return withDriftExplanation([
    ...(normalizedBaseline.analysisDisposition === current.analysisDisposition
      ? []
      : [`analysisDisposition: ${normalizedBaseline.analysisDisposition} -> ${current.analysisDisposition}`]),
    ...compareStringArrays('rejectionReasons', normalizedBaseline.rejectionReasons, current.rejectionReasons),
    ...compareStringArrays('lowConfidenceReasons', normalizedBaseline.lowConfidenceReasons, current.lowConfidenceReasons),
    ...compareStringArrays('topIssueLabels', normalizedBaseline.topIssueLabels, current.topIssueLabels),
    ...compareStringArrays('fallbacksUsed', normalizedBaseline.fallbacksUsed, current.fallbacksUsed),
    ...compareNumeric('totalScore', normalizedBaseline.totalScore, current.totalScore),
    ...compareNumeric('confidenceScore', normalizedBaseline.confidenceScore, current.confidenceScore),
    ...compareNumeric('scoreVariance', normalizedBaseline.scoreVariance, current.scoreVariance),
    ...compareNumeric('temporalConsistency', normalizedBaseline.temporalConsistency, current.temporalConsistency),
    ...compareNumeric('motionContinuity', normalizedBaseline.motionContinuity, current.motionContinuity),
    ...compareBoolean('recommendedSegmentAvailable', normalizedBaseline.recommendedSegmentAvailable, current.recommendedSegmentAvailable),
    ...compareBoolean('selectedSegmentAvailable', normalizedBaseline.selectedSegmentAvailable, current.selectedSegmentAvailable),
    ...compareBoolean('analyzedSegmentConsistent', normalizedBaseline.analyzedSegmentConsistent, current.analyzedSegmentConsistent),
    ...compareStringArrays('samplingStrategyVersion', normalizedBaseline.samplingStrategyVersion ? [normalizedBaseline.samplingStrategyVersion] : [], current.samplingStrategyVersion ? [current.samplingStrategyVersion] : []),
    ...compareNumeric('sampledFrameCount', normalizedBaseline.sampledFrameCount, current.sampledFrameCount),
    ...compareNumeric('motionBoostedFrameCount', normalizedBaseline.motionBoostedFrameCount, current.motionBoostedFrameCount),
    ...compareNumeric('sampledFrameDiversity', normalizedBaseline.sampledFrameDiversity, current.sampledFrameDiversity),
    ...compareNumeric('motionWindowCount', normalizedBaseline.motionWindowCount, current.motionWindowCount),
    ...compareNumeric('phaseCoverage', normalizedBaseline.phaseCoverage, current.phaseCoverage),
    ...compareNumeric('insufficientEvidenceRatio', normalizedBaseline.insufficientEvidenceRatio, current.insufficientEvidenceRatio),
    ...compareNumeric('inputQualityRejectRatio', normalizedBaseline.inputQualityRejectRatio, current.inputQualityRejectRatio),
    ...compareNumeric('lowConfidenceRatio', normalizedBaseline.lowConfidenceRatio, current.lowConfidenceRatio),
  ]);
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

function loadFixtureIndex(indexPath: string, options: LoadFixtureIndexOptions) {
  const index = readJsonFile<EvaluationFixtureIndex>(indexPath);
  if (!Array.isArray(index.fixtures) || index.fixtures.length === 0) {
    throw new Error(`fixture index is empty: ${indexPath}`);
  }

  const selectedFixtures = options.actionTypeFilter === 'all'
    ? index.fixtures
    : index.fixtures.filter((fixture) => fixture.actionType === options.actionTypeFilter);
  if (selectedFixtures.length === 0) {
    throw new Error(`fixture index does not contain actionType=${options.actionTypeFilter}: ${indexPath}`);
  }

  const declaredRequiredCoverageTags = options.actionTypeFilter === 'all'
    ? (index.requiredCoverageTagsByAction
      ? [
        ...new Set(
          Object.values(index.requiredCoverageTagsByAction)
            .flatMap((tags) => tags ?? []),
        ),
      ]
      : (index.requiredCoverageTags ?? []))
    : (index.requiredCoverageTagsByAction?.[options.actionTypeFilter] ?? index.requiredCoverageTags ?? []);
  const requiredCoverageTags = declaredRequiredCoverageTags.length > 0
    ? declaredRequiredCoverageTags
    : (options.actionTypeFilter === 'all' ? [] : []);

  if (options.requireDeclaredCoverageTags && requiredCoverageTags.length === 0) {
    throw new Error(`fixture index must declare requiredCoverageTags or requiredCoverageTagsByAction: ${indexPath}`);
  }

  for (const fixture of selectedFixtures) {
    if (!fixture.id) {
      throw new Error('fixture id is required');
    }
    if (fixture.actionType !== 'clear' && fixture.actionType !== 'smash') {
      throw new Error(`fixture "${fixture.id}" must use clear or smash actionType`);
    }
    if (
      !fixture.input?.videoPath
      && !fixture.input?.preprocessDir
      && !fixture.input?.poseResultPath
    ) {
      throw new Error(`fixture "${fixture.id}" must provide videoPath, preprocessDir, or poseResultPath`);
    }
    if (!Array.isArray(fixture.coverageTags) || fixture.coverageTags.length === 0) {
      throw new Error(`fixture "${fixture.id}" must provide at least one coverageTag`);
    }
  }

  if (requiredCoverageTags.length > 0) {
    const presentCoverageTags = new Set(selectedFixtures.flatMap((fixture) => fixture.coverageTags));
    const missingCoverageTags = requiredCoverageTags.filter((tag) => !presentCoverageTags.has(tag));
    if (missingCoverageTags.length > 0) {
      throw new Error(`fixture index is missing requiredCoverageTags: ${missingCoverageTags.join(', ')}`);
    }
  }

  return {
    ...index,
    requiredCoverageTags,
    fixtures: selectedFixtures,
  };
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
    task: buildTaskRecord(taskId, toRuntimeActionType(fixture.actionType), { metadata, artifacts }, now),
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
      task: buildTaskRecord(`evaluation_${sanitizeFixtureId(fixture.id)}`, toRuntimeActionType(fixture.actionType), {
        artifacts: context.artifacts,
      }, now),
      poseResult,
    };
  }

  return {
    task: buildTaskRecord(`evaluation_${sanitizeFixtureId(fixture.id)}`, toRuntimeActionType(fixture.actionType), undefined, now),
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

  if (fixture.input.poseResultPath) {
    const execution = await executePoseFixture(fixture, indexDir, now);
    return { ...execution, inputMode: 'pose' };
  }

  const execution = await executePreprocessFixture(fixture, indexDir, estimatePose);
  return { ...execution, inputMode: 'preprocess' };
}

export async function evaluateFixtureCase(
  fixture: EvaluationFixtureCase,
  indexDir: string,
  options: EvaluateFixtureOptions = {},
): Promise<EvaluationCaseResult> {
  const execution = await executeFixture(fixture, indexDir, options);

  try {
    const report = buildShadowRuleBasedResult(execution.task, execution.poseResult, {
      shadowActionType: fixture.actionType,
    });
    const analysisDisposition = report.scoringEvidence?.analysisDisposition ?? 'analyzable';
    const topIssueLabels = getActualIssueLabels(report, analysisDisposition);
    const lowConfidenceReasons = report.scoringEvidence?.rejectionDecision?.lowConfidenceReasons ?? [];
    const rejectionReasons = [...(execution.poseResult.summary.rejectionReasons ?? [])];
    const qualityFailureCode = getPoseQualityFailure(execution.poseResult)?.code ?? null;
    const actual: EvaluationCaseResult['actual'] = {
      analysisDisposition,
      cameraQuality: classifyCameraQuality(report),
      primaryErrorCode: getPrimaryErrorCode(analysisDisposition, qualityFailureCode, lowConfidenceReasons),
      rejectionReasons,
      lowConfidenceReasons,
      topIssueLabels,
      totalScore: analysisDisposition === 'rejected' ? null : report.totalScore,
      confidenceScore: analysisDisposition === 'rejected' ? null : report.confidenceScore ?? null,
      scoreVariance: execution.poseResult.summary.scoreVariance ?? null,
      temporalConsistency: execution.poseResult.summary.temporalConsistency ?? null,
      motionContinuity: execution.poseResult.summary.motionContinuity ?? null,
      fallbacksUsed: report.scoringEvidence?.fallbacksUsed ?? [],
      qualityFailureCode,
      recommendedSegmentAvailable: Boolean(report.recommendedSegmentId),
      selectedSegmentAvailable: Boolean(report.selectedSegmentId),
      analyzedSegmentConsistent: Boolean(
        report.selectedSegmentId
        && (report.preprocess?.artifacts?.analyzedSegmentId ?? report.selectedSegmentId) === report.selectedSegmentId,
      ),
      samplingStrategyVersion: report.scoringEvidence?.samplingSummary?.samplingStrategyVersion ?? null,
      sampledFrameCount: report.scoringEvidence?.samplingSummary?.sampledFrameCount ?? 0,
      motionBoostedFrameCount: report.scoringEvidence?.samplingSummary?.motionBoostedFrameCount ?? 0,
      sampledFrameDiversity: report.scoringEvidence?.samplingSummary?.sampledFrameDiversity ?? null,
      motionWindowCount: report.scoringEvidence?.samplingSummary?.motionWindowCount ?? 0,
      phaseCoverage: report.scoringEvidence?.phaseCoverage?.coverageRatio ?? derivePhaseCoverageRatio(execution.poseResult),
      insufficientEvidenceRatio: execution.poseResult.summary.insufficientEvidenceReasons?.length
        ? Number((execution.poseResult.summary.insufficientEvidenceReasons.length / 4).toFixed(4))
        : 0,
      inputQualityRejectRatio: qualityFailureCode && ['subject_too_small_or_cropped', 'poor_lighting_or_occlusion', 'body_not_detected'].includes(qualityFailureCode)
        ? 1
        : 0,
      lowConfidenceRatio: lowConfidenceReasons.length > 0 ? Number((Math.min(lowConfidenceReasons.length, 3) / 3).toFixed(4)) : 0,
    };

    const matchedIssueLabels = fixture.expected.majorIssueLabels.filter((label) => topIssueLabels.includes(label));
    const missedIssueLabels = fixture.expected.majorIssueLabels.filter((label) => !topIssueLabels.includes(label));
    const baselineCase = toBaselineCase({
      id: fixture.id,
      actionType: fixture.actionType,
      inputMode: execution.inputMode,
      coverageTags: fixture.coverageTags,
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
      coverageTags: fixture.coverageTags,
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
    : getDefaultIndexPath();
  const baselinePath = path.join(getEvaluationRoot(), 'baseline.json');
  const baseline = options.baseline ?? loadBaselineFile(baselinePath);
  const isDefaultIndex = path.resolve(indexPath) === path.resolve(getDefaultIndexPath());
  const index = loadFixtureIndex(indexPath, {
    actionTypeFilter: options.actionTypeFilter ?? 'all',
    requireDeclaredCoverageTags: isDefaultIndex,
  });
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
    fixtures: {
      ...(baseline?.fixtures ?? {}),
      ...Object.fromEntries(results.map((result) => [result.id, toBaselineCase(result)])),
    },
  };

  const successCount = results.filter((result) => result.actual.analysisDisposition !== 'rejected').length;
  const dispositionDistribution: Record<string, number> = {};
  const primaryErrorCodeDistribution: Record<string, number> = {};
  const rejectionReasonDistribution: Record<string, number> = {};
  const lowConfidenceDistribution: Record<string, number> = {};
  for (const result of results) {
    dispositionDistribution[result.actual.analysisDisposition] = (dispositionDistribution[result.actual.analysisDisposition] ?? 0) + 1;
    primaryErrorCodeDistribution[result.actual.primaryErrorCode] = (primaryErrorCodeDistribution[result.actual.primaryErrorCode] ?? 0) + 1;
    incrementCounter(rejectionReasonDistribution, result.actual.rejectionReasons);
    incrementCounter(lowConfidenceDistribution, result.actual.lowConfidenceReasons);
  }

  const dispositionMatchCount = results.filter((result) => result.expectationCheck.analysisDispositionMatched).length;
  const cameraQualityMatchCount = results.filter((result) => result.expectationCheck.cameraQualityMatched).length;
  const requiredCoverageTags = index.requiredCoverageTags ?? [];
  const presentCoverageTags = [...new Set(results.flatMap((result) => result.coverageTags))].sort();
  const missingCoverageTags = requiredCoverageTags.filter((tag) => !presentCoverageTags.includes(tag));

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
  const actionSummaries = Object.fromEntries(
    (['clear', 'smash'] as const)
      .map((actionType) => {
        const actionResults = results.filter((result) => result.actionType === actionType);
        if (actionResults.length === 0) return null;
        const actionRequiredCoverageTags = index.requiredCoverageTagsByAction?.[actionType]
          ?? DEFAULT_REQUIRED_COVERAGE_TAGS_BY_ACTION[actionType]
          ?? [];
        const actionPresentCoverageTags = [...new Set(actionResults.flatMap((result) => result.coverageTags))].sort();
        const actionMatchedLabelCount = actionResults.reduce((sum, result) => sum + result.expectationCheck.matchedIssueLabels.length, 0);
        const actionExpectedLabelCount = actionResults.reduce((sum, result) => sum + result.expected.majorIssueLabels.length, 0);
        const actionDispositionDistribution: Record<string, number> = {};
        for (const actionResult of actionResults) {
          actionDispositionDistribution[actionResult.actual.analysisDisposition] = (actionDispositionDistribution[actionResult.actual.analysisDisposition] ?? 0) + 1;
        }

        return [actionType, {
          totalFixtures: actionResults.length,
          dispositionDistribution: actionDispositionDistribution,
          coverageStatus: {
            required: actionRequiredCoverageTags,
            present: actionPresentCoverageTags,
            missing: actionRequiredCoverageTags.filter((tag) => !actionPresentCoverageTags.includes(tag)),
          },
          issueHit: {
            expectedLabelCount: actionExpectedLabelCount,
            matchedLabelCount: actionMatchedLabelCount,
            hitRate: Number((actionMatchedLabelCount / Math.max(1, actionExpectedLabelCount)).toFixed(4)),
          },
          baselineComparison: {
            missingBaselineCount: actionResults.filter((result) => !result.baseline.exists).length,
            changedCaseCount: actionResults.filter((result) => result.baseline.changed).length,
          },
        } satisfies EvaluationActionSummary] as const;
      })
      .filter((entry): entry is readonly [ShadowActionType, EvaluationActionSummary] => Boolean(entry)),
  ) as Partial<Record<ShadowActionType, EvaluationActionSummary>>;

  return {
    report: {
      summary: {
        totalFixtures: results.length,
        successCount,
        successRate: Number((successCount / Math.max(1, results.length)).toFixed(4)),
        dispositionDistribution,
        primaryErrorCodeDistribution,
        rejectionReasonDistribution,
        lowConfidenceDistribution,
        expectationConsistency: {
          dispositionMatchCount,
          dispositionMatchRate: Number((dispositionMatchCount / Math.max(1, results.length)).toFixed(4)),
          cameraQualityMatchCount,
          cameraQualityMatchRate: Number((cameraQualityMatchCount / Math.max(1, results.length)).toFixed(4)),
        },
        coverageStatus: {
          required: [...requiredCoverageTags],
          present: presentCoverageTags,
          missing: missingCoverageTags,
        },
        issueHit: {
          expectedLabelCount,
          matchedLabelCount,
          hitRate: Number((matchedLabelCount / Math.max(1, expectedLabelCount)).toFixed(4)),
          missedCases,
        },
        scoreVariance: summarizeNumbers(results.map((result) => result.actual.scoreVariance)),
        temporalConsistency: summarizeNumbers(results.map((result) => result.actual.temporalConsistency)),
        motionContinuity: summarizeNumbers(results.map((result) => result.actual.motionContinuity)),
        phaseCoverage: summarizeNumbers(results.map((result) => result.actual.phaseCoverage)),
        motionBoostedFrameCount: summarizeNumbers(results.map((result) => result.actual.motionBoostedFrameCount)),
        insufficientEvidenceRatio: summarizeNumbers(results.map((result) => result.actual.insufficientEvidenceRatio)),
        lowConfidenceRatio: summarizeNumbers(results.map((result) => result.actual.lowConfidenceRatio)),
        selectedSegmentAvailabilityRate: Number((results.filter((result) => result.actual.selectedSegmentAvailable).length / Math.max(1, results.length)).toFixed(4)),
        analyzedSegmentConsistencyRate: Number((results.filter((result) => result.actual.analyzedSegmentConsistent).length / Math.max(1, results.length)).toFixed(4)),
        baselineComparison: {
          missingBaselineCount: results.filter((result) => !result.baseline.exists).length,
          changedCaseCount: changedCases.length,
          changedCases,
        },
        byAction: actionSummaries,
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
    `- primaryErrorCodes: ${Object.entries(report.summary.primaryErrorCodeDistribution).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
    `- rejectionReasons: ${Object.entries(report.summary.rejectionReasonDistribution).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
    `- lowConfidenceReasons: ${Object.entries(report.summary.lowConfidenceDistribution).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
    `- dispositionMatchRate: ${report.summary.expectationConsistency.dispositionMatchCount}/${report.summary.totalFixtures} (${report.summary.expectationConsistency.dispositionMatchRate})`,
    `- cameraQualityMatchRate: ${report.summary.expectationConsistency.cameraQualityMatchCount}/${report.summary.totalFixtures} (${report.summary.expectationConsistency.cameraQualityMatchRate})`,
    `- coverageTags: required=${report.summary.coverageStatus.required.join(', ') || 'none'}; present=${report.summary.coverageStatus.present.join(', ') || 'none'}; missing=${report.summary.coverageStatus.missing.join(', ') || 'none'}`,
    `- issueHitRate: ${report.summary.issueHit.matchedLabelCount}/${report.summary.issueHit.expectedLabelCount} (${report.summary.issueHit.hitRate})`,
    `- scoreVariance: mean=${report.summary.scoreVariance.mean ?? 'null'}, p50=${report.summary.scoreVariance.p50 ?? 'null'}, min=${report.summary.scoreVariance.min ?? 'null'}, max=${report.summary.scoreVariance.max ?? 'null'}`,
    `- temporalConsistency: mean=${report.summary.temporalConsistency.mean ?? 'null'}, p50=${report.summary.temporalConsistency.p50 ?? 'null'}, min=${report.summary.temporalConsistency.min ?? 'null'}, max=${report.summary.temporalConsistency.max ?? 'null'}`,
    `- motionContinuity: mean=${report.summary.motionContinuity.mean ?? 'null'}, p50=${report.summary.motionContinuity.p50 ?? 'null'}, min=${report.summary.motionContinuity.min ?? 'null'}, max=${report.summary.motionContinuity.max ?? 'null'}`,
    `- phaseCoverage: mean=${report.summary.phaseCoverage.mean ?? 'null'}, p50=${report.summary.phaseCoverage.p50 ?? 'null'}, min=${report.summary.phaseCoverage.min ?? 'null'}, max=${report.summary.phaseCoverage.max ?? 'null'}`,
    `- motionBoostedFrameCount: mean=${report.summary.motionBoostedFrameCount.mean ?? 'null'}, p50=${report.summary.motionBoostedFrameCount.p50 ?? 'null'}, min=${report.summary.motionBoostedFrameCount.min ?? 'null'}, max=${report.summary.motionBoostedFrameCount.max ?? 'null'}`,
    `- insufficientEvidenceRatio: mean=${report.summary.insufficientEvidenceRatio.mean ?? 'null'}, p50=${report.summary.insufficientEvidenceRatio.p50 ?? 'null'}, min=${report.summary.insufficientEvidenceRatio.min ?? 'null'}, max=${report.summary.insufficientEvidenceRatio.max ?? 'null'}`,
    `- lowConfidenceRatio: mean=${report.summary.lowConfidenceRatio.mean ?? 'null'}, p50=${report.summary.lowConfidenceRatio.p50 ?? 'null'}, min=${report.summary.lowConfidenceRatio.min ?? 'null'}, max=${report.summary.lowConfidenceRatio.max ?? 'null'}`,
    `- selectedSegmentAvailabilityRate: ${report.summary.selectedSegmentAvailabilityRate}`,
    `- analyzedSegmentConsistencyRate: ${report.summary.analyzedSegmentConsistencyRate}`,
    `- baselineChangedCases: ${report.summary.baselineComparison.changedCaseCount}`,
  ];

  const actionEntries = Object.entries(report.summary.byAction ?? {});
  if (actionEntries.length > 0) {
    lines.push('', '## By Action', '');
    for (const [actionType, actionSummary] of actionEntries) {
      lines.push(`- ${actionType}: fixtures=${actionSummary.totalFixtures}; disposition=${Object.entries(actionSummary.dispositionDistribution).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}; issueHit=${actionSummary.issueHit.matchedLabelCount}/${actionSummary.issueHit.expectedLabelCount} (${actionSummary.issueHit.hitRate}); coverageMissing=${actionSummary.coverageStatus.missing.join(', ') || 'none'}; baselineChanged=${actionSummary.baselineComparison.changedCaseCount}`);
    }
  }

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

  const gateFailures = getEvaluationGateFailures(report);
  if (gateFailures.length > 0) {
    lines.push('', '## Gate Failures', '');
    for (const failure of gateFailures) {
      lines.push(`- ${failure}`);
    }
  }

  return lines.join('\n');
}

export function getEvaluationGateFailures(report: EvaluationAggregateReport) {
  const failures: string[] = [];

  if (report.summary.coverageStatus.missing.length > 0) {
    failures.push(`missing required coverage tags: ${report.summary.coverageStatus.missing.join(', ')}`);
  }
  if (report.summary.baselineComparison.missingBaselineCount > 0) {
    failures.push(`missing baseline cases: ${report.summary.baselineComparison.missingBaselineCount}`);
  }
  if (report.summary.baselineComparison.changedCaseCount > 0) {
    failures.push(`baseline drift detected in ${report.summary.baselineComparison.changedCaseCount} case(s)`);
  }

  return failures;
}

export function writeBaselineFile(baselinePath: string, baseline: EvaluationBaselineFile) {
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

export function createTempEvaluationWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-eval-'));
}
