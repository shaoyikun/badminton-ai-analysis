import fs from 'node:fs';
import type { AnalysisTaskRecord, PoseAnalysisResult, ReportResult, StandardComparison, SuggestionItem } from '../types/task';
import { readPoseResult } from './poseService';

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

type ActionKey = 'clear' | 'smash';
type MetricKey = 'ready' | 'turn' | 'lift' | 'contact';

type IssueDefinition = {
  key: string;
  title: string;
  metricKey: MetricKey;
  threshold: number;
  severityWeight: number;
  description: string;
  impact: string;
  suggestionTitle: string;
  suggestionDescription: string;
};

type ActionConfig = {
  actionLabel: string;
  dimensionNames: Record<MetricKey, string>;
  weights: Record<MetricKey, number>;
  issueDefinitions: IssueDefinition[];
  compareSummary: string;
  retestFocus: string[];
  goodSummary: string;
  goodIssue: {
    title: string;
    description: string;
    impact: string;
  };
  goodSuggestion: SuggestionItem;
  standardReference: {
    title: string;
    cue: string;
    imageLabel: string;
    imagePath: string;
    sourceType: 'illustration' | 'real-sample';
    summaryPrefix: string;
  };
  phaseFrames?: Array<{
    phase: string;
    title: string;
    imagePath: string;
    cue: string;
  }>;
};

type MetricScores = Record<MetricKey, number>;

type RankedIssue = ReportResult['issues'][number] & {
  metricKey: MetricKey;
  severity: number;
  evidence: string;
  suggestion: SuggestionItem;
};

