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
    <div className={`score-badge ${tone} ${size}`}>
      {label ? <span>{label}</span> : null}
      <strong>{value}</strong>
    </div>
  )
}
