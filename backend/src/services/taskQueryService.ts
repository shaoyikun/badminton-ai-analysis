import type {
  ActionType,
  ComparisonResponse,
  HistoryDetailResponse,
  HistoryListQuery,
  HistoryListResponse,
  PoseAnalysisResult,
  ReportResult,
  RetestCoachReview,
  RetestComparison,
} from '../types/task';
import { findLatestCompletedTask, getReportRow, getTask, listCompletedHistory } from './taskRepository';
import { toTaskResource } from '../types/task';
import { readPoseResult } from './poseService';
import { readStoredReport } from './reportStore';

const PHASE_STATUS_WEIGHTS = {
  ok: 0,
  attention: 1,
  insufficient_evidence: 2,
} as const;

function clampDelta(value: number) {
  return Math.round(value);
}

function getActionLabel(actionType: ActionType) {
  return actionType === 'smash' ? '杀球' : '正手高远球';
}

function uniqueNames(names: Array<string | undefined>) {
  return [...new Set(names.filter((name): name is string => Boolean(name)))];
}

function formatNameList(names: string[]) {
  return names.join('、');
}

function buildPhaseDeltas(previous: ReportResult, current: ReportResult): RetestComparison['phaseDeltas'] {
  const previousPhases = previous.phaseBreakdown ?? [];
  const currentPhases = current.phaseBreakdown ?? [];

  return currentPhases.map((phase) => {
    const previousPhase = previousPhases.find((item) => item.phaseKey === phase.phaseKey);
    const previousStatus = previousPhase?.status ?? 'insufficient_evidence';
    const currentStatus = phase.status;
    const changed = previousStatus !== currentStatus;
    const summary = !changed
      ? `${phase.label}阶段和基线基本一致。`
      : PHASE_STATUS_WEIGHTS[currentStatus] < PHASE_STATUS_WEIGHTS[previousStatus]
        ? `${phase.label}阶段比基线更稳了。`
        : `${phase.label}阶段比基线更需要回看。`;

    return {
      phaseKey: phase.phaseKey,
      label: phase.label,
      previousStatus,
      currentStatus,
      changed,
      summary,
    };
  });
}

function buildCoachReview(actionType: ActionType, comparison: Omit<RetestComparison, 'coachReview'>): RetestCoachReview {
  const actionLabel = getActionLabel(actionType);
  const topImprovement = comparison.improvedDimensions[0];
  const topRegression = comparison.declinedDimensions[0];
  const stableDimension = comparison.unchangedDimensions[0];
  const focusDimensions = topRegression
    ? uniqueNames([topRegression.name, topImprovement?.name ?? stableDimension?.name]).slice(0, 2)
    : topImprovement
      ? uniqueNames([topImprovement.name, comparison.improvedDimensions[1]?.name ?? stableDimension?.name]).slice(0, 2)
      : uniqueNames([stableDimension?.name]).slice(0, 2);

  let headline = `${actionLabel}这次和对比样本相比，整体还在同一训练方向上。`;
  if (comparison.totalScoreDelta >= 6) {
    headline = `${actionLabel}这次能看出明显进步，最关键的动作点已经开始往更稳的方向走。`;
  } else if (comparison.totalScoreDelta > 0) {
    headline = `${actionLabel}这次是在往好的方向走，属于小幅但真实的进步。`;
  } else if (comparison.totalScoreDelta <= -6) {
    headline = `${actionLabel}这次有点往回掉，说明动作还没完全稳定下来。`;
  } else if (comparison.totalScoreDelta < 0) {
    headline = `${actionLabel}这次略有回落，但更像稳定性波动，不一定是训练方向走错。`;
  }

  const progressNote = topImprovement
    ? `最值得肯定的是 ${topImprovement.name}，从 ${topImprovement.previousScore} 分提到 ${topImprovement.currentScore} 分，说明最近训练已经开始在这个环节起作用了。`
    : stableDimension
      ? `${stableDimension.name} 这次基本和对比样本持平，说明你至少把动作底子维持住了，没有明显跑偏。`
      : '这次虽然没有特别突出的单项提升，但整体动作没有明显散掉，说明训练节奏还在。';

  const keepDoing = topImprovement
    ? `${topImprovement.name} 这一项已经开始抬上来了，这一轮先别换太多练法，优先把现在有效的训练节奏继续保住。`
    : stableDimension
      ? `${stableDimension.name} 这一项基本稳住了，说明当前动作主线没有散，后面继续沿着这个节奏练就行。`
      : undefined;

  const regressionNote = topRegression
    ? `${topRegression.name} 这次从 ${topRegression.previousScore} 分掉到 ${topRegression.currentScore} 分，更像是准备节奏或击球前衔接没接顺，建议先回看这一段，不要急着同时改太多点。`
    : undefined;

  const nextFocus = topRegression
    ? `下一次复测先只盯 ${formatNameList(focusDimensions)}，先把 ${topRegression.name} 收回来，同时把 ${focusDimensions[1] ?? '当前主动作框架'} 保住。`
    : topImprovement
      ? `下一次复测先只盯 ${formatNameList(focusDimensions)}，先确认 ${topImprovement.name} 不是偶尔做对，而是真的开始稳定复现。`
      : '下一次复测先保持同机位和同节奏录制，重点看动作能不能稳定复现，而不是只追求单次最好效果。';

  const nextCheck = topRegression
    ? `下次录制时，先看 ${topRegression.name} 有没有止跌回稳，再确认 ${focusDimensions[1] ?? '主动作框架'} 有没有被一起保住。`
    : topImprovement
      ? `下次录制时，先确认 ${topImprovement.name} 能不能连续复现，再顺手观察 ${focusDimensions[1] ?? '其余动作点'} 有没有被一起带稳。`
      : '下次录制时，重点确认动作节奏、机位和击球过程是否都还能稳定复现。';

  return {
    headline,
    progressNote,
    keepDoing,
    regressionNote,
    nextFocus,
    nextCheck,
    focusDimensions,
  };
}

