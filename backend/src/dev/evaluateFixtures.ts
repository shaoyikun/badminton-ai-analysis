import path from 'node:path';
import { evaluateFixtureSuite, renderEvaluationSummary, writeBaselineFile } from './evaluation';

function parseArgs(argv: string[]) {
  let json = false;
  let updateBaseline = false;
  let indexPath: string | undefined;

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
    throw new Error(`unknown argument: ${arg}`);
  }

  return { json, updateBaseline, indexPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { report, baseline, baselinePath, indexPath } = await evaluateFixtureSuite({
    indexPath: args.indexPath ? path.resolve(args.indexPath) : undefined,
  });

  if (args.updateBaseline) {
    writeBaselineFile(baselinePath, baseline);
  }

  if (args.json) {
    console.log(JSON.stringify({
      indexPath,
      baselinePath,
      report,
      baselineUpdated: args.updateBaseline,
    }, null, 2));
    return;
  }

  console.log(renderEvaluationSummary(report));
  console.log('');
  console.log(`- indexPath: ${indexPath}`);
  console.log(`- baselinePath: ${baselinePath}`);
  console.log(`- baselineUpdated: ${args.updateBaseline ? 'yes' : 'no'}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
