import { Navigate, Route, Routes } from 'react-router-dom'
import { ComparePage } from '../features/compare/ComparePage'
import { DesignSystemPage } from '../features/design-system/DesignSystemPage'
import { ErrorPage } from '../features/error/ErrorPage'
import { GuidePage } from '../features/guide/GuidePage'
import { HistoryPage } from '../features/history/HistoryPage'
import { HomePage } from '../features/home/HomePage'
import { ProcessingPage } from '../features/processing/ProcessingPage'
import { ReportPage } from '../features/report/ReportPage'
import { UploadPage } from '../features/upload/UploadPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/guide" element={<GuidePage />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/processing" element={<ProcessingPage />} />
      <Route path="/report" element={<ReportPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/compare" element={<ComparePage />} />
      <Route path="/error" element={<ErrorPage />} />
      <Route path="/design-system/foundations" element={<DesignSystemPage variant="foundations" />} />
      <Route path="/design-system/components" element={<DesignSystemPage variant="components" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
