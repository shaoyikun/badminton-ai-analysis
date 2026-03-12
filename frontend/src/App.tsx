import './App.css'
import { useCallback, useState } from 'react'
import { ErrorStateCard } from './components/ErrorStateCard'
import { ReportView } from './components/result-views/ReportView'
import { HistoryView } from './components/result-views/HistoryView'
import { RetestView } from './components/result-views/RetestView'
import {
  POSE_LABELS,
  PREPROCESS_LABELS,
  STATUS_LABELS,
  type PreprocessStatus,
  type TaskStatus,
  useAnalysisTask,
} from './hooks/useAnalysisTask'

function App() {
  const [resultView, setResultView] = useState<'report' | 'history' | 'retest'>('report')

  const {
    actionType,
    setActionType,
    taskId,
    status,
    preprocessStatus,
    poseStatus,
    report,
    poseResult,
    history,
    comparison,
    selectedCompareTaskId,
    selectedHistoryReport,
    file,
    setFile,
    log,
    isBusy,
    isPolling,
    errorState,
    canUpload,
    canAnalyze,
    canFetchResult,
    selectedActionLabel,
    createTask,
    uploadVideo,
    analyze,
    refreshStatus,
    fetchResult,
    fetchHistoryReport,
    applyCustomComparison,
  } = useAnalysisTask()

  const handleUseHistoryAsComparisonBaseline = useCallback(async (historyTaskId: string) => {
    await applyCustomComparison(historyTaskId)
    setResultView('retest')
  }, [applyCustomComparison])

  return (
    <div className="app">
      <div className="phone-shell">
        <div className="phone-status-bar">
          <span>Badminton AI PoC</span>
          <span>{isPolling ? '自动轮询中' : '本地联调'}</span>
        </div>

        <div className="screen">
          <header className="hero-card">
            <p className="eyebrow">羽毛球动作分析 · React H5 PoC</p>
            <h1>上传视频后，自动跑完整条分析链路</h1>
            <p className="subtitle">
              现在主流程已经收口成：创建任务 → 上传视频 → 预处理 → 启动分析 → 自动轮询 → 自动展示结果。
            </p>
          </header>

          <section className="panel">
            <div className="panel-header">
              <h2>1. 创建任务</h2>
              <span className={`status-pill ${status || 'idle'}`}>{status ? STATUS_LABELS[status as TaskStatus] : '未开始'}</span>
            </div>

            <label className="field-label">动作类型</label>
            <select value={actionType} onChange={(e) => setActionType(e.target.value)} disabled={isBusy || isPolling}>
              <option value="clear">正手高远球</option>
              <option value="smash">杀球</option>
            </select>

            <button className="primary-button" onClick={createTask} disabled={isBusy || isPolling}>
              {taskId ? '重新创建任务' : '创建任务'}
            </button>

            <div className="meta-card">
              <div>
                <span className="meta-label">Task ID</span>
                <strong>{taskId || '未创建'}</strong>
              </div>
              <div>
                <span className="meta-label">当前动作</span>
                <strong>{selectedActionLabel}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>2. 上传视频</h2>
              <span className="panel-tip">支持本地真实文件</span>
            </div>

            <label className="upload-box">
              <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={isBusy || isPolling} />
              <span className="upload-title">{file ? file.name : '点击选择视频文件'}</span>
              <span className="upload-subtitle">建议先用 5~15 秒、单人、固定机位视频做联调验证</span>
            </label>

            <div className="button-group">
              <button className="primary-button" onClick={uploadVideo} disabled={!canUpload || isBusy || isPolling}>
                上传视频
              </button>
              <button className="primary-button secondary" onClick={analyze} disabled={!canAnalyze || isBusy || isPolling}>
                启动分析
              </button>
            </div>

            <div className="button-group compact">
              <button className="ghost-button" onClick={() => refreshStatus()} disabled={!taskId || isBusy}>
                手动查状态
              </button>
              <button className="ghost-button" onClick={() => fetchResult()} disabled={!canFetchResult || isBusy}>
                手动取结果
              </button>
            </div>

            <div className="preprocess-strip">
              <span className={`status-pill ${preprocessStatus}`}>{PREPROCESS_LABELS[preprocessStatus as PreprocessStatus]}</span>
              <span className={`status-pill ${poseStatus}`}>{POSE_LABELS[poseStatus]}</span>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>3. 分析结果</h2>
              <span className="panel-tip">完成后自动展示</span>
            </div>

            <ErrorStateCard errorState={errorState} />

            {!report ? (
              <div className="empty-state">
                <strong>{isPolling ? '系统正在自动轮询状态…' : '还没有结果'}</strong>
                <p>{isPolling ? '分析完成后会自动拉取结果，不用手动刷新。' : '先完成创建、上传、启动分析这三步。'}</p>
              </div>
            ) : (
              <div className="result-stack">
                <div className="result-view-tabs">
                  <button className={`result-view-tab ${resultView === 'report' ? 'active' : ''}`} onClick={() => setResultView('report')}>诊断结果</button>
                  <button className={`result-view-tab ${resultView === 'history' ? 'active' : ''}`} onClick={() => setResultView('history')}>历史记录</button>
                  <button className={`result-view-tab ${resultView === 'retest' ? 'active' : ''}`} onClick={() => setResultView('retest')}>复测对比</button>
                </div>

                {resultView === 'report' ? <ReportView report={report} poseResult={poseResult} /> : null}
                {resultView === 'history' ? (
                  <HistoryView
                    report={report}
                    history={history}
                    selectedCompareTaskId={selectedCompareTaskId}
                    selectedHistoryReport={selectedHistoryReport}
                    onSelectCompare={applyCustomComparison}
                    onOpenHistoryDetail={fetchHistoryReport}
                    onUseAsComparisonBaseline={handleUseHistoryAsComparisonBaseline}
                    disabled={isBusy || isPolling || !taskId}
                  />
                ) : null}
                {resultView === 'retest' ? <RetestView report={report} poseResult={poseResult} comparison={comparison} /> : null}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>4. 操作日志</h2>
              <span className="panel-tip">方便联调</span>
            </div>

            <div className="log">
              {log.length === 0 ? <p className="muted">还没有操作记录。</p> : log.map((item, idx) => <div key={idx} className="log-item">{item}</div>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default App
