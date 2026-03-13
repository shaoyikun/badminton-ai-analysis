import { cn } from '../../lib/cn'
import styles from './FlowStepHeader.module.scss'

type FlowStepState = 'upcoming' | 'current' | 'done'

type FlowStepItem = {
  key: string
  label: string
  hint: string
  state: FlowStepState
}

export function FlowStepHeader({
  badge,
  title,
  description,
  steps,
}: {
  badge: string
  title: string
  description: string
  steps: FlowStepItem[]
}) {
  return (
    <section className={styles.hero}>
      <span className={styles.badge}>{badge}</span>
      <div className={styles.copy}>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className={styles.stepRow} aria-label="流程步骤">
        {steps.map((step, index) => (
          <div key={step.key} className={cn(styles.step, styles[step.state])}>
            <div className={styles.stepTop}>
              <span className={styles.index}>{index + 1}</span>
              <strong>{step.label}</strong>
            </div>
            <p>{step.hint}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
