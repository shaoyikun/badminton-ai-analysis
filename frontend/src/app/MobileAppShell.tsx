import { useMemo, useState, type ReactNode } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import { DebugDrawer } from '../components/debug/DebugDrawer'
import { TabBar } from '../components/ui/TabBar'
import { useAnalysisTask } from '../hooks/useAnalysisTask'
import { buildReportRoute, ROUTES } from './routes'
import styles from './MobileAppShell.module.scss'

const PRIMARY_ROUTES = new Set<string>([ROUTES.home, ROUTES.upload, ROUTES.history])

type RouteMetaItem = {
  path: string
  title: string
  subtitle: string
  root?: boolean
}

const ROUTE_META: RouteMetaItem[] = [
  { path: ROUTES.home, title: 'Badminton AI', subtitle: '移动端动作分析', root: true },
  { path: ROUTES.guide, title: '拍摄指引', subtitle: '上传前先看一眼' },
  { path: ROUTES.upload, title: '上传视频', subtitle: '两步式动作分析', root: true },
  { path: '/analyses/:taskId/processing', title: '分析中', subtitle: '请稍候' },
  { path: '/analyses/:taskId/report', title: '分析报告', subtitle: '本次动作结论' },
  { path: ROUTES.history, title: '历史记录', subtitle: '持续训练反馈', root: true },
  { path: '/analyses/:taskId/comparison', title: '复测对比', subtitle: '看看有没有进步' },
  { path: ROUTES.error, title: '处理失败', subtitle: '给你明确下一步' },
  { path: ROUTES.designSystemFoundations, title: 'Design Foundations', subtitle: '样式页与基础 token' },
  { path: ROUTES.designSystemComponents, title: 'Design Components', subtitle: '组件页与报告模式' },
]

function getRouteMeta(pathname: string) {
  return ROUTE_META.find((item) => matchPath({ path: item.path, end: true }, pathname)) ?? ROUTE_META[0]
}

export function MobileAppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [debugOpen, setDebugOpen] = useState(false)
  const { debugEnabled, latestCompletedTaskId } = useAnalysisTask()

  const meta = getRouteMeta(location.pathname)
  const designMode = location.pathname.startsWith('/design-system')
  const showTabs = useMemo(() => {
    if (PRIMARY_ROUTES.has(location.pathname)) return true
    return matchPath({ path: '/analyses/:taskId/report', end: true }, location.pathname) !== null
  }, [location.pathname])

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate(ROUTES.home)
  }

  return (
    <div className={styles.appShell}>
      <div className={designMode ? styles.designFrame : styles.deviceFrame}>
        {!designMode ? <div className={styles.deviceGlow} /> : null}
        <div className={designMode ? styles.designScreen : styles.deviceScreen}>
          <header className={styles.topNav}>
            <div className={styles.topNavMain}>
              {meta.root ? (
                <div>
                  <span className={styles.eyebrow}>羽毛球动作分析</span>
                  <strong className={styles.title}>{meta.title}</strong>
                </div>
              ) : (
                <button className={styles.backButton} onClick={handleBack} type="button">
                  返回
                </button>
              )}
              <div className={styles.topNavCopy}>
                {!meta.root ? <strong className={styles.title}>{meta.title}</strong> : null}
                <span className={styles.subtitle}>{meta.subtitle}</span>
              </div>
            </div>

            {debugEnabled ? (
              <button className={styles.debugButton} onClick={() => setDebugOpen(true)} type="button">
                联调
              </button>
            ) : null}
          </header>

          <main className={showTabs ? styles.pageScrollWithTabs : styles.pageScroll}>
            {children}
          </main>

          {showTabs ? (
            <TabBar
              items={[
                { to: ROUTES.home, label: '首页' },
                { to: ROUTES.upload, label: '上传' },
                latestCompletedTaskId
                  ? { to: buildReportRoute(latestCompletedTaskId), label: '报告' }
                  : { label: '报告', disabled: true },
                { to: ROUTES.history, label: '记录' },
              ]}
            />
          ) : null}
        </div>
      </div>

      <DebugDrawer open={debugOpen} onClose={() => setDebugOpen(false)} />
    </div>
  )
}
