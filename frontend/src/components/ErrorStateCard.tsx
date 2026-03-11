type ErrorState = {
  errorCode?: string
  title: string
  message: string
} | null

export function ErrorStateCard({ errorState }: { errorState: ErrorState }) {
  if (!errorState) return null

  return (
    <div className="error-state-card">
      <strong>{errorState.title}</strong>
      <p>{errorState.message}</p>
      <span>建议重新按拍摄规范录制：单人、5~15 秒、侧后方或正后方、全身尽量完整入镜。</span>
    </div>
  )
}
