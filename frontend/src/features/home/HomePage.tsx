import { Link } from 'react-router-dom'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'

export function HomePage() {
  const { actionType, setActionType, selectedActionLabel, clearErrorState } = useAnalysisTask()

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <span className="badge">移动端首发</span>
        <h1>上传一段羽毛球视频，看懂这次最该先改什么</h1>
        <p>
          帮你看懂动作问题、知道它会影响什么，并在几天后复测验证有没有进步。
        </p>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>先选择这次要分析的动作</h2>
        </div>
        <div className="pill-row">
          <button
            className={`choice-pill ${actionType === 'clear' ? 'active' : ''}`}
            onClick={() => {
              clearErrorState()
              setActionType('clear')
            }}
            type="button"
          >
            正手高远球
          </button>
          <button
            className={`choice-pill ${actionType === 'smash' ? 'active' : ''}`}
            onClick={() => {
              clearErrorState()
              setActionType('smash')
            }}
            type="button"
          >
            杀球
          </button>
        </div>
        <p className="muted-copy">当前动作：{selectedActionLabel}。首页先选定动作，后面的拍摄指引和上传确认都会跟着走。</p>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>怎么用</h2>
        </div>
        <div className="info-list">
          <div className="list-row">1. 先按拍摄指引录一段清晰、完整的训练视频</div>
          <div className="list-row">2. 上传 5~15 秒单人视频，系统会自动跑完整分析链路</div>
          <div className="list-row">3. 先看一句话结论、核心问题和下次复测关注点</div>
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>为什么值得继续复测</h2>
        </div>
        <p className="body-copy">
          这不是一次性识别工具。每次上传都会沉淀为你的训练样本，后面就能用来对比动作有没有真正稳定地变好。
        </p>
      </section>

      <div className="action-stack">
        <Link className="primary-action" to="/guide">开始分析{selectedActionLabel}</Link>
        <Link className="secondary-action" to="/history">查看历史记录</Link>
      </div>
    </div>
  )
}
