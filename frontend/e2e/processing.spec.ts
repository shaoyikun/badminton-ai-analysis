import { expect, test } from '@playwright/test'
import { buildSessionSnapshot, currentTaskId, processingLifecycle } from './support/data'
import { assertShellLayout, gotoWithSession } from './support/helpers'
import { mockApi } from './support/mockApi'

test('处理中完成后自动跳转到报告页', async ({ page }) => {
  await mockApi(page, {
    taskStatusSequence: [processingLifecycle.completed],
  })

  await gotoWithSession(page, `/analyses/${currentTaskId}/processing`, buildSessionSnapshot({ taskId: currentTaskId }))

  await expect(page).toHaveURL(new RegExp(`/analyses/${currentTaskId}/report$`))
  await expect(page.getByRole('heading', { name: /本次基于 9\/9 帧稳定识别结果生成/ })).toBeVisible()
})

test('处理中失败后自动跳转到错误页', async ({ page }) => {
  await mockApi(page, {
    taskStatusSequence: [processingLifecycle.failed],
  })

  await gotoWithSession(
    page,
    `/analyses/${processingLifecycle.failed.taskId}/processing`,
    buildSessionSnapshot({ taskId: processingLifecycle.failed.taskId }),
  )

  await assertShellLayout(page, { hasTabs: false })
  await expect(page).toHaveURL(/\/error$/)
  await expect(page.getByRole('heading', { name: '画面质量不足' })).toBeVisible()
  await expect(page.getByRole('link', { name: '查看拍摄指引' })).toBeVisible()
})

test('旧 processing 路由不再兼容并回到首页', async ({ page }) => {
  await mockApi(page)

  await page.goto('/processing')

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: '先上传一段完整挥拍视频，再得到可复测的动作结论' })).toBeVisible()
})
