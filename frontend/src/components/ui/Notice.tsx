import type { ReactNode } from 'react'

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
    <div className={`notice-card ${tone} ${compact ? 'compact' : ''}`}>
      {title ? <strong>{title}</strong> : null}
      <div className="notice-copy">{children}</div>
    </div>
  )
}
