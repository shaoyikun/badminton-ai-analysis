import { useState } from 'react'
import './App.css'

type TaskStatus = 'created' | 'uploaded' | 'processing' | 'completed' | 'failed'

type ReportResult = {
  taskId: string
  actionType: string
  totalScore: number
  dimensionScores: { name: string; score: number }[]
  issues: { title: string; description: string; impact: string }[]
  suggestions: { title: string; description: string }[]
  retestAdvice: string
}

const API_BASE = 'http://127.0.0.1:8787'

function App() {
  const [actionType, setActionType] = useState('clear')
  const [taskId, setTaskId] = useState('')
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [report, setReport] = useState<ReportResult | null>(null)
  const [log, setLog] = useState<string[]>([])

  const appendLog = (text: string) => setLog((prev) => [text, ...prev])

  async function createTask() {
    const res = await fetch(`${API_BASE}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionType }),
    })
    const data = await res.json()
    setTaskId(data.taskId)
    setStatus(data.status)
    appendLog(`任务已创建：${data.taskId}`)
  }

  async function uploadMockVideo() {
    if (!taskId) return appendLog('请先创建任务')
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'demo.mov', contentBase64: btoa('demo') }),
    })
    const data = await res.json()
    setStatus(data.status)
    appendLog(`上传完成：${data.fileName}`)
  }

  async function analyze() {
    if (!taskId) return appendLog('请先创建任务')
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}/analyze`, { method: 'POST' })
    const data = await res.json()
    setStatus(data.status)
    appendLog('已启动分析')
  }

  async function refreshStatus() {
    if (!taskId) return appendLog('请先创建任务')
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}`)
    const data = await res.json()
    setStatus(data.status)
    appendLog(`当前状态：${data.status}`)
  }

  async function fetchResult() {
    if (!taskId) return appendLog('请先创建任务')
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}/result`)
    const data = await res.json()
    if (!res.ok) {
      appendLog(`结果未就绪：${data.error}`)
      return
    }
    setReport(data)
    appendLog('已获取分析结果')
  }

  return (
    <div className="app">
      <div className="container">
        <h1>Badminton AI PoC</h1>
        <p className="subtitle">React 前端 + Fastify 后端的最小可运行 PoC。当前结果为 mock 分析结果。</p>

        <section className="panel">
          <h2>1. 创建任务</h2>
          <div className="row">
            <select value={actionType} onChange={(e) => setActionType(e.target.value)}>
              <option value="clear">正手高远球</option>
              <option value="smash">杀球</option>
            </select>
            <button onClick={createTask}>创建任务</button>
          </div>
          <p>Task ID：{taskId || '未创建'}</p>
          <p>Status：{status || '未开始'}</p>
        </section>

        <section className="panel">
          <h2>2. 执行流程</h2>
          <div className="actions">
            <button onClick={uploadMockVideo}>上传 mock 视频</button>
            <button onClick={analyze}>启动分析</button>
            <button onClick={refreshStatus}>查询状态</button>
            <button onClick={fetchResult}>获取结果</button>
          </div>
        </section>

        <section className="panel">
          <h2>3. 分析结果</h2>
          {!report ? (
            <p className="muted">还没有结果，先走完上面的流程。</p>
          ) : (
            <div>
              <p><strong>动作类型：</strong>{report.actionType}</p>
              <p><strong>总分：</strong>{report.totalScore}</p>
              <div>
                <strong>维度分数：</strong>
                <ul>
                  {report.dimensionScores.map((item) => (
                    <li key={item.name}>{item.name}：{item.score}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>问题：</strong>
                <ul>
                  {report.issues.map((item) => (
                    <li key={item.title}>{item.title}：{item.impact}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>建议：</strong>
                <ul>
                  {report.suggestions.map((item) => (
                    <li key={item.title}>{item.title}：{item.description}</li>
                  ))}
                </ul>
              </div>
              <p><strong>复测建议：</strong>{report.retestAdvice}</p>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>4. 操作日志</h2>
          <div className="log">
            {log.length === 0 ? <p className="muted">还没有操作记录。</p> : log.map((item, idx) => <div key={idx}>{item}</div>)}
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
