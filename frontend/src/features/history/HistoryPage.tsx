import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { EmptyState } from '../../components/ui/EmptyState'
import { getActionTypeLabel, getTrainingFocus, getValidBaselineItem } from '../../components/result-views/insights'
import { formatTime } from '../../components/result-views/utils'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'

function formatDay(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('zh-CN')
}

export function HistoryPage() {
  const navigate = useNavigate()
  const {
    actionType,
    setActionType,
    history,
    selectedCompareTaskId,
    selectedHistoryReport,
    fetchHistoryReport,
    applyCustomComparison,
    analyzeHistoryTrend,
  } = useAnalysisTask()
  const [detailOpen, setDetailOpen] = useState(false)

  const currentBaseline = getValidBaselineItem(history, selectedCompareTaskId)
  const isViewingBaseline = currentBaseline?.taskId === selectedHistoryReport?.taskId
  const canOpenCurrentComparison = Boolean(currentBaseline)
  const selectedFocus = selectedHistoryReport ? getTrainingFocus(selectedHistoryReport) : null

  function handleSelectAction(nextActionType: 'clear' | 'smash') {
    setDetailOpen(false)
    setActionType(nextActionType)
  }

  async function openDetail(taskId: string) {
    const detail = await fetchHistoryReport(taskId)
    if (detail) setDetailOpen(true)
  }

  async function handleUseAsBaseline(taskId: string) {
    const comparison = await applyCustomComparison(taskId)
    if (comparison) {
      setDetailOpen(false)
      navigate('/compare')
    }
  }

  function handleViewCurrentComparison() {
    setDetailOpen(false)
    navigate('/compare')
  }

  if (history.length === 0) {
    return (
      <EmptyState
        badge="空状态"
        title="你还没有可回看的分析记录"
        description="完成第一次分析后，历史记录会出现在这里，后续就能用来做同动作复测对比。"
        primary={{ label: '开始第一次分析', to: '/guide' }}
        secondary={{ label: '返回首页', to: '/' }}
      />
    )
  }

  return (
    <>
      <div className="page-stack">
        <section className="surface-card">
          <div className="section-head">
            <h2>按动作查看历史</h2>
          </div>
          <div className="pill-row">
            <button className={`choice-pill ${actionType === 'clear' ? 'active' : ''}`} onClick={() => handleSelectAction('clear')} type="button">
              正手高远球
            </button>
            <button className={`choice-pill ${actionType === 'smash' ? 'active' : ''}`} onClick={() => handleSelectAction('smash')} type="button">
              杀球
            </button>
          </div>
        </section>

        <section className="surface-card">
          <span className="eyebrow-copy">继续复测的意义</span>
          <h2>{getActionTypeLabel(actionType)}历史样本</h2>
          <div className="summary-inline-grid">
            <div className="key-point-panel">
              <span>同动作历史</span>
              <strong>已有 {history.length} 条可对比样本</strong>
              <p>每次复测都不是重新开始，而是在验证当前训练方向有没有真的起作用。</p>
            </div>
            <div className="key-point-panel">
              <span>最近趋势</span>
              <strong>{canOpenCurrentComparison ? '当前已设好复测基线' : '还没有手动切换基线'}</strong>
              <p>{analyzeHistoryTrend()}</p>
            </div>
          </div>
        </section>

        <section className="surface-card">
          <div className="section-head">
            <div>
              <h2>历史列表</h2>
              <p className="muted-copy">先点开一条看懂那次结论，再决定要不要把它设成当前对比基线。</p>
            </div>
          </div>
          <div className="history-list">
            {history.map((item) => {
              const isBaseline = currentBaseline?.taskId === item.taskId
              const isActive = selectedHistoryReport?.taskId === item.taskId && detailOpen

              return (
                <button
                  key={item.taskId}
                  className={`history-card ${isBaseline ? 'baseline' : ''} ${isActive ? 'active' : ''}`}
                  onClick={() => void openDetail(item.taskId)}
                  type="button"
                >
                  <div>
                    <div className="history-card-tags">
                      <span className="status-pill neutral">{formatDay(item.createdAt)}</span>
                      {isBaseline ? <span className="status-pill brand">当前基线</span> : null}
                      {isActive ? <span className="status-pill progress">正在查看</span> : null}
                    </div>
                    <strong>{`${getActionTypeLabel(item.actionType)} · ${item.totalScore ?? '—'} 分`}</strong>
                    <p>{item.summaryText ?? '已完成分析，可打开查看详情。'}</p>
                  </div>
                  <span>{formatTime(item.createdAt)}</span>
                </button>
              )
            })}
          </div>
        </section>

        <div className="action-stack">
          {canOpenCurrentComparison ? <Link className="primary-action" to="/compare">查看当前对比</Link> : null}
          <Link className="secondary-action" to="/upload">开始新的分析</Link>
        </div>
      </div>

      <BottomSheet open={detailOpen && Boolean(selectedHistoryReport)} onClose={() => setDetailOpen(false)} title="历史样本详情">
        {selectedHistoryReport && selectedFocus ? (
          <div className="sheet-stack">
            <div className="surface-card inset">
              <span className="eyebrow-copy">先看懂那次结果</span>
              <strong>{selectedHistoryReport.summaryText ?? '这次样本暂无摘要'}</strong>
              <p>{selectedFocus.primaryDescription}</p>
              <div className="info-list compact">
                <div className="list-row">
                  <span>那次最核心的问题</span>
                  <strong>{selectedFocus.primaryTitle}</strong>
                  <p>{selectedFocus.impact}</p>
                </div>
                <div className="list-row">
                  <span>那次练完后应该继续看</span>
                  <strong>{selectedFocus.actionTitle}</strong>
                  <p>{selectedFocus.actionDescription}</p>
                </div>
              </div>
            </div>

            <div className="surface-card inset baseline-status-card">
              <span className="eyebrow-copy">当前对比基线状态</span>
              <strong>{isViewingBaseline ? '这条样本就是你现在的对比基线' : '要不要把这条设成当前对比基线'}</strong>
              <p>
                {isViewingBaseline
                  ? '当前复测结论正在拿这条历史样本做参照，你可以直接去看当前对比。'
                  : currentBaseline
                    ? `你现在的基线是 ${formatTime(currentBaseline.createdAt)} · ${currentBaseline.totalScore ?? '—'} 分。想换成这条的话，直接切过去就行。`
                    : '当前还没有手动切换过基线。把这条设为基线后，系统会立刻按它生成当前对比。'}
              </p>

              <div className="action-stack">
                {isViewingBaseline ? (
                  <button className="primary-action button-reset" onClick={handleViewCurrentComparison} type="button">
                    查看当前对比
                  </button>
                ) : (
                  <button
                    className="primary-action button-reset"
                    onClick={() => void handleUseAsBaseline(selectedHistoryReport.taskId)}
                    type="button"
                  >
                    设为当前基线并查看对比
                  </button>
                )}
              </div>
            </div>

            {selectedHistoryReport.standardComparison ? (
              <div className="surface-card inset">
                <span className="eyebrow-copy">那次和标准动作差在哪</span>
                <strong>{selectedHistoryReport.standardComparison.summaryText}</strong>
                <div className="info-list compact">
                  {selectedHistoryReport.standardComparison.differences.slice(0, 2).map((item) => (
                    <div key={item} className="list-row">
                      <span>标准差异</span>
                      <strong>{item}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedHistoryReport.suggestions.length > 1 ? (
              <div className="surface-card inset">
                <span className="eyebrow-copy">练稳后还可以继续看</span>
                <div className="info-list compact">
                  {selectedHistoryReport.suggestions.slice(1).map((item) => (
                    <div key={item.title} className="list-row">
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </BottomSheet>
    </>
  )
}
