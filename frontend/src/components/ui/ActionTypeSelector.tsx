import type { ActionType } from '../../hooks/useAnalysisTask'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import { ACTION_LABELS } from '../../features/upload/uploadFlow'

const ACTION_OPTIONS = (Object.entries(ACTION_LABELS) as Array<[ActionType, string]>)

export function ActionTypeSelector({ disabled = false }: { disabled?: boolean }) {
  const { actionType, setActionType } = useAnalysisTask()

  return (
    <div className="pill-row" role="tablist" aria-label="动作类型选择">
      {ACTION_OPTIONS.map(([value, label]) => (
        <button
          key={value}
          className={`choice-pill ${actionType === value ? 'active' : ''}`}
          onClick={() => setActionType(value)}
          role="tab"
          aria-selected={actionType === value}
          disabled={disabled}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  )
}
