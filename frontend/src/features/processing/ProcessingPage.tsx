import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { StatusPill } from '../../components/ui/StatusPill'
import { StepProgress } from '../../components/ui/StepProgress'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'

function getSteps(stage: string, status: string) {
  const preprocessDone = stage === 'estimating_pose' || stage === 'generating_report' || stage === 'completed'
  const poseDone = stage === 'generating_report' || stage === 'completed'

  return [
    {
      title: '视频已上传',
      state: stage === 'upload_pending' && status === 'created' ? 'active' : status ? 'done' : 'idle',
      description: '文件已提交成功，接下来会先检查视频是否符合当前 MVP 要求。',
    },
    {
      title: '正在校验与抽帧',
      state: preprocessDone ? 'done' : (stage === 'uploaded' || stage === 'validating' || stage === 'extracting_frames') ? 'active' : 'idle',
      description: preprocessDone
        ? '已完成视频信息校验，并抽取了后续分析所需的关键帧。'
        : '系统正在读取视频信息、检查基本约束，并准备关键帧。你暂时不需要操作。',
    },
    {
      title: '正在识别动作特征',
      state: poseDone ? 'done' : stage === 'estimating_pose' || preprocessDone ? 'active' : 'idle',
      description: poseDone
        ? '已完成主体动作骨架识别，正在整理关键动作特征。'
        : '系统正在识别你的动作骨架和关键发力特征，机位和画面清晰度会直接影响这一阶段。',
    },
    {
      title: '正在生成诊断与复测建议',
      state: status === 'completed' ? 'done' : (poseDone || status === 'processing') ? 'active' : 'idle',
      description: status === 'completed'
        ? '分析结果已经准备好，正在跳转到报告页。'
        : '系统正在把动作识别结果整理成报告、问题解释和下一次复测建议。',
    },
  ] as const
}

function getLiveSummary(stage: string, status: string) {
  if (status === 'completed') return '本次分析已经完成，正在进入报告页。'
  if (stage === 'estimating_pose') return '动作识别正在进行中，这是最依赖画面质量和机位的一步。'
  if (stage === 'validating' || stage === 'extracting_frames' || stage === 'uploaded') {
    return '系统正在检查时长、视频质量并抽取关键帧，确认这段视频是否适合进入分析。'
  }
  if (stage === 'generating_report') return '识别已经完成，系统正在整理报告、问题解释和复测建议。'
  return '任务已启动，系统会自动依次完成校验、识别和结果生成。'
}

export function ProcessingPage() {
  const navigate = useNavigate()
  const { taskId, status, stage, progressPercent, errorState, selectedActionLabel, selectedVideoSummary, selectedSegmentId } = useAnalysisTask()

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

  const steps = getSteps(stage, status)

  return (
    <div className="page-stack">
      <section className="surface-card">
        <div className="section-head">
          <h2>当前任务：{selectedActionLabel}</h2>
          <StatusPill label={status === 'completed' ? '已完成' : '处理中'} tone="progress" />
        </div>
        <div className="meta-grid">
          <div className="list-row">
            <span>当前文件</span>
            <strong>{selectedVideoSummary?.fileName ?? '已上传视频'}</strong>
          </div>
          <div className="list-row">
            <span>预计耗时</span>
            <strong>约 15~30 秒</strong>
          </div>
          <div className="list-row">
            <span>当前阶段</span>
            <strong>{stage || '准备中'} · {progressPercent}%</strong>
          </div>
          <div className="list-row">
            <span>分析片段</span>
            <strong>{selectedSegmentId || '系统默认片段'}</strong>
          </div>
        </div>
        <p className="muted-copy">{getLiveSummary(stage, status)}</p>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>分步骤反馈</h2>
        </div>
        <StepProgress steps={steps} />
      </section>
    </div>
  )
}
