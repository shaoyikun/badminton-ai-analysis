import { useMemo } from 'react'
import { BottomSheet } from '../ui/BottomSheet'
import { StatusPill } from '../ui/StatusPill'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import { PoseSummaryCard } from '../result-views/shared'
import { buildAssetUrl } from '../result-views/utils'

export function DebugDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    taskId,
    latestCompletedTaskId,
    status,
    preprocessStatus,
    poseStatus,
    errorState,
    selectedCompareTaskId,
    log,
    report,
    poseResult,
    isBusy,
    isPolling,
    refreshStatus,
    fetchResult,
    analyze,
  } = useAnalysisTask()

  const statusTone = useMemo(() => {
    if (status === 'completed') return 'success'
    if (status === 'processing') return 'progress'
    if (status === 'failed') return 'danger'
    if (status === 'uploaded' || status === 'created') return 'brand'
    return 'neutral'
  }, [status])

  return (
    <BottomSheet open={open} title="联调面板" onClose={onClose}>
      <section className="debug-section">
        <div className="debug-summary-grid">
          <div className="debug-kv"><span>Task ID</span><strong>{taskId || '未创建'}</strong></div>
          <div className="debug-kv"><span>最近完成</span><strong>{latestCompletedTaskId || '—'}</strong></div>
          <div className="debug-kv"><span>主状态</span><StatusPill label={status || 'idle'} tone={statusTone} /></div>
          <div className="debug-kv"><span>预处理</span><strong>{preprocessStatus}</strong></div>
          <div className="debug-kv"><span>Pose</span><strong>{poseStatus}</strong></div>
          <div className="debug-kv"><span>对比基线</span><strong>{selectedCompareTaskId || '—'}</strong></div>
        </div>
        {errorState ? (
          <div className="inline-error compact">
            <strong>{errorState.title}</strong>
            <p>{errorState.summary}</p>
          </div>
        ) : null}
        <div className="inline-actions two-up">
          <button className="ghost-action" onClick={() => void refreshStatus()} disabled={!taskId || isBusy} type="button">
            手动查状态
          </button>
          <button className="ghost-action" onClick={() => void fetchResult()} disabled={!taskId || isBusy} type="button">
            手动取结果
          </button>
          <button className="ghost-action" onClick={() => void analyze()} disabled={status !== 'uploaded' || isBusy || isPolling} type="button">
            再次启动分析
          </button>
        </div>
      </section>

      <section className="debug-section">
        <strong className="section-caption">原始日志</strong>
        <div className="debug-log">
          {log.length === 0 ? <p className="muted-copy">还没有联调日志。</p> : log.map((item) => <div key={item} className="debug-log-item">{item}</div>)}
        </div>
      </section>

      {poseResult ? (
        <section className="debug-section">
          <strong className="section-caption">姿态摘要</strong>
          <PoseSummaryCard poseResult={poseResult} />
        </section>
      ) : null}

      {report?.preprocess?.artifacts?.sampledFrames?.length ? (
        <section className="debug-section">
          <strong className="section-caption">关键帧调试视图</strong>
          <div className="frame-grid">
            {report.preprocess.artifacts.sampledFrames.map((frame) => (
              <div key={frame.fileName} className="frame-card">
                <img src={buildAssetUrl(frame.relativePath)} alt={`关键帧 ${frame.index}`} />
                <div className="frame-meta">
                  <strong>帧 {frame.index}</strong>
                  <span>{frame.timestampSeconds}s</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </BottomSheet>
  )
}
