type TaskRunner<T> = () => Promise<T>;

class InProcessSemaphore {
  private readonly maxConcurrency: number;

  private activeCount = 0;

  private readonly queue: Array<() => void> = [];

  constructor(maxConcurrency: number) {
    this.maxConcurrency = Math.max(1, maxConcurrency);
  }

  async run<T>(task: TaskRunner<T>) {
    if (this.activeCount >= this.maxConcurrency) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.activeCount += 1;
    try {
      return await task();
    } finally {
      this.activeCount -= 1;
      this.queue.shift()?.();
    }
  }

  getSnapshot() {
    return {
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
      maxConcurrency: this.maxConcurrency,
    };
  }
}

function getConfiguredAnalysisConcurrency() {
  const configured = Number(process.env.ANALYSIS_SERVICE_MAX_CONCURRENCY ?? 2);
  if (!Number.isFinite(configured) || configured < 1) {
    return 2;
  }
  return Math.round(configured);
}

let semaphore = new InProcessSemaphore(getConfiguredAnalysisConcurrency());

export async function runWithAnalysisServiceLimit<T>(task: TaskRunner<T>) {
  return semaphore.run(task);
}

export function getAnalysisServiceConcurrencySnapshotForTests() {
  return semaphore.getSnapshot();
}

export function setAnalysisServiceConcurrencyForTests(maxConcurrency?: number) {
  semaphore = new InProcessSemaphore(maxConcurrency ?? getConfiguredAnalysisConcurrency());
}
