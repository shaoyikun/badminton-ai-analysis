import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { TaskStage, TaskStatus, TaskStatusResponse } from '../../../../shared/contracts'
import { StepProgress } from '../../components/ui/StepProgress'
import { StatusPill } from '../../components/ui/StatusPill'
import { buildReportRoute, ROUTES } from '../../app/routes'
import { fetchTaskStatus } from '../../app/analysis-session/api'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import pageStyles from '../../styles/PageLayout.module.scss'

function getSteps(stage: TaskStage | '', status: TaskStatus | '') {
  const preprocessDone = stage === 'estimating_pose' || stage === 'generating_report' || stage === 'completed'
  const poseDone = stage === 'generating_report' || stage === 'completed'

  return [
    {
      title: '视频已上传',
      state: stage === 'upload_pending' && status === 'created' ? 'active' : status ? 'done' : 'idle',
      description: '文件已提交成功，接下来系统会先检查视频是否符合当前分析要求。',
    },
    {
      title: '正在校验与抽帧',
      state: preprocessDone ? 'done' : (stage === 'uploaded' || stage === 'validating' || stage === 'extracting_frames') ? 'active' : 'idle',
      description: preprocessDone
        ? '已完成视频信息校验，并抽取了后续分析所需的关键帧。'
        : '系统正在读取视频信息、检查基础约束，并准备关键帧。',
    },
    {
      title: '正在识别动作特征',
      state: poseDone ? 'done' : stage === 'estimating_pose' ? 'active' : 'idle',
      description: poseDone
        ? '已完成主体动作骨架识别，正在整理关键动作特征。'
        : '系统正在识别你的动作骨架和关键发力特征，机位和画面质量会直接影响这一阶段。',
    },
    {
      title: '正在生成诊断与复测建议',
      state: status === 'completed' ? 'done' : (stage === 'generating_report') ? 'active' : 'idle',
      description: status === 'completed'
        ? '分析结果已经准备好，正在跳转到报告页。'
        : '系统正在把识别结果整理成一句话结论、核心问题和复测建议。',
    },
  ] as const
}

function getLiveSummary(stage: TaskStage | '', status: TaskStatus | '') {
  if (status === 'completed') return '本次分析已经完成，正在进入报告页。'
  if (stage === 'estimating_pose') return '动作识别正在进行中，这是最依赖画面质量和机位的一步。'
  if (stage === 'validating' || stage === 'extracting_frames' || stage === 'uploaded') {
    return '系统正在检查时长、视频质量并抽取关键帧，确认这段视频适不适合进入最终分析。'
  }
  if (stage === 'generating_report') return '识别已经完成，系统正在整理报告、问题解释和复测建议。'
  return '任务已启动，系统会自动依次完成校验、识别和结果生成。'
}

export function ProcessingPage() {
  const navigate = useNavigate()
  const params = useParams<{ taskId: string }>()
  const {
    selectedActionLabel,
    selectedSegmentId,
    selectedVideoSummary,
    rememberCompletedTask,
    setFriendlyError,
    appendLog,
  } = useAnalysisTask()
  const [task, setTask] = useState<TaskStatusResponse | null>(null)

  useEffect(() => {
    if (!params.taskId) {
      navigate(ROUTES.upload, { replace: true })
      return
    }

    let mounted = true
    let timer: number | undefined

    const load = async () => {
      const result = await fetchTaskStatus(params.taskId!)
      if (!result.ok) {
        if (!mounted) return
        setFriendlyError(result.error?.code, result.error?.message)
        navigate(ROUTES.error, { replace: true })
        return
      }

      if (!mounted) return
      setTask(result.data)

      if (result.data.status === 'completed') {
        rememberCompletedTask(result.data.taskId, result.data.actionType)
        appendLog('分析已完成，正在进入报告页')
        navigate(buildReportRoute(result.data.taskId), { replace: true })
        return
      }

      if (result.data.status === 'failed' || result.data.error) {
        setFriendlyError(result.data.error?.code, result.data.error?.message)
        navigate(ROUTES.error, { replace: true })
        return
      }

      timer = window.setTimeout(load, 1500)
    }

    void load()

    return () => {
      mounted = false
      if (timer) window.clearTimeout(timer)
    }
  }, [appendLog, navigate, params.taskId, rememberCompletedTask, setFriendlyError])

  const steps = useMemo(
    () => getSteps(task?.stage ?? '', task?.status ?? ''),
    [task?.stage, task?.status],
  )

  if (!params.taskId) {
    return null
  }

  return (
    <div className={pageStyles.pageStack}>
      <section className={pageStyles.heroCard}>
        <span className={pageStyles.badge}>处理中</span>
        <h1>系统正在处理你确认过的挥拍片段</h1>
        <p>{getLiveSummary(task?.stage ?? '', task?.status ?? '')}</p>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>当前任务：{task?.actionType === 'smash' ? '杀球' : selectedActionLabel}</h2>
        </div>
        <div className={pageStyles.keyGrid}>
          <div className={pageStyles.keyItem}>
            <span>任务状态</span>
            <strong><StatusPill label={task?.status === 'completed' ? '已完成' : '处理中'} tone="progress" /></strong>
          </div>
          <div className={pageStyles.keyItem}>
            <span>预计耗时</span>
            <strong>约 15~30 秒</strong>
          </div>
          <div className={pageStyles.keyItem}>
            <span>当前阶段</span>
            <strong>{task?.stage ?? '准备中'}</strong>
            <p>当前进度 {task?.progressPercent ?? 0}%</p>
          </div>
          <div className={pageStyles.keyItem}>
            <span>分析片段</span>
            <strong>{selectedSegmentId || task?.segmentScan?.selectedSegmentId || '系统默认片段'}</strong>
          </div>
          <div className={pageStyles.keyItem}>
            <span>当前文件</span>
            <strong>{selectedVideoSummary?.fileName ?? '已上传视频'}</strong>
          </div>
          <div className={pageStyles.keyItem}>
            <span>Task ID</span>
            <strong>{params.taskId}</strong>
          </div>
        </div>
      </section>

      <section className={pageStyles.card}>
        <div className={pageStyles.sectionHeader}>
          <h2>分步骤反馈</h2>
          <p className={pageStyles.muted}>这一页不会要求你手动操作。成功后会自动跳报告，失败后会自动进入错误恢复页。</p>
        </div>
        <StepProgress steps={steps} />
      </section>
    </div>
  )
}
