export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: 'neutral' | 'brand' | 'progress' | 'success' | 'danger'
}) {
  return <span className={`status-pill ${tone}`}>{label}</span>
}
