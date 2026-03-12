import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { StatusPill } from '../../components/ui/StatusPill'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'

function getSteps(status: string, preprocessStatus: string, poseStatus: string) {
  const preprocessDone = preprocessStatus === 'completed' || poseStatus === 'processing' || poseStatus === 'completed'
  const poseDone = poseStatus === 'completed' || status === 'completed'

  return [
    { title: '视频已上传', state: status ? 'done' : 'idle' },
    {
      title: '正在校验与抽帧',
      state: preprocessDone ? 'done' : (preprocessStatus === 'processing' || preprocessStatus === 'queued' || status === 'uploaded') ? 'active' : 'idle',
    },
    {
      title: '正在识别动作特征',
      state: poseDone ? 'done' : poseStatus === 'processing' || preprocessDone ? 'active' : 'idle',
    },
    {
      title: '正在生成诊断与复测建议',
      state: status === 'completed' ? 'done' : (poseDone || status === 'processing') ? 'active' : 'idle',
    },
  ] as const
}

export function ProcessingPage() {
  const navigate = useNavigate()
  const { taskId, status, preprocessStatus, poseStatus, errorState, selectedActionLabel } = useAnalysisTask()

  useEffect(() => {
    if (!taskId) {
      navigate('/upload', { replace: true })
      return
    }
    if (status === 'completed') {
      navigate('/report', { replace: true })
      return
    }
    if (status === 'failed' || errorState) {
      navigate('/error', { replace: true })
    }
  }, [errorState, navigate, status, taskId])

  const steps = getSteps(status, preprocessStatus, poseStatus)

  return (
    <div className="page-stack">
      <section className="surface-card">
        <div className="section-head">
          <h2>当前任务：{selectedActionLabel}</h2>
          <StatusPill label={status === 'completed' ? '已完成' : '处理中'} tone="progress" />
        </div>

        <div className="step-list">
          {steps.map((step) => (
            <div key={step.title} className={`step-row ${step.state}`}>
              <span className={`step-dot ${step.state}`} />
              <div>
                <strong>{step.title}</strong>
                <p>{step.state === 'done' ? '已完成' : step.state === 'active' ? '正在进行' : '等待中'}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="muted-copy">
          预计耗时 15~30 秒。分析成功后会自动进入报告，若视频不符合要求会返回明确的重拍建议。
        </p>
      </section>
    </div>
  )
}
