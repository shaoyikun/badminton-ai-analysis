import { Link } from 'react-router-dom'
import { BottomCTA } from '../../components/ui/BottomCTA'
import { getValidBaselineItem } from '../../components/result-views/insights'
import { EmptyState } from '../../components/ui/EmptyState'
import { RetestView } from '../../components/result-views/RetestView'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'

export function ComparePage() {
  const { comparison, history, selectedCompareTaskId } = useAnalysisTask()
  const validBaseline = getValidBaselineItem(history, selectedCompareTaskId)

  if (!comparison && !validBaseline) {
    return (
      <EmptyState
        badge="暂无对比"
        title="当前还没有可对比的同动作样本"
        description="等你完成下一次上传，或者先从历史记录里选一条样本做基线，就能看到这次有没有进步。"
        primary={{ label: '去历史记录', to: '/history' }}
        secondary={{ label: '继续上传', to: '/upload' }}
      />
    )
  }

  return (
    <div className="page-stack">
      <RetestView comparison={comparison} />
      <BottomCTA
        primary={{ label: '继续复测上传', to: '/upload' }}
        secondary={{ label: '更换对比基线', to: '/history', tone: 'secondary' }}
      />
      <Link className="secondary-action tertiary-action" to="/report">返回本次报告</Link>
    </div>
  )
}