function joinCoachStyle(items: string[]) {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]}，${items[1]}`;
  return `${items.slice(0, -1).join('，')}，以及${items[items.length - 1]}`;
}

const ACTION_CONFIG: Record<ActionKey, ActionConfig> = {
  clear: {
    actionLabel: '正手高远球',
    dimensionNames: {
      ready: '准备姿态',
      turn: '转体/转髋',
      lift: '挥拍臂抬举',
      contact: '击球准备充分度',
    },
    weights: {
      ready: 0.22,
      turn: 0.3,
      lift: 0.2,
      contact: 0.28,
    },
    issueDefinitions: [
      {
        key: 'clear_turn',
        title: '转体展开不够开',
        metricKey: 'turn',
        threshold: 78,
        severityWeight: 1.2,
        description: '从这次样本看，击球前身体侧身和转髋展开还不够，更多像在正对来球时直接把手抡出去。',
        impact: '高远球最怕这个：力量传递会断，球容易打不深，后场压制感会明显变弱。',
        suggestionTitle: '下次继续看转体有没有真正打开',
        suggestionDescription: '下次复测保持同机位，优先观察击球前身体是否比这次更早完成侧身和转髋，而不是等来球到了才仓促出手。',
      },
      {
        key: 'clear_lift',
        title: '挥拍臂抬举偏低',
        metricKey: 'lift',
        threshold: 76,
        severityWeight: 1.05,
        description: '你的挥拍臂有抬起来，但还不够早也不够高，导致击球准备姿态没有完全打开。',
        impact: '会直接压缩击球空间，击球点容易掉下来，高远球就不容易又高又深。',
        suggestionTitle: '下次重点看击球空间有没有继续抬高',
        suggestionDescription: '下次复测时，优先对比挥拍臂是不是抬得更早、更高，确认击球点有没有继续往上走，而不是仍然缩在身体附近。',
      },
      {
        key: 'clear_ready',
        title: '准备姿态还不够稳定',
        metricKey: 'ready',
        threshold: 74,
        severityWeight: 0.95,
        description: '这段视频里能稳定识别到的有效准备动作还不算多，说明你的起手准备和节奏还不够稳。',
        impact: '准备不稳定时，后面的转体、引拍和击球点都会跟着飘，复测时也更难看出真实进步。',
        suggestionTitle: '下次先确认准备节奏有没有更稳',
        suggestionDescription: '下次复测保持同机位和相近节奏，先看准备—击球—收拍这条线能不能比这次更完整、更稳定地复现。',
      },
      {
        key: 'clear_contact',
        title: '击球准备衔接不够完整',
        metricKey: 'contact',
        threshold: 77,
        severityWeight: 1.1,
        description: '从准备到真正进入击球动作的衔接还不够顺，身体和挥拍臂没有完全连起来。',
        impact: '会让高远球看起来“有动作但没把力打出去”，出球弧线和深度都会受影响。',
        suggestionTitle: '下次重点看准备到击球有没有更连贯',
        suggestionDescription: '下次复测时，优先观察准备、上举和真正进入击球动作是不是接得更顺，确认身体和挥拍臂有没有比这次更像一整条线。',
      },
    ],
    compareSummary: '当前先按正手高远球的动作逻辑生成单次报告：更看重转体展开、击球准备和击球空间是否打开。',
    retestFocus: ['转体/转髋', '击球准备充分度', '挥拍臂抬举'],
    goodSummary: '这条高远球的基础框架已经出来了，下一步更值得盯的是击球质量和动作稳定复现。',
    goodIssue: {
      title: '高远球基础框架已成型',
      description: '准备姿态、转体和上举动作整体已经比较在线，没有出现特别突出的短板。',
      impact: '接下来更适合做稳定性打磨，把“偶尔做对”练成“连续都能做对”。',
    },
    goodSuggestion: {
      title: '下次继续确认动作是否稳定复现',
      description: '保持同一角度再次上传，重点不是追单次最好球，而是确认准备、转体和击球点能不能连续落在相近位置。',
    },
    standardReference: {
      title: '正手高远球标准参考帧',
      cue: '标准高远球更强调侧身打开、击球点抬高，以及击球后能自然把动作送出去。',
      imageLabel: '标准高远球真人参考帧',
      imagePath: '/standard-references/clear-reference-real.jpg',
      sourceType: 'real-sample',
      summaryPrefix: '和标准高远球相比，当前更值得优先盯住的差异是',
    },
    phaseFrames: [
      {
        phase: '准备',
        title: '高远球准备阶段',
        imagePath: '/standard-references/clear-phase-prep.jpg',
        cue: '先把站位和来球判断接好，让身体有足够空间转开。',
      },
      {
        phase: '击球',
        title: '高远球击球阶段',
        imagePath: '/standard-references/clear-phase-contact.jpg',
        cue: '在更高的击球点把球送出去，击球前身体和挥拍臂都要打开。',
      },
      {
        phase: '收拍',
        title: '高远球收拍阶段',
        imagePath: '/standard-references/clear-phase-follow.jpg',
        cue: '击球后顺势把动作送完，说明发力链条没有在出手前断掉。',
      },
    ],
  },
  smash: {
    actionLabel: '杀球',
    dimensionNames: {
      ready: '准备姿态',
      turn: '身体联动',
      lift: '挥拍臂抬举',
      contact: '杀球准备充分度',
    },
    weights: {
      ready: 0.18,
      turn: 0.32,
      lift: 0.22,
      contact: 0.28,
    },
    issueDefinitions: [
      {
        key: 'smash_contact',
        title: '杀球前的击球准备不够顶',
        metricKey: 'contact',
        threshold: 78,
        severityWeight: 1.2,
        description: '这次样本里，进入杀球动作前的准备还不够充分，整体更像“赶着打出去”，没有把点顶到最好位置。',
        impact: '杀球一旦准备不够，球速、下压角度和压迫感都会掉，容易变成一记普通快球。',
        suggestionTitle: '下次继续看高点准备有没有站住',
        suggestionDescription: '下次复测时，优先确认进入击球前的高点准备是不是比这次更充分，别再出现“赶着把球打出去”的感觉。',
      },
      {
        key: 'smash_turn',
        title: '身体联动发力还不够顺',
        metricKey: 'turn',
        threshold: 80,
        severityWeight: 1.15,
        description: '身体转动和挥拍动作目前衔接得还不够顺，更多是在用手臂单独发力。',
        impact: '这样杀球会比较吃手，力量上不去，连续几拍后也更容易累。',
        suggestionTitle: '下次重点看身体联动有没有更顺',
        suggestionDescription: '下次复测时，重点观察杀球是不是还主要靠手臂打出去，还是身体转动已经能更自然地把力量送出来。',
      },
      {
        key: 'smash_lift',
        title: '挥拍臂抬举高度还不够',
        metricKey: 'lift',
        threshold: 77,
        severityWeight: 1.05,
        description: '挥拍臂虽然有抬举，但还没完全把击球点托起来，顶点空间不够明显。',
        impact: '会让杀球点偏低，击球更平，球速和下压都会打折。',
        suggestionTitle: '下次确认击球点有没有继续抬高',
        suggestionDescription: '下次复测时，优先确认挥拍臂上举空间是不是比这次更明显，看看击球点有没有继续往更高的位置走。',
      },
      {
        key: 'smash_ready',
        title: '起手准备节奏不够稳定',
        metricKey: 'ready',
        threshold: 74,
        severityWeight: 0.9,
        description: '从视频看，起手准备和进入杀球动作的节奏还不够稳定，动作前段略显仓促。',
        impact: '会让后续发力顺序不稳定，杀球质量时好时坏，不利于复测对比。',
        suggestionTitle: '下次先看起手节奏有没有更稳',
        suggestionDescription: '下次复测时，先观察准备到上举这段是不是比这次更从容，避免前半段一乱，后面的起跳、联动和出手质量一起波动。',
      },
    ],
    compareSummary: '当前先按杀球的动作逻辑生成单次报告：比起高远球，会更看重击球准备是否顶得高、身体联动是否把力量送出来。',
    retestFocus: ['身体联动', '杀球准备充分度', '挥拍臂抬举'],
    goodSummary: '这条杀球已经有明显下压动作框架，下一步更适合继续抠发力顺序和稳定性。',
    goodIssue: {
      title: '杀球动作主框架已具备',
      description: '准备、联动和上举整体都在合格线以上，没有特别拖后腿的核心短板。',
      impact: '接下来如果继续打磨发力顺序，杀球质量还有进一步往上走的空间。',
    },
    goodSuggestion: {
      title: '下次继续确认杀球主框架是否稳定',
      description: '保持同一机位再次上传，重点确认高点准备、身体联动和下压感能不能连续复现，而不是只出现一次好的出手。',
    },
    standardReference: {
      title: '杀球标准参考帧',
      cue: '标准杀球更强调高点准备、躯干联动和明显的向前下压感。',
      imageLabel: '标准杀球参考帧',
      imagePath: '/standard-references/smash-reference-real.jpg',
      sourceType: 'real-sample',
      summaryPrefix: '和标准杀球相比，当前更值得优先看的差异是',
    },
    phaseFrames: [
      {
        phase: '准备',
        title: '杀球准备阶段',
        imagePath: '/standard-references/smash-phase-prep.jpg',
        cue: '先站稳并完成来球判断，准备把重心和起跳节奏接上。',
      },
      {
        phase: '引拍',
        title: '杀球引拍 / 起跳加载阶段',
        imagePath: '/standard-references/smash-phase-load.jpg',
        cue: '把身体打开并完成起跳加载，让高点准备和躯干联动先建立起来。',
      },
      {
        phase: '击球',
        title: '杀球击球阶段',
        imagePath: '/standard-references/smash-phase-contact.jpg',
        cue: '在最高点击球，并把力量沿着向前下压方向送出去。',
      },
    ],
  },
};

function resolveActionConfig(actionType: string): ActionConfig {
  return ACTION_CONFIG[actionType === 'smash' ? 'smash' : 'clear'];
}

function buildMetricScores(summary: PoseAnalysisResult['summary'], detectionCoverage: number): MetricScores {
  return {
    ready: clampScore(45 + toHundred(summary.avgStabilityScore) * 0.35 + detectionCoverage * 20),
    turn: clampScore(25 + toHundred(summary.avgBodyTurnScore) * 0.75),
    lift: clampScore(25 + toHundred(summary.avgRacketArmLiftScore) * 0.75),
    contact: clampScore(30 + toHundred(summary.avgRacketArmLiftScore) * 0.45 + toHundred(summary.avgBodyTurnScore) * 0.25),
  };
}

function buildSummaryText(config: ActionConfig, metricScores: MetricScores, poseSummaryText: string) {
  const weakestMetric = Object.entries(metricScores).sort((a, b) => a[1] - b[1])[0] as [MetricKey, number];
  const strongestMetric = Object.entries(metricScores).sort((a, b) => b[1] - a[1])[0] as [MetricKey, number];

  if (weakestMetric[1] >= 80) {
    return `${config.goodSummary} ${poseSummaryText}`.trim();
  }

  return `这次${config.actionLabel}里，${config.dimensionNames[strongestMetric[0]]}算是相对在线，但${config.dimensionNames[weakestMetric[0]]}更值得优先改。${poseSummaryText}`.trim();
}

function buildRankedIssues(config: ActionConfig, metricScores: MetricScores): RankedIssue[] {
  return config.issueDefinitions
    .map((definition) => {
      const metricScore = metricScores[definition.metricKey];
      const gap = definition.threshold - metricScore;
      if (gap <= 0) return null;

      const severity = gap * definition.severityWeight;
      const evidence = `${config.dimensionNames[definition.metricKey]} ${metricScore} 分，低于建议线 ${definition.threshold} 分`;

      return {
        title: definition.title,
        description: `${definition.description}（${evidence}）`,
        impact: definition.impact,
        metricKey: definition.metricKey,
        severity,
        evidence,
        suggestion: {
          title: definition.suggestionTitle,
          description: definition.suggestionDescription,
        },
      } satisfies RankedIssue;
    })
    .filter((item): item is RankedIssue => Boolean(item))
    .sort((a, b) => b.severity - a.severity);
}

function buildDimensionScores(config: ActionConfig, metricScores: MetricScores) {
  return (Object.keys(config.dimensionNames) as MetricKey[]).map((key) => ({
    name: config.dimensionNames[key],
    score: metricScores[key],
  }));
}

function buildCoachDifference(config: ActionConfig, issue: RankedIssue) {
  if (config.actionLabel === '正手高远球') {
    switch (issue.metricKey) {
      case 'turn':
        return '和标准高远球比，你现在更像是来球到了再出手，侧身和转髋打开得还不够，所以球更难被轻松送到后场深区。';
      case 'lift':
        return '和标准高远球比，你的挥拍臂抬举还不够早也不够高，击球空间没有完全撑开，高点击球的感觉还没立住。';
      case 'contact':
        return '和标准高远球比，准备到击球这一段衔接还不够完整，身体带手的顺序略断，出球更容易只有动作、没有穿透。';
      case 'ready':
        return '和标准高远球比，你前段准备节奏还不够稳，导致后面的转体、上举和击球点不容易每次都复现到同一个位置。';
    }
  }

  switch (issue.metricKey) {
    case 'turn':
      return '和标准杀球比，你现在更多还是在用手臂把球打出去，身体联动送力量的感觉还不够，所以杀球压迫感会差一截。';
    case 'lift':
      return '和标准杀球比，你的上举空间还没完全顶起来，击球点偏保守，导致球速和下压角度都还不够狠。';
    case 'contact':
      return '和标准杀球比，你进入击球前的准备还不够顶，高点没有先站住，整个杀球更像快打，而不是把力量真正砸下去。';
    case 'ready':
      return '和标准杀球比，你的起手准备节奏略赶，前半段没先稳住，后面的起跳、联动和出手质量就会跟着波动。';
  }
}

function buildStandardComparison(config: ActionConfig, rankedIssues: RankedIssue[]): StandardComparison {
  const differences = rankedIssues.length > 0
    ? rankedIssues.slice(0, 3).map((issue) => buildCoachDifference(config, issue))
    : ['当前动作主框架已经接近标准参考，下一步更适合继续做稳定性复现，把偶尔做对练成连续都能做对。'];

  const summaryText = rankedIssues.length > 0
    ? `${config.standardReference.summaryPrefix}${joinCoachStyle(rankedIssues.slice(0, 3).map((issue) => config.dimensionNames[issue.metricKey]))}。`
    : `${config.standardReference.summaryPrefix}动作主框架已经比较接近，可以把重点转到稳定性、击球质量和连续复现。`;

  return {
    sectionTitle: '标准动作对比',
    summaryText,
    currentFrameLabel: '当前样本最佳关键帧',
    standardFrameLabel: config.standardReference.imageLabel,
    standardReference: config.standardReference,
    phaseFrames: config.phaseFrames,
    differences,
  };
}

export function getPoseResultForTask(task: AnalysisTaskRecord): PoseAnalysisResult | undefined {
  if (!task.artifacts.poseResultPath || !fs.existsSync(task.artifacts.poseResultPath)) return undefined;
  return readPoseResult(task.artifacts.poseResultPath);
}

export function buildRuleBasedResult(task: AnalysisTaskRecord, poseResult: PoseAnalysisResult): ReportResult {
  const config = resolveActionConfig(task.actionType);
  const summary = poseResult.summary;
  const detectionCoverage = poseResult.frameCount > 0 ? poseResult.detectedFrameCount / poseResult.frameCount : 0;
  const metricScores = buildMetricScores(summary, detectionCoverage);
  const dimensionScores = buildDimensionScores(config, metricScores);
  const totalScore = clampScore(
    metricScores.ready * config.weights.ready
      + metricScores.turn * config.weights.turn
      + metricScores.lift * config.weights.lift
      + metricScores.contact * config.weights.contact,
  );

  const rankedIssues = buildRankedIssues(config, metricScores);

  const issues = rankedIssues.length > 0
    ? rankedIssues.slice(0, 3).map(({ title, description, impact }) => ({ title, description, impact }))
    : [config.goodIssue];

  const suggestions = rankedIssues.length > 0
    ? rankedIssues
        .map((item) => item.suggestion)
        .filter((item, index, arr) => arr.findIndex((candidate) => candidate.title === item.title) === index)
        .slice(0, 3)
    : [config.goodSuggestion];

  return {
    taskId: task.taskId,
    actionType: task.actionType,
    totalScore,
    summaryText: buildSummaryText(config, metricScores, summary.humanSummary),
    dimensionScores,
    issues,
    suggestions,
    compareSummary: config.compareSummary,
    retestAdvice: `建议 3~7 天后保持同一机位复测，下次重点看 ${config.retestFocus.join('、')} 这几个维度有没有继续抬上来。`,
    createdAt: now(),
    poseBased: true,
    standardComparison: buildStandardComparison(config, rankedIssues),
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
      metadata: task.artifacts.preprocess?.metadata,
      artifacts: task.artifacts.preprocess?.artifacts,
    },
  };
}

export function buildMockResult(task: AnalysisTaskRecord): ReportResult {
  const poseResult = getPoseResultForTask(task);
  if (poseResult && poseResult.detectedFrameCount > 0) {
    return buildRuleBasedResult(task, poseResult);
  }

  if (task.actionType === 'smash') {
    return {
      taskId: task.taskId,
      actionType: task.actionType,
      totalScore: 72,
      summaryText: '这条杀球有进攻意图，但目前更像“打快”而不是“打透”。优先把击球点顶高、把身体联动带出来。',
      dimensionScores: [
        { name: '准备姿态', score: 78 },
        { name: '身体联动', score: 69 },
        { name: '挥拍臂抬举', score: 73 },
        { name: '杀球准备充分度', score: 68 },
      ],
      issues: [
        {
          title: '杀球准备不够顶',
          description: '进入击球动作前，上举和准备还不够充分，顶点空间没有完全打开。',
          impact: '会影响球速和下压角度，杀球威胁感不够。',
        },
        {
          title: '身体联动偏弱',
          description: '目前更偏手臂单独发力，身体没有充分把力量送上去。',
          impact: '容易吃手，连续杀球后质量波动也会更大。',
        },
      ],
      suggestions: [
        {
          title: '下次继续看高点准备有没有站住',
          description: '下次复测时，优先确认进入击球前的高点准备是不是比这次更充分，别再出现“赶着把球打出去”的感觉。',
        },
        {
          title: '下次重点看身体联动有没有更顺',
          description: '下次复测时，重点观察杀球是不是还主要靠手臂打出去，还是身体转动已经能更自然地把力量送出来。',
        },
      ],
      compareSummary: '当前 PoC 阶段暂未接入真实复测对比，先按杀球的动作逻辑返回单次报告。',
      retestAdvice: '建议 3~7 天后保持同一机位复测，下次重点看身体联动、杀球准备充分度和挥拍臂抬举。',
      createdAt: now(),
      poseBased: false,
      standardComparison: {
        sectionTitle: '标准动作对比',
        summaryText: '和标准杀球相比，当前更值得优先看的差异是高点准备、身体联动和向前下压感。',
        currentFrameLabel: '当前样本关键帧占位',
        standardFrameLabel: '标准杀球参考帧占位',
        standardReference: ACTION_CONFIG.smash.standardReference,
        differences: ['高点准备不够顶', '身体联动发力偏弱', '下压感不够明显'],
      },
      preprocess: {
        metadata: task.artifacts.preprocess?.metadata,
        artifacts: task.artifacts.preprocess?.artifacts,
      },
    };
  }

  return {
    taskId: task.taskId,
    actionType: task.actionType,
    totalScore: 76,
    summaryText: '这条高远球基础框架还可以，但更需要优先把转体展开和高点击球空间打开。',
    dimensionScores: [
      { name: '准备姿态', score: 82 },
      { name: '转体/转髋', score: 68 },
      { name: '挥拍臂抬举', score: 71 },
      { name: '击球准备充分度', score: 73 },
    ],
    issues: [
      {
        title: '转体展开不足',
        description: '击球前身体没有完全侧过来，更多是在正面位置直接挥拍。',
        impact: '会影响高远球的出球深度和后场压制力。',
      },
      {
        title: '高点击球空间不够',
        description: '挥拍臂抬举还不够充分，击球点容易掉下来。',
        impact: '球不容易又高又深，动作也会显得发紧。',
      },
    ],
    suggestions: [
      {
        title: '下次继续看转体有没有真正打开',
        description: '下次复测保持同机位，优先观察击球前身体是否比这次更早完成侧身和转髋，而不是等来球到了才仓促出手。',
      },
      {
        title: '下次重点看击球空间有没有继续抬高',
        description: '下次复测时，优先对比挥拍臂是不是抬得更早、更高，确认击球点有没有继续往上走，而不是仍然缩在身体附近。',
      },
    ],
    compareSummary: '当前 PoC 阶段暂未接入真实复测对比，先按正手高远球的动作逻辑返回单次报告。',
    retestAdvice: '建议 3~7 天后保持同一机位复测，下次重点看转体/转髋、击球准备充分度和挥拍臂抬举。',
    createdAt: now(),
    poseBased: false,
    standardComparison: {
      sectionTitle: '标准动作对比',
      summaryText: '和标准高远球相比，当前更值得优先看的差异是转体展开、高点击球空间和准备到击球的连贯性。',
      currentFrameLabel: '当前样本关键帧占位',
      standardFrameLabel: '标准高远球参考帧占位',
      standardReference: ACTION_CONFIG.clear.standardReference,
      differences: ['转体展开不足', '高点击球空间不够', '准备到击球衔接不够完整'],
    },
    preprocess: {
      metadata: task.artifacts.preprocess?.metadata,
      artifacts: task.artifacts.preprocess?.artifacts,
    },
  };
}
