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
};

type MetricScores = Record<MetricKey, number>;

type RankedIssue = ReportResult['issues'][number] & {
  metricKey: MetricKey;
  severity: number;
  evidence: string;
  suggestion: SuggestionItem;
};

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
        suggestionTitle: '侧身转髋分解挥拍',
        suggestionDescription: '先不拿球，做“侧身准备—转髋带肩—再挥拍”的分解动作。每天 3 组，每组 12 次，先把身体带动手的感觉练出来。',
      },
      {
        key: 'clear_lift',
        title: '挥拍臂抬举偏低',
        metricKey: 'lift',
        threshold: 76,
        severityWeight: 1.05,
        description: '你的挥拍臂有抬起来，但还不够早也不够高，导致击球准备姿态没有完全打开。',
        impact: '会直接压缩击球空间，击球点容易掉下来，高远球就不容易又高又深。',
        suggestionTitle: '最高点击球定点练习',
        suggestionDescription: '先做无球举拍定点，固定“最高点击球”位置，再加轻挥拍。每天 3 组，每组 15 次，重点感受上举后的舒展感。',
      },
      {
        key: 'clear_ready',
        title: '准备姿态还不够稳定',
        metricKey: 'ready',
        threshold: 74,
        severityWeight: 0.95,
        description: '这段视频里能稳定识别到的有效准备动作还不算多，说明你的起手准备和节奏还不够稳。',
        impact: '准备不稳定时，后面的转体、引拍和击球点都会跟着飘，复测时也更难看出真实进步。',
        suggestionTitle: '固定机位重复录制 3 条',
        suggestionDescription: '保持同一机位，连续录 3 条高远球视频，先只追求准备—击球—收拍流程完整，再看动作细节。',
      },
      {
        key: 'clear_contact',
        title: '击球准备衔接不够完整',
        metricKey: 'contact',
        threshold: 77,
        severityWeight: 1.1,
        description: '从准备到真正进入击球动作的衔接还不够顺，身体和挥拍臂没有完全连起来。',
        impact: '会让高远球看起来“有动作但没把力打出去”，出球弧线和深度都会受影响。',
        suggestionTitle: '引拍到击球一拍成型练习',
        suggestionDescription: '做慢速连贯挥拍：准备、引拍、上举、击球动作一口气完成。每天 3 组，每组 10 次，先练连贯，再练发力。',
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
      title: '同机位连续复测 3 组',
      description: '保持同一角度，每组连续打 5~8 个高远球，重点看动作是否能稳定复现，而不是只盯单次最好球。',
    },
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
        suggestionTitle: '最高点击球 + 下压挥拍练习',
        suggestionDescription: '先固定最高点击球位置，再做向前下压的轻挥拍。每天 3 组，每组 12 次，先把“高点出手”建立起来。',
      },
      {
        key: 'smash_turn',
        title: '身体联动发力还不够顺',
        metricKey: 'turn',
        threshold: 80,
        severityWeight: 1.15,
        description: '身体转动和挥拍动作目前衔接得还不够顺，更多是在用手臂单独发力。',
        impact: '这样杀球会比较吃手，力量上不去，连续几拍后也更容易累。',
        suggestionTitle: '转髋带肩杀球分解',
        suggestionDescription: '做“转髋—带肩—挥拍”分解练习，先慢动作找身体带手的顺序。每天 3 组，每组 10 次。',
      },
      {
        key: 'smash_lift',
        title: '挥拍臂抬举高度还不够',
        metricKey: 'lift',
        threshold: 77,
        severityWeight: 1.05,
        description: '挥拍臂虽然有抬举，但还没完全把击球点托起来，顶点空间不够明显。',
        impact: '会让杀球点偏低，击球更平，球速和下压都会打折。',
        suggestionTitle: '举拍上顶定点练习',
        suggestionDescription: '无球状态下先把举拍顶到最高点停 1 秒，再完成挥拍。每天 3 组，每组 15 次，找“高点停住”的感觉。',
      },
      {
        key: 'smash_ready',
        title: '起手准备节奏不够稳定',
        metricKey: 'ready',
        threshold: 74,
        severityWeight: 0.9,
        description: '从视频看，起手准备和进入杀球动作的节奏还不够稳定，动作前段略显仓促。',
        impact: '会让后续发力顺序不稳定，杀球质量时好时坏，不利于复测对比。',
        suggestionTitle: '固定节奏起手练习',
        suggestionDescription: '先按固定节奏完成准备—上举—挥拍，宁可慢一点，也要把前半段节奏做稳。每天 3 组，每组 8 次。',
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
      title: '连续杀球节奏复测',
      description: '保持同一机位，连续录 3 条杀球样本，重点观察每次能否都把击球点顶高、把身体联动带出来。',
    },
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

export function getPoseResultForTask(task: TaskRecord): PoseAnalysisResult | undefined {
  if (!task.pose?.resultPath || !fs.existsSync(task.pose.resultPath)) return undefined;
  return readPoseResult(task.pose.resultPath);
}

export function buildRuleBasedResult(task: TaskRecord, poseResult: PoseAnalysisResult): ReportResult {
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
          title: '最高点击球 + 下压挥拍练习',
          description: '先固定高点击球位置，再做向前下压挥拍。每天 3 组，每组 12 次。',
        },
        {
          title: '转髋带肩杀球分解',
          description: '先慢动作练顺序，再逐步提速。每天 3 组，每组 10 次。',
        },
      ],
      compareSummary: '当前 PoC 阶段暂未接入真实复测对比，先按杀球的动作逻辑返回单次报告。',
      retestAdvice: '建议 3~7 天后保持同一机位复测，下次重点看身体联动、杀球准备充分度和挥拍臂抬举。',
      createdAt: now(),
      poseBased: false,
      preprocess: {
        metadata: task.preprocess?.metadata,
        artifacts: task.preprocess?.artifacts,
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
        title: '侧身转髋分解挥拍',
        description: '每天 3 组，每组 12 次，先把身体带手的顺序做出来。',
      },
      {
        title: '最高点击球定点练习',
        description: '每天 3 组，每组 15 次，优先建立高点击球的空间感。',
      },
    ],
    compareSummary: '当前 PoC 阶段暂未接入真实复测对比，先按正手高远球的动作逻辑返回单次报告。',
    retestAdvice: '建议 3~7 天后保持同一机位复测，下次重点看转体/转髋、击球准备充分度和挥拍臂抬举。',
    createdAt: now(),
    poseBased: false,
    preprocess: {
      metadata: task.preprocess?.metadata,
      artifacts: task.preprocess?.artifacts,
    },
  };
}
