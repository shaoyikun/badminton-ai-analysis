import type { ReportResult, TaskHistoryItem } from '../../hooks/useAnalysisTask'
import { formatFileSize, HistoryCard } from './shared'

export function HistoryView({ report, history, selectedCompareTaskId, onSelectCompare, disabled }: { report: ReportResult; history: TaskHistoryItem[]; selectedCompareTaskId: string; onSelectCompare: (taskId: string) => void; disabled?: boolean }) {
  return (
    <>
      <HistoryCard history={history} selectedCompareTaskId={selectedCompareTaskId} onSelectCompare={onSelectCompare} disabled={disabled} />
      {report.preprocess?.metadata ? (
        <div className="result-card">
          <h3>本次样本摘要</h3>
          <ul>
            <li><span>文件名</span><strong>{report.preprocess.metadata.fileName}</strong></li>
            <li><span>文件大小</span><strong>{formatFileSize(report.preprocess.metadata.fileSizeBytes)}</strong></li>
            <li><span>视频时长</span><strong>{report.preprocess.metadata.durationSeconds ?? '—'} 秒</strong></li>
            <li><span>分辨率</span><strong>{report.preprocess.metadata.width} × {report.preprocess.metadata.height}</strong></li>
          </ul>
        </div>
      ) : null}
    </>
  )
}
