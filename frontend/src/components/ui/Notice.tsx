import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import styles from './Notice.module.scss'

export function Notice({
  tone = 'info',
  title,
  children,
  compact = false,
}: {
  tone?: 'info' | 'warning' | 'error'
  title?: string
  children: ReactNode
  compact?: boolean
}) {
  return (
    <div className={cn(styles.card, styles[tone], compact && styles.compact)}>
      {title ? <strong>{title}</strong> : null}
      <div className={styles.copy}>{children}</div>
    </div>
  )
}
