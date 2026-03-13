import { cn } from '../../lib/cn'
import styles from './ScoreBadge.module.scss'

export function ScoreBadge({
  tone = 'neutral',
  label,
  value,
  size = 'm',
}: {
  tone?: 'neutral' | 'good' | 'improve'
  label?: string
  value: string | number
  size?: 's' | 'm' | 'l'
}) {
  return (
    <div className={cn(styles.badge, styles[tone], styles[size])}>
      {label ? <span>{label}</span> : null}
      <strong>{value}</strong>
    </div>
  )
}
