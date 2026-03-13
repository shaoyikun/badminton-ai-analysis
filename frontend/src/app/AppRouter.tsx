import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ROUTES } from './routes'

const HomePage = lazy(() => import('../features/home/HomePage').then((module) => ({ default: module.HomePage })))
const GuidePage = lazy(() => import('../features/guide/GuidePage').then((module) => ({ default: module.GuidePage })))
const UploadPage = lazy(() => import('../features/upload/UploadPage').then((module) => ({ default: module.UploadPage })))
const ProcessingPage = lazy(() => import('../features/processing/ProcessingPage').then((module) => ({ default: module.ProcessingPage })))
const ReportPage = lazy(() => import('../features/report/ReportPage').then((module) => ({ default: module.ReportPage })))
const HistoryPage = lazy(() => import('../features/history/HistoryPage').then((module) => ({ default: module.HistoryPage })))
const ComparePage = lazy(() => import('../features/compare/ComparePage').then((module) => ({ default: module.ComparePage })))
const ErrorPage = lazy(() => import('../features/error/ErrorPage').then((module) => ({ default: module.ErrorPage })))
const DesignSystemPage = lazy(() => import('../features/design-system/DesignSystemPage').then((module) => ({ default: module.DesignSystemPage })))

function RouteFallback() {
  return (
    <div style={{ padding: '20px 0', color: 'var(--color-text-secondary)' }}>
      页面加载中...
    </div>
  )
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path={ROUTES.guide} element={<GuidePage />} />
        <Route path={ROUTES.upload} element={<UploadPage />} />
        <Route path="/analyses/:taskId/processing" element={<ProcessingPage />} />
        <Route path="/analyses/:taskId/report" element={<ReportPage />} />
        <Route path={ROUTES.history} element={<HistoryPage />} />
        <Route path="/analyses/:taskId/comparison" element={<ComparePage />} />
        <Route path={ROUTES.error} element={<ErrorPage />} />
        <Route path={ROUTES.designSystemFoundations} element={<DesignSystemPage variant="foundations" />} />
        <Route path={ROUTES.designSystemComponents} element={<DesignSystemPage variant="components" />} />
        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Routes>
    </Suspense>
  )
}
