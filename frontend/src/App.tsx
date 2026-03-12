import './App.css'
import { ErrorStateCard } from './components/ErrorStateCard'
import {
  API_BASE,
  POSE_LABELS,
  PREPROCESS_LABELS,
  STATUS_LABELS,
  type PoseResult,
  type PreprocessStatus,
  type TaskStatus,
  type TaskHistoryItem,
  useAnalysisTask,
} from './hooks/useAnalysisTask'

function formatFileSize(size?: number) {
  if (!size) return '—'
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function formatScore(value?: number | null) {
  if (value === null || value === undefined) return '—'
  return value.toFixed(2)
}

function formatTime(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function buildAssetUrl(relativePath?: string) {
  if (!relativePath) return ''
  return `${API_BASE}/${relativePath}`
}

function buildReferenceUrl(relativePath?: string) {
  if (!relativePath) return ''
  return `${relativePath}`
}

function PoseSummaryCard({ poseResult }: { poseResult: PoseResult | null }) {
  if (!poseResult) return null

  return (
    <div className="result-card pose-summary-card">
      <h3>姿态摘要</h3>
      <p>{poseResult.summary.humanSummary}</p>
      <div className="pose-metrics-grid">
        <div className="pose-metric-item"><span>识别引擎</span><strong>{poseResult.engine}</strong></div>
        <div className="pose-metric-item"><span>命中帧数</span><strong>{poseResult.detectedFrameCount} / {poseResult.frameCount}</strong></div>
        <div className="pose-metric-item"><span>最佳帧</span><strong>{poseResult.summary.bestFrameIndex ?? '—'}</strong></div>
        <div className="pose-metric-item"><span>稳定度均值</span><strong>{formatScore(poseResult.summary.avgStabilityScore)}</strong></div>
        <div className="pose-metric-item"><span>侧身展开</span><strong>{formatScore(poseResult.summary.avgBodyTurnScore)}</strong></div>
        <div className="pose-metric-item"><span>挥拍臂抬举</span><strong>{formatScore(poseResult.summary.avgRacketArmLiftScore)}</strong></div>
      </div>
    </div>
  )
}

function PrimaryIssueCard({ report }: { report: NonNullable<ReturnType<typeof useAnalysisTask>['report']> }) {
  const primaryIssue = report.issues[0]

  if (!primaryIssue) return null

  return (
    <div className="primary-issue-card">
      <span className="meta-label">这次最该先看的问题</span>
      <strong>{primaryIssue.title}</strong>
      <p>{primaryIssue.description}</p>
      <div className="primary-issue-impact">
        <span>为什么这件事要先改</span>
        <p>{primaryIssue.impact}</p>
      </div>
    </div>
  )
}

function StandardComparisonCard({ report }: { report: NonNullable<ReturnType<typeof useAnalysisTask>['report']> }) {
  if (!report.standardComparison) return null

  const bestFrameIndex = report.scoringEvidence?.bestFrameIndex
  const bestFrame = report.preprocess?.artifacts?.sampledFrames?.find((item) => item.index === bestFrameIndex)
    ?? report.preprocess?.artifacts?.sampledFrames?.[0]

  return (
    <div className="result-card standard-review-card">
      <div className="panel-header standard-review-header">
        <div>
          <h3>{report.standardComparison.sectionTitle}</h3>
          <p className="standard-review-subtitle">这一块不只是看像不像，而是看当前动作离目标动作还差在哪。</p>
        </div>
      </div>

      <div className="coach-review-card standard-summary-card">
        <strong>教练会先看什么</strong>
        <p>{report.standardComparison.summaryText}</p>
      </div>

      <div className="standard-compare-grid">
        <div className="standard-frame-placeholder">
          <span className="frame-badge">你的当前样本</span>
          {bestFrame?.relativePath ? <img src={buildAssetUrl(bestFrame.relativePath)} alt={report.standardComparison.currentFrameLabel} /> : <div className="placeholder-box">当前样本</div>}
          <strong>{report.standardComparison.currentFrameLabel}</strong>
          {bestFrame ? <span>{`选取帧 ${bestFrame.index} · ${bestFrame.timestampSeconds}s`}</span> : <span>当前还没有可展示的最佳关键帧</span>}
        </div>
        <div className="standard-frame-placeholder">
          <span className="frame-badge">目标参考动作</span>
          {report.standardComparison.standardReference.imagePath ? (
            <img src={buildReferenceUrl(report.standardComparison.standardReference.imagePath)} alt={report.standardComparison.standardFrameLabel} />
          ) : (
            <div className="placeholder-box">标准动作参考</div>
          )}
          <strong>{report.standardComparison.standardFrameLabel}</strong>
          <span>{report.standardComparison.standardReference.cue}</span>
          <span>{report.standardComparison.standardReference.sourceType === 'real-sample' ? '参考素材：真人关键帧' : '参考素材：结构示意图'}</span>
        </div>
      </div>

      {report.standardComparison.phaseFrames?.length ? (
        <div className="standard-phase-section">
          <strong>标准动作拆开看</strong>
          <div className="standard-phase-grid">
            {report.standardComparison.phaseFrames.map((item) => (
              <div key={item.phase} className="standard-phase-card">
                <img src={buildReferenceUrl(item.imagePath)} alt={item.title} />
                <strong>{item.phase}</strong>
                <span>{item.cue}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="comparison-block standard-difference-block">
        <strong>这次最该先改的地方</strong>
        <ul>
          {report.standardComparison.differences.map((item, index) => (
            <li key={item}>
              <span>{`观察点 ${index + 1}`}</span>
              <strong>{item}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function HistoryCard({
  history,
  selectedCompareTaskId,
  onSelectCompare,
  disabled,
}: {
  history: TaskHistoryItem[]
  selectedCompareTaskId: string
  onSelectCompare: (taskId: string) => void
  disabled?: boolean
}) {
  return (
    <div className="result-card">
      <h3>同动作历史记录</h3>
      {history.length === 0 ? (
        <p>还没有可用的历史记录，先完成第一条样本分析。</p>
      ) : (
        <>
          <div className="compare-selector">
            <label>选择一个历史样本做对比</label>
            <select value={selectedCompareTaskId} onChange={(e) => onSelectCompare(e.target.value)} disabled={disabled}>
              <option value="">请选择历史样本</option>
              {history.slice(0, 10).map((item) => (
                <option key={item.taskId} value={item.taskId}>
                  {formatTime(item.createdAt)} · {item.totalScore ?? '—'} 分
                </option>
              ))}
            </select>
          </div>
          <ul>
            {history.slice(0, 5).map((item) => (
              <li key={item.taskId}>
                <span>{formatTime(item.createdAt)}</span>
                <strong>{item.totalScore ?? '—'} 分</strong>
                <p>{item.summaryText ?? `${item.actionType} 已完成分析`}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ComparisonCard({
  comparison,
}: {
  comparison: ReturnType<typeof useAnalysisTask>['comparison']
}) {
  if (!comparison) {
    return (
      <div className="result-card">
        <h3>复测对比</h3>
        <p>当前还没有可对比的同动作样本。等你再录一条，或者从历史记录里手动选一条样本后，就能看到变化结论。</p>
      </div>
    )
  }

  const trendLabel = comparison.totalScoreDelta > 0 ? '这次整体在变好' : comparison.totalScoreDelta < 0 ? '这次有一点回落' : '这次整体基本持平'
  const topImprovement = comparison.improvedDimensions[0]
  const topRegression = comparison.declinedDimensions[0]

  return (
    <div className="result-card comparison-summary-card">
      <h3>复测对比</h3>
      <div className="comparison-headline-card">
        <span className="meta-label">先看结论</span>
        <strong>{trendLabel}</strong>
        <p>{comparison.coachReview.headline}</p>
      </div>

      <div className="comparison-key-points">
        <div className="comparison-point-card">
          <span>这次最明显的变化</span>
          <strong>{topImprovement ? `${topImprovement.name} 在变好` : '暂时没有明显单项提升'}</strong>
          <p>{comparison.coachReview.progressNote}</p>
        </div>
        <div className="comparison-point-card">
          <span>这次最该防止继续掉的点</span>
          <strong>{topRegression ? topRegression.name : '当前没有明显回落项'}</strong>
          <p>{comparison.coachReview.regressionNote ?? comparison.coachReview.keepDoing ?? '这次没有明显回落项，先把已经稳定住的部分继续保住。'}</p>
        </div>
      </div>

      <div className="coach-review-card">
        <strong>下次复测只先盯这个</strong>
        <p>{comparison.coachReview.nextFocus}</p>
        <p>{comparison.coachReview.nextCheck}</p>
      </div>

      <div className="comparison-meta-strip">
        <div>
          <span>对比样本</span>
          <strong>{formatTime(comparison.previousCreatedAt)}</strong>
        </div>
        <div>
          <span>当前样本</span>
          <strong>{formatTime(comparison.currentCreatedAt)}</strong>
        </div>
        <div>
          <span>参考分数变化</span>
          <strong>{comparison.totalScoreDelta > 0 ? `+${comparison.totalScoreDelta}` : comparison.totalScoreDelta}</strong>
        </div>
      </div>
    </div>
  )
}

function App() {
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
    applyCustomComparison,
  } = useAnalysisTask()

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
                <div className="score-card diagnostic-summary-card">
                  <span className="meta-label">本次诊断摘要</span>
                  <strong>{report.actionType === 'smash' ? '杀球动作' : '正手高远球'}</strong>
                  <p>{report.poseBased ? '当前结果已接入 pose 规则映射，下面优先看动作问题本身，不先看分数。' : '当前为模拟结构化报告，下面优先看动作问题本身，不先看分数。'}</p>
                  {report.summaryText ? <p>{report.summaryText}</p> : null}
                  <div className="summary-score-inline">
                    <span>参考分数</span>
                    <strong>{report.totalScore}</strong>
                  </div>
                </div>

                <PrimaryIssueCard report={report} />
                <ComparisonCard comparison={comparison} />
                <StandardComparisonCard report={report} />
                <HistoryCard
                  history={history}
                  selectedCompareTaskId={selectedCompareTaskId}
                  onSelectCompare={applyCustomComparison}
                  disabled={isBusy || isPolling || !taskId}
                />
                <PoseSummaryCard poseResult={poseResult} />

                {report.preprocess?.metadata ? (
                  <div className="result-card">
                    <h3>预处理摘要</h3>
                    <ul>
                      <li><span>文件名</span><strong>{report.preprocess.metadata.fileName}</strong></li>
                      <li><span>文件大小</span><strong>{formatFileSize(report.preprocess.metadata.fileSizeBytes)}</strong></li>
                      <li><span>视频时长</span><strong>{report.preprocess.metadata.durationSeconds ?? '—'} 秒</strong></li>
                      <li><span>估算帧数</span><strong>{report.preprocess.metadata.estimatedFrames ?? '—'}</strong></li>
                      <li><span>分辨率</span><strong>{report.preprocess.metadata.width} × {report.preprocess.metadata.height}</strong></li>
                      <li><span>元数据来源</span><strong>{report.preprocess.metadata.metadataSource ?? '—'}</strong></li>
                    </ul>
                  </div>
                ) : null}

                {report.preprocess?.artifacts?.framePlan ? (
                  <div className="result-card">
                    <h3>抽帧计划</h3>
                    <ul>
                      <li><span>策略</span><strong>{report.preprocess.artifacts.framePlan.strategy}</strong></li>
                      <li><span>目标帧数</span><strong>{report.preprocess.artifacts.framePlan.targetFrameCount}</strong></li>
                      <li><span>实际帧清单</span><strong>{report.preprocess.artifacts.sampledFrames?.length ?? 0} 个</strong></li>
                    </ul>
                  </div>
                ) : null}

                {report.preprocess?.artifacts?.sampledFrames?.length ? (
                  <div className="result-card">
                    <h3>关键帧调试视图</h3>
                    <div className="frame-grid">
                      {report.preprocess.artifacts.sampledFrames.map((frame) => {
                        const poseFrame = poseResult?.frames.find((item) => item.frameIndex === frame.index)
                        return (
                          <div key={frame.fileName} className="frame-card">
                            <img src={buildAssetUrl(frame.relativePath)} alt={`关键帧 ${frame.index}`} />
                            <div className="frame-meta">
                              <strong>帧 {frame.index}</strong>
                              <span>{frame.timestampSeconds}s</span>
                            </div>
                            {poseFrame?.metrics ? (
                              <div className="frame-metrics">
                                <span>{poseFrame.metrics.summaryText}</span>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="result-card">
                  <h3>维度分数</h3>
                  <ul>
                    {report.dimensionScores.map((item) => (
                      <li key={item.name}>
                        <span>{item.name}</span>
                        <strong>{item.score}</strong>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="result-card">
                  <h3>其余需要继续看的问题</h3>
                  <ul>
                    {report.issues.slice(1).length > 0 ? report.issues.slice(1).map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                        <span>{item.impact}</span>
                      </li>
                    )) : (
                      <li>
                        <strong>当前没有第二优先级问题</strong>
                        <p>这次报告里最值得先盯的是上面那一个核心问题，先别同时改太多点。</p>
                        <span>先把最大短板收住，再看其他维度是否被一起带上来。</span>
                      </li>
                    )}
                  </ul>
                </div>

                <div className="result-card">
                  <h3>训练建议</h3>
                  <ul>
                    {report.suggestions.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="retest-card">
                  <span className="meta-label">复测建议</span>
                  <p>{report.retestAdvice}</p>
                </div>
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
