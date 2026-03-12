import { Link } from 'react-router-dom'

type CTAAction = {
  label: string
  to?: string
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  tone?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

function CTAButton({ action }: { action: CTAAction }) {
  const tone = action.tone ?? 'secondary'
  const className =
    tone === 'primary'
      ? 'primary-action'
      : tone === 'danger'
        ? 'danger-action'
        : tone === 'ghost'
          ? 'ghost-action'
          : 'secondary-action'

  if (action.to) {
    return <Link className={className} to={action.to}>{action.label}</Link>
  }

  return (
    <button className={`${className} button-reset`} disabled={action.disabled} onClick={action.onClick} type="button">
      {action.loading ? '处理中...' : action.label}
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
    <div className={`bottom-cta ${sticky ? 'sticky' : 'static'}`}>
      <div className="bottom-cta-actions">
        <CTAButton action={{ ...primary, tone: primary.tone ?? 'primary' }} />
        {secondary ? <CTAButton action={secondary} /> : null}
      </div>
    </div>
  )
}
