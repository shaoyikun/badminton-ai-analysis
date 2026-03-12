import { API_BASE } from '../../hooks/useAnalysisTask'

export function formatFileSize(size?: number) {
  if (!size) return '—'
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

export function formatScore(value?: number | null) {
  if (value === null || value === undefined) return '—'
  return value.toFixed(2)
}

export function formatTime(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export function buildAssetUrl(relativePath?: string) {
  if (!relativePath) return ''
  return `${API_BASE}/${relativePath}`
}

export function buildReferenceUrl(relativePath?: string) {
  if (!relativePath) return ''
  return `${relativePath}`
}
