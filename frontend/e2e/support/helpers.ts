import type { Page } from '@playwright/test'
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
