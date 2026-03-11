import fs from 'node:fs';
import { PoseAnalysisResult, ReportResult, SuggestionItem, TaskRecord } from '../types/task';
import { readPoseResult } from './store';

function now() {
  return new Date().toISOString();
}

function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function toHundred(score?: number | null, fallback = 0) {
  if (score === null || score === undefined || Number.isNaN(score)) return fallback;
  return score * 100;
}

export function getPoseResultForTask(task: TaskRecord): PoseAnalysisResult | undefined {
  if (!task.pose?.resultPath || !fs.existsSync(task.pose.resultPath)) return undefined;
  return readPoseResult(task.pose.resultPath);
}

export function buildRuleBasedResult(task: TaskRecord, poseResult: PoseAnalysisResult): ReportResult {
  const summary = poseResult.summary;
  const detectionCoverage = poseResult.frameCount > 0 ? poseResult.detectedFrameCount / poseResult.frameCount : 0;

  const readyScore = clampScore(45 + toHundred(summary.avgStabilityScore) * 0.35 + detectionCoverage * 20);
  const turnScore = clampScore(25 + toHundred(summary.avgBodyTurnScore) * 0.75);
  const liftScore = clampScore(25 + toHundred(summary.avgRacketArmLiftScore) * 0.75);
  const contactScore = clampScore(30 + toHundred(summary.avgRacketArmLiftScore) * 0.45 + toHundred(summary.avgBodyTurnScore) * 0.25);

  const dimensionScores = [
    { name: '准备姿态', score: readyScore },
    { name: '转体/转髋', score: turnScore },
    { name: '击球准备充分度', score: contactScore },
    { name: '挥拍臂抬举', score: liftScore },
  ];

  const totalScore = clampScore(dimensionScores.reduce((sum, item) => sum + item.score, 0) / dimensionScores.length);

  const issues = [] as ReportResult['issues'];
  const suggestions: SuggestionItem[] = [];

  if (turnScore < 70) {
    issues.push({
      title: '转体展开不足',
      description: '当前识别到的身体侧身程度还不够稳定，击球前身体更容易正对镜头。',
      impact: '会影响力量传递和击球深度，后场出球更容易发虚。',
    });
    suggestions.push({
      title: '转体挥拍分解练习',
      description: '先做无球分解：侧身准备、转髋带肩、再完成挥拍。每天 3 组，每组 12 次。',
    });
  }

  if (liftScore < 70) {
    issues.push({
      title: '挥拍臂抬举不够',
      description: '挥拍臂提前抬起的幅度还不够，击球准备姿态不够舒展。',
      impact: '会压缩击球空间，导致击球点不够高、发力链条不够顺。',
    });
    suggestions.push({
      title: '高点击球定点练习',
      description: '固定最高点击球位置，先无球举拍定点，再做轻挥拍。每天 3 组，每组 15 次。',
    });
  }

  if (readyScore < 72) {
    issues.push({
      title: '准备姿态稳定度一般',
      description: '可稳定识别到的有效动作帧还不多，说明当前样本里的准备阶段还不够稳定，或机位对识别不够友好。',
      impact: '会让后续动作判断波动更大，也不利于持续复测比较。',
    });
    suggestions.push({
      title: '固定机位重复录制',
      description: '保持侧后方或正后方机位，连续录 3 条同动作视频，优先保证准备—击球—收拍过程完整。',
    });
  }

  if (issues.length === 0) {
    issues.push({
      title: '动作框架基本在线',
      description: '当前样本里准备姿态、转体和挥拍臂抬举都已经有了不错基础。',
      impact: '下一步可以继续细化击球点、跟随动作和复测一致性。',
    });
    suggestions.push({
      title: '保持同机位持续复测',
      description: '建议沿用当前拍摄方式，每 3~7 天复测一次，观察几个核心维度是否继续上升。',
    });
  }

  const dedupedSuggestions = suggestions.filter((item, index, arr) => arr.findIndex((candidate) => candidate.title === item.title) === index).slice(0, 3);
  const topIssues = issues.slice(0, 3);

  return {
    taskId: task.taskId,
    actionType: task.actionType,
    totalScore,
    summaryText: summary.humanSummary,
    dimensionScores,
    issues: topIssues,
    suggestions: dedupedSuggestions,
    compareSummary: '当前 PoC 阶段暂未接入真实复测对比，先基于本次姿态识别结果生成单次报告。',
    retestAdvice: '建议 3~7 天后保持同一机位复测，下次重点看准备姿态、转体/转髋和挥拍臂抬举是否提升。',
    createdAt: now(),
    poseBased: true,
    scoringEvidence: {
      detectedFrameCount: poseResult.detectedFrameCount,
      frameCount: poseResult.frameCount,
      avgStabilityScore: summary.avgStabilityScore,
      avgBodyTurnScore: summary.avgBodyTurnScore,
      avgRacketArmLiftScore: summary.avgRacketArmLiftScore,
      bestFrameIndex: summary.bestFrameIndex,
      humanSummary: summary.humanSummary,
    },
    preprocess: {
      metadata: task.preprocess?.metadata,
      artifacts: task.preprocess?.artifacts,
    },
  };
}

export function buildMockResult(task: TaskRecord): ReportResult {
  const poseResult = getPoseResultForTask(task);
  if (poseResult && poseResult.detectedFrameCount > 0) {
    return buildRuleBasedResult(task, poseResult);
  }

  return {
    taskId: task.taskId,
    actionType: task.actionType,
    totalScore: task.actionType === 'smash' ? 72 : 76,
    summaryText: '当前样本姿态命中还不够稳定，先返回占位报告结构。',
    dimensionScores: [
      { name: '准备姿态', score: 82 },
      { name: '引拍完整度', score: 73 },
      { name: '转体/转髋', score: 68 },
      { name: '击球点', score: 71 },
    ],
    issues: [
      {
        title: '击球点偏晚',
        description: '接触球点更靠近身体后侧。',
        impact: '出球深度不足，后场压制力下降。',
      },
    ],
    suggestions: [
      {
        title: '高点击球定点练习',
        description: '每天 3 组，每组 15 次。',
      },
    ],
    compareSummary: '当前 PoC 阶段暂未接入真实复测对比，先返回结构占位字段。',
    retestAdvice: '建议 3~7 天后保持同一机位复测。',
    createdAt: now(),
    poseBased: false,
    preprocess: {
      metadata: task.preprocess?.metadata,
      artifacts: task.preprocess?.artifacts,
    },
  };
}
