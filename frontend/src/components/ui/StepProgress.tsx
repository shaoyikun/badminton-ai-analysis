import { cn } from '../../lib/cn'
import styles from './StepProgress.module.scss'

type StepItem = {
  title: string
  description: string
  state: 'idle' | 'active' | 'done'
}

export function StepProgress({ steps }: { steps: readonly StepItem[] }) {
  return (
    <div className={styles.progress}>
      {steps.map((step, index) => (
        <div key={step.title} className={cn(styles.row, styles[step.state])}>
          <div className={styles.rail} aria-hidden="true">
            <span className={cn(styles.dot, styles[step.state])} />
            {index < steps.length - 1 ? <span className={cn(styles.line, step.state === 'done' && styles.lineDone)} /> : null}
          </div>
          <div className={styles.copy}>
            <strong>{step.title}</strong>
            <p>{step.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