function buildRetestComparison(actionType: ActionType, previous: ReportResult, current: ReportResult): RetestComparison {
  const totalScoreDelta = clampDelta(current.totalScore - previous.totalScore);
  const phaseDeltas = buildPhaseDeltas(previous, current);

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
  const changedPhase = phaseDeltas.find((item) => item.changed);

  let summaryText = '和对比样本相比，这次数据整体比较接近，建议继续保持同机位复测，观察动作稳定性。';
  if (totalScoreDelta > 0 && improvedDimensions.length > 0) {
    const names = improvedDimensions.slice(0, 2).map((item) => item.name);
    summaryText = declinedDimensions.length > 0
      ? `和对比样本相比，这次最明显的提升在 ${formatNameList(names)}，但 ${declinedDimensions[0].name} 还有一点波动，说明训练已经开始起作用，只是还没完全稳住。`
      : `和对比样本相比，这次最明显的提升在 ${formatNameList(names)}，说明最近训练先把这些动作点带起来了。`;
  } else if (totalScoreDelta < 0 && declinedDimensions.length > 0) {
    const names = declinedDimensions.slice(0, 2).map((item) => item.name);
    summaryText = unchangedDimensions.length > 0
      ? `和对比样本相比，这次主要回落在 ${formatNameList(names)}，但 ${unchangedDimensions[0].name} 还基本守住，更像阶段性波动，不是整套动作都退掉了。`
      : `和对比样本相比，这次主要回落在 ${formatNameList(names)}，说明这几个动作点还需要继续盯紧。`;
  } else if (improvedDimensions.length > 0 && declinedDimensions.length > 0) {
    summaryText = `和对比样本相比，这次有进有退：${improvedDimensions[0].name} 在抬上来，${declinedDimensions[0].name} 有一点回落，说明训练方向没错，但稳定性还没完全接住。`;
  } else if (unchangedDimensions.length > 0) {
    summaryText = `和对比样本相比，这次最主要的是 ${unchangedDimensions[0].name} 还守住了，说明主动作框架没有明显跑掉。`;
  }
  if (changedPhase) {
    summaryText = `${summaryText} 阶段上最明显的变化出现在${changedPhase.label}阶段。`;
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
    phaseDeltas,
    summaryText,
  };

  return {
    ...comparison,
    coachReview: buildCoachReview(actionType, comparison),
  };
}

export function listTaskHistory(query: HistoryListQuery): HistoryListResponse {
  const items = listCompletedHistory(query);
  const nextCursor = items.length > 0 ? items[items.length - 1]?.completedAt : undefined;
  return { items, nextCursor };
}

export function getHistoryDetail(taskId: string): HistoryDetailResponse | undefined {
  const task = getTask(taskId);
  const report = readStoredReport(taskId);
  if (!task || !report || task.status !== 'completed') return undefined;
  return {
    task: toTaskResource(task),
    report,
  };
}

export function getRetestComparison(taskId: string, baselineTaskId?: string): ComparisonResponse | undefined | null {
  const currentTask = getTask(taskId);
  const currentReport = readStoredReport(taskId);
  if (!currentTask || !currentReport || currentTask.status !== 'completed') return undefined;

  const baseline = baselineTaskId
    ? getTask(baselineTaskId)
    : currentTask.baselineTaskId
      ? getTask(currentTask.baselineTaskId)
      : findLatestCompletedTask(currentTask.actionType, taskId);

  if (!baseline || baseline.status !== 'completed') return undefined;
  if (baseline.actionType !== currentTask.actionType) return null;

  const baselineReport = readStoredReport(baseline.taskId);
  if (!baselineReport) return undefined;
  const baselineModelVersion = baselineReport.scoringEvidence?.scoringModelVersion;
  const currentModelVersion = currentReport.scoringEvidence?.scoringModelVersion;
  const comparableByModel = Boolean(
    baselineModelVersion
      && currentModelVersion
      && baselineModelVersion === currentModelVersion,
  );

  return {
    currentTask: toTaskResource(currentTask),
    baselineTask: toTaskResource(baseline),
    comparison: comparableByModel
      ? buildRetestComparison(currentTask.actionType, baselineReport, currentReport)
      : null,
    unavailableReason: comparableByModel ? undefined : 'scoring_model_mismatch',
  };
}

export function getPoseResultForDebug(taskId: string): PoseAnalysisResult | undefined {
  const task = getTask(taskId);
  if (!task) return undefined;
  return readPoseResult(task.artifacts.poseResultPath);
}
