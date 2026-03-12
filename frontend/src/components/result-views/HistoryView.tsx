import type { ReportResult, TaskHistoryItem } from '../../hooks/useAnalysisTask'
import { HistoryCard } from './shared'
import { formatFileSize } from './utils'

export function HistoryView({ report, history, selectedCompareTaskId, selectedHistoryReport, onSelectCompare, onOpenHistoryDetail, onUseAsComparisonBaseline, disabled }: { report: ReportResult; history: TaskHistoryItem[]; selectedCompareTaskId: string; selectedHistoryReport: ReportResult | null; onSelectCompare: (taskId: string) => void; onOpenHistoryDetail: (taskId: string) => void; onUseAsComparisonBaseline: (taskId: string) => void; disabled?: boolean }) {
  return (
    <>
      <HistoryCard history={history} selectedCompareTaskId={selectedCompareTaskId} onSelectCompare={onSelectCompare} onOpenHistoryDetail={onOpenHistoryDetail} disabled={disabled} />

      {selectedHistoryReport ? (
        <div className="result-card history-detail-card">
          <h3>历史样本详情</h3>
          <ul>
            <li><span>样本摘要</span><strong>{selectedHistoryReport.summaryText ?? '—'}</strong></li>
            <li><span>核心问题</span><strong>{selectedHistoryReport.issues[0]?.title ?? '—'}</strong></li>
            <li><span>参考分数</span><strong>{selectedHistoryReport.totalScore}</strong></li>
            <li><span>复测建议</span><strong>{selectedHistoryReport.retestAdvice}</strong></li>
          </ul>
          <p>{selectedHistoryReport.issues[0]?.impact ?? '这次历史样本暂无额外影响说明。'}</p>

          {selectedHistoryReport.standardComparison ? (
            <div className="history-detail-section">
              <strong>那次和标准动作差在哪</strong>
              <p>{selectedHistoryReport.standardComparison.summaryText}</p>
              <ul>
                {selectedHistoryReport.standardComparison.differences.slice(0, 2).map((item) => (
                  <li key={item}><span>标准差异</span><strong>{item}</strong></li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="history-detail-section">
            <strong>那次之后本来该继续看什么</strong>
            <ul>
              {selectedHistoryReport.suggestions.map((item) => (
                <li key={item.title}><span>{item.title}</span><strong>{item.description}</strong></li>
              ))}
            </ul>
          </div>

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
