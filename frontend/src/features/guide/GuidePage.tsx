import { ActionTypeSelector } from '../../components/ui/ActionTypeSelector'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { Notice } from '../../components/ui/Notice'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import { ACTION_GUIDE_COPY, ACTION_SPECIAL_REMINDER_COPY, UPLOAD_CONSTRAINTS } from '../upload/uploadFlow'

export function GuidePage() {
  const { selectedActionLabel, actionType } = useAnalysisTask()
  const actionGuide = ACTION_GUIDE_COPY[actionType]
  const reminder = ACTION_SPECIAL_REMINDER_COPY[actionType]

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
        <ActionTypeSelector />
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
            <strong>{reminder.title}</strong>
            <p>{reminder.description}</p>
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

      <Notice tone="warning" title="上传前提醒">
        先按规范拍好再上传，MVP 阶段识别效果高度依赖输入视频质量。
      </Notice>

      <BottomCTA
        primary={{ label: '我已了解，去上传', to: '/upload' }}
        secondary={{ label: '返回首页', to: '/', tone: 'secondary' }}
      />
    </div>
  )
}
