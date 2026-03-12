import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DebugDrawer } from '../components/debug/DebugDrawer'
import { TabBar } from '../components/ui/TabBar'
import { useAnalysisTask } from '../hooks/useAnalysisTask'

const PRIMARY_ROUTES = new Set(['/', '/upload', '/report', '/history'])

const ROUTE_META: Record<string, { title: string; subtitle: string; root?: boolean }> = {
  '/': { title: 'Badminton AI', subtitle: '移动端动作分析', root: true },
  '/guide': { title: '拍摄指引', subtitle: '上传前先看一眼' },
  '/upload': { title: '上传视频', subtitle: '单动作分析', root: true },
  '/processing': { title: '分析中', subtitle: '请稍候' },
  '/report': { title: '分析报告', subtitle: '本次动作结论', root: true },
  '/history': { title: '历史记录', subtitle: '持续训练反馈', root: true },
  '/compare': { title: '复测对比', subtitle: '看看有没有进步' },
  '/error': { title: '处理失败', subtitle: '给你明确下一步' },
  '/design-system/foundations': { title: 'Design Foundations', subtitle: '样式页与基础 token' },
  '/design-system/components': { title: 'Design Components', subtitle: '组件页与报告模式' },
}

export function MobileAppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [debugOpen, setDebugOpen] = useState(false)
  const { canOpenReportTab, debugEnabled } = useAnalysisTask()

  const meta = ROUTE_META[location.pathname] ?? ROUTE_META['/']
  const showTabs = PRIMARY_ROUTES.has(location.pathname)
  const designMode = location.pathname.startsWith('/design-system')

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/')
  }

  return (
    <div className={`app-shell ${designMode ? 'design-mode' : ''}`}>
      <div className={`device-frame ${designMode ? 'design-board-frame' : ''}`}>
        {designMode ? null : <div className="device-glow" />}
        <div className={`device-screen ${designMode ? 'design-board-screen' : ''}`}>
          <header className="top-nav">
            <div className="top-nav-main">
              {meta.root ? (
                <div>
                  <span className="eyebrow-copy">羽毛球动作分析</span>
                  <strong>{meta.title}</strong>
                </div>
              ) : (
                <button className="back-button" onClick={handleBack} type="button">
                  返回
                </button>
              )}
              <div className="top-nav-copy">
                {!meta.root ? <strong>{meta.title}</strong> : null}
                <span>{meta.subtitle}</span>
              </div>
            </div>
            {debugEnabled ? (
              <button className="icon-button" onClick={() => setDebugOpen(true)} type="button">
                联调
              </button>
            ) : null}
          </header>

          <main className={`page-scroll ${showTabs ? 'with-tabs' : ''} ${designMode ? 'design-scroll' : ''}`}>
            {children}
          </main>

          {showTabs ? (
            <TabBar
              items={[
                { to: '/', label: '首页' },
                { to: '/upload', label: '上传' },
                { to: '/report', label: '报告', disabled: !canOpenReportTab },
                { to: '/history', label: '记录' },
              ]}
            />
          ) : null}
        </div>
      </div>

      <DebugDrawer open={debugOpen} onClose={() => setDebugOpen(false)} />
    </div>
  )
}
