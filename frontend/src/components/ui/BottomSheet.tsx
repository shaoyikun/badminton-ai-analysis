import { useEffect, useRef, type ReactNode } from 'react'
import { Popup } from 'antd-mobile'
import styles from './BottomSheet.module.scss'

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
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus()
  }, [open])

  return (
    <Popup
      bodyClassName={styles.popupBody}
      destroyOnClose
      visible={open}
      onClose={onClose}
      position="bottom"
    >
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.header}>
          <strong>{title}</strong>
          <button ref={closeButtonRef} className={styles.close} onClick={onClose} type="button">
            关闭
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </Popup>
  )
}
