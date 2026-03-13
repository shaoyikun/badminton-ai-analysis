import { BottomSheet } from '../ui/BottomSheet'
import { StatusPill } from '../ui/StatusPill'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'

export function DebugDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    actionType,
    taskId,
    latestCompletedTaskId,
    selectedCompareTaskId,
    segmentScan,
    selectedSegmentId,
    isBusy,
    errorState,
    log,
  } = useAnalysisTask()

  return (
    <BottomSheet open={open} onClose={onClose} title="联调面板">
      <div style={{ display: 'grid', gap: 16 }}>
        <section>
          <div style={{ display: 'grid', gap: 10 }}>
            <div><strong>当前动作：</strong>{actionType}</div>
            <div><strong>上传草稿 Task：</strong>{taskId || '未创建'}</div>
            <div><strong>最近完成 Task：</strong>{latestCompletedTaskId || '—'}</div>
            <div><strong>当前对比基线：</strong>{selectedCompareTaskId || '—'}</div>
            <div><strong>推荐片段：</strong>{segmentScan?.recommendedSegmentId || '—'}</div>
            <div><strong>当前分析片段：</strong>{selectedSegmentId || '—'}</div>
            <div>
              <strong>提交状态：</strong>{' '}
              <StatusPill label={isBusy ? '处理中' : '空闲'} tone={isBusy ? 'progress' : 'neutral'} />
            </div>
          </div>
        </section>

        {errorState ? (
          <section>
            <strong>当前错误</strong>
            <p>{errorState.title}</p>
            <p>{errorState.summary}</p>
          </section>
        ) : null}

        <section>
          <strong>最近日志</strong>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {log.length === 0 ? <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>还没有联调日志。</p> : null}
            {log.map((item) => (
              <div key={item} style={{ padding: 12, borderRadius: 12, background: 'rgba(20, 33, 61, 0.05)' }}>
                {item}
              </div>
            ))}
          </div>
        </section>
      </div>
    </BottomSheet>
  )
}
