import { expect, type Page } from '@playwright/test'
import { buildSessionSnapshot } from './data'

export async function gotoWithSession(
  page: Page,
  path: string,
  session = buildSessionSnapshot(),
) {
  await page.addInitScript((snapshot) => {
    window.sessionStorage.setItem(
      'badminton-ai-analysis-session',
      JSON.stringify(snapshot),
    )
  }, session)

  await page.goto(path)
}

export async function assertShellLayout(page: Page, options: { hasTabs: boolean; requireScrollable?: boolean }) {
  const metrics = await page.evaluate(async ({ hasTabs }) => {
    const read = () => {
      const header = document.querySelector('header')
      const main = document.querySelector('main')
      const nav = document.querySelector('nav[aria-label="主导航"]')
      const root = document.querySelector('[class*="deviceScreen"], [class*="designScreen"]')
      const rect = (element: Element | null) => {
        if (!element) return null
        const box = element.getBoundingClientRect()
        const scroller = element as HTMLElement
        return {
          top: box.top,
          bottom: box.bottom,
          height: box.height,
          clientHeight: scroller.clientHeight,
          scrollHeight: scroller.scrollHeight,
          scrollTop: scroller.scrollTop,
        }
      }
      return {
        windowY: window.scrollY,
        viewportHeight: window.innerHeight,
        header: rect(header),
        main: rect(main),
        nav: rect(nav),
        root: rect(root),
      }
    }

    const before = read()
    const main = document.querySelector('main') as HTMLElement | null
    if (main) {
      main.scrollTop = 320
      await new Promise((resolve) => window.setTimeout(resolve, 80))
    }
    const afterMainScroll = read()
    window.scrollTo(0, 300)
    await new Promise((resolve) => window.setTimeout(resolve, 80))
    const afterWindowScroll = read()
    return { hasTabs, before, afterMainScroll, afterWindowScroll }
  }, { hasTabs: options.hasTabs })

  expect(metrics.before.root?.height).toBeLessThanOrEqual(metrics.before.viewportHeight + 2)
  if (options.requireScrollable !== false) {
    expect(metrics.before.main?.scrollHeight ?? 0).toBeGreaterThan(metrics.before.main?.clientHeight ?? 0)
    expect(metrics.afterMainScroll.main?.scrollTop ?? 0).toBeGreaterThan(0)
  }
  expect(Math.abs((metrics.afterMainScroll.header?.top ?? 0) - (metrics.before.header?.top ?? 0))).toBeLessThan(2)
  expect(metrics.afterWindowScroll.windowY).toBe(0)

  if (options.hasTabs) {
    expect(metrics.before.nav).not.toBeNull()
    expect(Math.abs((metrics.afterMainScroll.nav?.top ?? 0) - (metrics.before.nav?.top ?? 0))).toBeLessThan(2)
  } else {
    expect(metrics.before.nav).toBeNull()
  }
}
