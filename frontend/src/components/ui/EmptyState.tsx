import { Link } from 'react-router-dom'
import styles from './EmptyState.module.scss'

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
    <section className={styles.card}>
      <div className={styles.illustration} aria-hidden="true">
        <span className={styles.orbit} />
        <span className={styles.racket} />
      </div>
      {badge ? <span className={styles.badge}>{badge}</span> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      <div className={styles.actions}>
        <Link className={styles.primary} to={primary.to}>{primary.label}</Link>
        {secondary ? <Link className={styles.secondary} to={secondary.to}>{secondary.label}</Link> : null}
      </div>
    </section>
  )
}
