import { Link } from 'react-router-dom'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import { ACTION_GUIDE_COPY, UPLOAD_CONSTRAINTS } from '../upload/uploadFlow'

export function GuidePage() {
  const { selectedActionLabel, actionType } = useAnalysisTask()
  const actionGuide = ACTION_GUIDE_COPY[actionType]

  return (
    <div className="page-stack">
      <section className="surface-card">
        <span className="badge">上传前必看</span>
        <div className="section-head">
          <h2>推荐拍摄要求</h2>
        </div>
        <div className="info-list">
          {UPLOAD_CONSTRAINTS.captureChecklist.map((item) => (
            <div key={item} className="list-row">{item}</div>
          ))}
        </div>
      </section>

      <section className="surface-card">
        <span className="badge neutral">当前动作：{selectedActionLabel}</span>
        <div className="section-head">
          <h2>{actionGuide.title}</h2>
        </div>
        <div className="info-list">
          {actionGuide.checklist.map((item) => (
            <div key={item} className="list-row">{item}</div>
          ))}
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>动作专项提醒</h2>
        </div>
        <div className="info-list">
          <div className="list-row">
            <strong>正手高远球</strong>
            <p>当前正式分析只支持这一动作，优先保证准备、上举、击球、收拍和回位全过程都能看到。</p>
          </div>
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>常见错误</h2>
        </div>
        <div className="info-list">
          <div className="list-row">
            <strong>人物太小</strong>
            <p>看不清关节和挥拍细节，容易识别失败。</p>
          </div>
          <div className="list-row">
            <strong>多人同框</strong>
            <p>主体不明确，系统无法稳定判断动作。</p>
          </div>
          <div className="list-row">
            <strong>视频太短</strong>
            <p>没有完整覆盖准备、击球和收拍，报告可信度会明显下降。</p>
          </div>
        </div>
      </section>

      <div className="notice-strip">
        先按规范拍好再上传，MVP 阶段识别效果高度依赖输入视频质量。
      </div>

      <div className="action-stack">
        <Link className="primary-action" to="/upload">我已了解，去上传</Link>
        <Link className="secondary-action" to="/">返回首页</Link>
      </div>
    </div>
  )
}
