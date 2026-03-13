import { cn } from '../../lib/cn'
import styles from './StatusPill.module.scss'

export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: 'neutral' | 'brand' | 'progress' | 'success' | 'danger'
}) {
  return <span className={cn(styles.pill, styles[tone])}>{label}</span>
}
