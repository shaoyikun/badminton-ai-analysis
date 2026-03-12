import type { ReactNode } from 'react'

export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <strong>{title}</strong>
          <button className="icon-button" onClick={onClose} type="button">关闭</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
