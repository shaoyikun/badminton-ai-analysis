import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import styles from './BottomCTA.module.scss'

type CTAAction = {
  label: string
  to?: string
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  tone?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

function getActionClass(tone: CTAAction['tone']) {
  if (tone === 'danger') return styles.danger
  if (tone === 'ghost') return styles.ghost
  if (tone === 'secondary') return styles.secondary
  return styles.primary
}

function CTAButton({ action }: { action: CTAAction }) {
  const className = cn(styles.button, getActionClass(action.tone ?? 'primary'))
  const label = action.loading ? '处理中...' : action.label

  if (action.to && !action.disabled && !action.loading) {
    return (
      <Link className={className} to={action.to}>
        {label}
      </Link>
    )
  }

  return (
    <button
      className={className}
      disabled={action.disabled || action.loading}
      onClick={action.onClick}
      type="button"
    >
      {label}
    </button>
  )
}

export function BottomCTA({
  primary,
  secondary,
  sticky = true,
}: {
  primary: CTAAction
  secondary?: CTAAction
  sticky?: boolean
}) {
  return (
    <div className={cn(styles.wrapper, sticky ? styles.sticky : styles.static)}>
      <div className={styles.actions}>
        <CTAButton action={{ ...primary, tone: primary.tone ?? 'primary' }} />
        {secondary ? <CTAButton action={{ ...secondary, tone: secondary.tone ?? 'secondary' }} /> : null}
      </div>
    </div>
  )
}
