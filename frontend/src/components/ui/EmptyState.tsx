import { Link } from 'react-router-dom'

export function EmptyState({
  badge,
  title,
  description,
  primary,
  secondary,
}: {
  badge?: string
  title: string
  description: string
  primary: { label: string; to: string }
  secondary?: { label: string; to: string }
}) {
  return (
    <section className="surface-card empty-card">
      <div className="empty-state-illustration" aria-hidden="true">
        <span className="empty-state-orbit" />
        <span className="empty-state-racket" />
      </div>
      {badge ? <span className="badge neutral">{badge}</span> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="action-stack">
        <Link className="primary-action" to={primary.to}>{primary.label}</Link>
        {secondary ? <Link className="secondary-action" to={secondary.to}>{secondary.label}</Link> : null}
      </div>
    </section>
  )
}
