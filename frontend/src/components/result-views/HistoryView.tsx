import type { ReportResult, TaskHistoryItem } from '../../hooks/useAnalysisTask'
import { formatFileSize, HistoryCard } from './shared'

export function HistoryView({ report, history, selectedCompareTaskId, selectedHistoryReport, onSelectCompare, onOpenHistoryDetail, onUseAsComparisonBaseline, disabled }: { report: ReportResult; history: TaskHistoryItem[]; selectedCompareTaskId: string; selectedHistoryReport: ReportResult | null; onSelectCompare: (taskId: string) => void; onOpenHistoryDetail: (taskId: string) => void; onUseAsComparisonBaseline: (taskId: string) => void; disabled?: boolean }) {
  return (
    <>
      <HistoryCard history={history} selectedCompareTaskId={selectedCompareTaskId} onSelectCompare={onSelectCompare} onOpenHistoryDetail={onOpenHistoryDetail} disabled={disabled} />

      {selectedHistoryReport ? (
        <div className="result-card">
          <h3>历史样本详情</h3>
          <ul>
            <li><span>样本摘要</span><strong>{selectedHistoryReport.summaryText ?? '—'}</strong></li>
            <li><span>核心问题</span><strong>{selectedHistoryReport.issues[0]?.title ?? '—'}</strong></li>
            <li><span>参考分数</span><strong>{selectedHistoryReport.totalScore}</strong></li>
            <li><span>复测建议</span><strong>{selectedHistoryReport.retestAdvice}</strong></li>
          </ul>
          <p>{selectedHistoryReport.issues[0]?.impact ?? '这次历史样本暂无额外影响说明。'}</p>
          <div className="button-group compact">
            <button className="primary-button secondary" onClick={() => onUseAsComparisonBaseline(selectedHistoryReport.taskId)} disabled={disabled || selectedCompareTaskId === selectedHistoryReport.taskId}>
              {selectedCompareTaskId === selectedHistoryReport.taskId ? '当前已作为对比基线' : '设为当前对比基线'}
            </button>
          </div>
        </div>
      ) : null}

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
