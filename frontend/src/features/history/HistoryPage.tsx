import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'

function formatTime(value?: string) {
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
            <button className={`choice-pill ${actionType === 'clear' ? 'active' : ''}`} onClick={() => setActionType('clear')} type="button">
              正手高远球
            </button>
            <button className={`choice-pill ${actionType === 'smash' ? 'active' : ''}`} onClick={() => setActionType('smash')} type="button">
              杀球
            </button>
          </div>
        </section>

        <section className="surface-card">
          <div className="section-head">
            <h2>{actionType === 'smash' ? '杀球' : '正手高远球'}历史样本</h2>
          </div>
          <div className="info-list compact">
            <div className="list-row">已有 {history.length} 条同动作可对比样本</div>
            <div className="list-row">{analyzeHistoryTrend()}</div>
          </div>
        </section>

        <section className="surface-card">
          <div className="section-head">
            <h2>历史列表</h2>
          </div>
          <div className="history-list">
            {history.map((item) => (
              <button key={item.taskId} className="history-card" onClick={() => void openDetail(item.taskId)} type="button">
                <div>
                  <strong>{formatTime(item.createdAt)} · {item.actionType === 'smash' ? '杀球' : '正手高远球'}</strong>
                  <p>{item.summaryText ?? '已完成分析，可打开查看详情。'}</p>
                </div>
                <span>{item.totalScore ?? '—'} 分</span>
              </button>
            ))}
          </div>
        </section>

        <div className="action-stack">
          {selectedCompareTaskId ? <Link className="primary-action" to="/compare">查看当前对比</Link> : null}
          <Link className="secondary-action" to="/upload">开始新的分析</Link>
        </div>
      </div>

      <BottomSheet open={detailOpen && Boolean(selectedHistoryReport)} onClose={() => setDetailOpen(false)} title="历史样本详情">
        {selectedHistoryReport ? (
          <div className="sheet-stack">
            <div className="surface-card inset">
              <span className="eyebrow-copy">样本摘要</span>
              <strong>{selectedHistoryReport.summaryText ?? '这次样本暂无摘要'}</strong>
              <p>{selectedHistoryReport.issues[0]?.impact ?? '这次样本暂无额外影响说明。'}</p>
            </div>

            <div className="surface-card inset">
              <span className="eyebrow-copy">那次之后该继续看什么</span>
              <div className="info-list compact">
                {selectedHistoryReport.suggestions.map((item) => (
                  <div key={item.title} className="list-row">
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="action-stack">
              <button
                className="primary-action button-reset"
                onClick={() => void handleUseAsBaseline(selectedHistoryReport.taskId)}
                type="button"
              >
                {selectedCompareTaskId === selectedHistoryReport.taskId ? '当前已作为对比基线' : '设为当前对比基线'}
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </>
  )
}
