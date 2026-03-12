import { expect, test } from '@playwright/test'
import { buildSessionSnapshot, currentTaskId, processingLifecycle } from './support/data'
import { gotoWithSession } from './support/helpers'
import { mockApi } from './support/mockApi'

test('处理中完成后自动跳转到报告页', async ({ page }) => {
  await mockApi(page, {
    taskStatusSequence: [processingLifecycle.completed],
  })

  await gotoWithSession(page, '/processing', buildSessionSnapshot({ taskId: currentTaskId }))

  await expect(page).toHaveURL(/\/report$/)
  await expect(page.getByRole('heading', { name: /本次基于 9\/9 帧稳定识别结果生成/ })).toBeVisible()
})

test('处理中失败后自动跳转到错误页', async ({ page }) => {
  await mockApi(page, {
    taskStatusSequence: [processingLifecycle.failed],
  })

  await gotoWithSession(page, '/processing', buildSessionSnapshot({ taskId: processingLifecycle.failed.taskId }))

  await expect(page).toHaveURL(/\/error$/)
  await expect(page.getByRole('heading', { name: '画面质量不足' })).toBeVisible()
  await expect(page.getByRole('link', { name: '查看拍摄指引' })).toBeVisible()
})

test('无 taskId 直达处理中页时回到上传页', async ({ page }) => {
  await mockApi(page)

  await page.goto('/processing')

  await expect(page).toHaveURL(/\/upload$/)
  await expect(page.getByRole('heading', { name: '上传视频' })).toBeVisible()
})
