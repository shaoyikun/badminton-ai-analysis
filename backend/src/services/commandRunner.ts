import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;

type CommandRunnerOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  stage?: string;
};

type ExecFileError = Error & {
  code?: string | number;
  signal?: NodeJS.Signals;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
};

function summarizeOutput(raw?: string) {
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function describeCommand(command: string, args: string[]) {
  return [command, ...args].join(' ');
}

export class CommandExecutionError extends Error {
  readonly command: string;
  readonly args: string[];
  readonly stage?: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode?: string | number;
  readonly signal?: NodeJS.Signals;
  readonly timedOut: boolean;
  readonly failureKind: 'timeout' | 'invalid_json' | 'non_zero_exit' | 'spawn_error';

  constructor(params: {
    command: string;
    args: string[];
    stage?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: string | number;
    signal?: NodeJS.Signals;
    timedOut?: boolean;
    failureKind?: 'timeout' | 'invalid_json' | 'non_zero_exit' | 'spawn_error';
    message?: string;
  }) {
    const summary = summarizeOutput(params.stderr) || summarizeOutput(params.stdout) || 'no diagnostic output';
    super(
      params.message
      ?? `${params.stage ?? 'command'} failed for "${describeCommand(params.command, params.args)}": ${summary}`,
    );
    this.name = 'CommandExecutionError';
    this.command = params.command;
    this.args = params.args;
    this.stage = params.stage;
    this.stdout = params.stdout?.trim() ?? '';
    this.stderr = params.stderr?.trim() ?? '';
    this.exitCode = params.exitCode;
    this.signal = params.signal;
    this.timedOut = Boolean(params.timedOut);
    this.failureKind = params.failureKind ?? (params.timedOut ? 'timeout' : params.exitCode !== undefined ? 'non_zero_exit' : 'spawn_error');
  }
}

export async function runCommand(command: string, args: string[], options: CommandRunnerOptions = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: 'utf8',
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: DEFAULT_MAX_BUFFER_BYTES,
    });

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const execError = error as ExecFileError;
    throw new CommandExecutionError({
      command,
      args,
      stage: options.stage,
      stdout: execError.stdout,
      stderr: execError.stderr,
      exitCode: execError.code,
      signal: execError.signal,
      timedOut: execError.killed,
      failureKind: execError.killed ? 'timeout' : execError.code !== undefined ? 'non_zero_exit' : 'spawn_error',
      message: execError.killed
        ? `${options.stage ?? 'command'} timed out for "${describeCommand(command, args)}": ${summarizeOutput(execError.stderr) || 'process exceeded timeout'}`
        : undefined,
    });
  }
}

export async function runJsonCommand<T>(command: string, args: string[], options: CommandRunnerOptions = {}) {
  const { stdout, stderr } = await runCommand(command, args, options);

  try {
    return JSON.parse(stdout) as T;
  } catch (error) {
    throw new CommandExecutionError({
      command,
      args,
      stage: options.stage,
      stdout,
      stderr,
      failureKind: 'invalid_json',
      message: `${options.stage ?? 'command'} returned invalid JSON: ${error instanceof Error ? error.message : 'failed to parse output'}`,
    });
  }
}
