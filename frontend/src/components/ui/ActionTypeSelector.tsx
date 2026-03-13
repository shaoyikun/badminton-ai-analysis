import { Selector } from 'antd-mobile'
import type { ActionType } from '../../hooks/useAnalysisTask'
import { useAnalysisTask } from '../../hooks/useAnalysisTask'
import { ACTION_LABELS } from '../../features/upload/uploadFlow'
import styles from './ActionTypeSelector.module.scss'

const ACTION_OPTIONS = (Object.entries(ACTION_LABELS) as Array<[ActionType, string]>)
  .map(([value, label]) => ({
    label,
    value,
  }))

export function ActionTypeSelector({ disabled = false }: { disabled?: boolean }) {
  const { actionType, setActionType } = useAnalysisTask()

  return (
    <div className={styles.selectorShell}>
      <Selector
        className={styles.selector}
        columns={2}
        disabled={disabled}
        options={ACTION_OPTIONS}
        value={[actionType]}
        onChange={(next) => {
          const selected = next[0]
          if (selected) {
            setActionType(selected as ActionType)
          }
        }}
      />
    </div>
  )
}
