import path from 'node:path';
import { evaluateFixtureSuite, getEvaluationGateFailures, renderEvaluationSummary, writeBaselineFile } from './evaluation';

export function parseArgs(argv: string[]) {
  let json = false;
  let updateBaseline = false;
  let indexPath: string | undefined;
  let actionType: 'clear' | 'smash' | 'all' = 'all';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--update-baseline') {
      updateBaseline = true;
      continue;
    }
    if (arg === '--index') {
      indexPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--action-type') {
      const value = argv[index + 1];
      if (value !== 'clear' && value !== 'smash' && value !== 'all') {
        throw new Error(`invalid --action-type value: ${value ?? 'undefined'}`);
      }
      actionType = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return { json, updateBaseline, indexPath, actionType };
}

type CliDependencies = {
  evaluateFixtureSuiteImpl?: typeof evaluateFixtureSuite;
  writeBaselineFileImpl?: typeof writeBaselineFile;
  stdout?: (message: string) => void;
};

export async function runEvaluateFixturesCli(argv: string[], dependencies: CliDependencies = {}) {
  const args = parseArgs(argv);
  const evaluateFixtureSuiteImpl = dependencies.evaluateFixtureSuiteImpl ?? evaluateFixtureSuite;
  const writeBaselineFileImpl = dependencies.writeBaselineFileImpl ?? writeBaselineFile;
  const stdout = dependencies.stdout ?? ((message: string) => process.stdout.write(`${message}\n`));
  const { report, baseline, baselinePath, indexPath } = await evaluateFixtureSuiteImpl({
    indexPath: args.indexPath ? path.resolve(args.indexPath) : undefined,
    actionTypeFilter: args.actionType,
  });

  if (args.updateBaseline) {
    writeBaselineFileImpl(baselinePath, baseline);
  }

  if (args.json) {
    stdout(JSON.stringify({
      indexPath,
      actionType: args.actionType,
      baselinePath,
      report,
      baselineUpdated: args.updateBaseline,
    }, null, 2));
  } else {
    stdout(renderEvaluationSummary(report));
    stdout('');
    stdout(`- indexPath: ${indexPath}`);
    stdout(`- actionType: ${args.actionType}`);
    stdout(`- baselinePath: ${baselinePath}`);
    stdout(`- baselineUpdated: ${args.updateBaseline ? 'yes' : 'no'}`);
  }

  if (args.updateBaseline) {
    return 0;
  }

  return getEvaluationGateFailures(report).length > 0 ? 1 : 0;
}

async function main() {
  process.exitCode = await runEvaluateFixturesCli(process.argv.slice(2));
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
