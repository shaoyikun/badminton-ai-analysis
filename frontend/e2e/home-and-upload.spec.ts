import { expect, test } from '@playwright/test'
import { invalidImagePath, validVideoPath } from './support/data'
import { mockApi } from './support/mockApi'

test('首页主漏斗可达性', async ({ page }) => {
  await mockApi(page)

  await page.goto('/')

  await expect(page.getByText('羽毛球动作分析')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '上传一段羽毛球视频，看懂这次最该先改什么' }),
  ).toBeVisible()

  await page.getByRole('link', { name: '开始分析正手高远球' }).click()
  await expect(page).toHaveURL(/\/guide$/)

  await page.getByRole('link', { name: '我已了解，去上传' }).click()
  await expect(page).toHaveURL(/\/upload$/)
})

test('上传页默认禁用态', async ({ page }) => {
  await mockApi(page)

  await page.goto('/upload')

  await expect(page.getByRole('button', { name: '确认并开始分析' })).toBeDisabled()
  await expect(page.getByRole('heading', { name: '当前就绪检查' })).toBeVisible()
  await expect(page.getByText('当前还不能提交')).toBeVisible()
  await expect(page.getByRole('link', { name: '查看拍摄规范' })).toHaveAttribute('href', '/guide')
})

test('上传页无效文件阻塞提交', async ({ page }) => {
  await mockApi(page)

  await page.goto('/upload')
  await page.setInputFiles('input[type="file"]', invalidImagePath)

  await expect(page.getByText('文件名：invalid-image.jpg')).toBeVisible()
  const blockingReasons = page.locator('.inline-error-list')
  await expect(blockingReasons.getByText('当前文件看起来不是受支持的视频格式，请重新选择。')).toBeVisible()
  await expect(blockingReasons.getByText('文件过小，通常说明内容不完整或文件异常。')).toBeVisible()

  await page.getByRole('checkbox', { name: '我已确认这段视频只包含当前动作，主体清晰、完整，且基本符合拍摄要求。' }).check()
  await expect(page.getByRole('button', { name: '确认并开始分析' })).toBeDisabled()
})

test('上传页合规文件解锁提交', async ({ page }) => {
  await mockApi(page)

  await page.goto('/upload')
  await page.setInputFiles('input[type="file"]', validVideoPath)

  await expect(page.getByText('文件名：valid-clear.mp4')).toBeVisible()
  await expect(page.getByText('时长：8 秒')).toBeVisible()
  await expect(page.getByText('时长符合当前 MVP 分析窗口。')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认并开始分析' })).toBeDisabled()

  await page.getByRole('checkbox', { name: '我已确认这段视频只包含当前动作，主体清晰、完整，且基本符合拍摄要求。' }).check()
  await expect(page.getByRole('button', { name: '确认并开始分析' })).toBeEnabled()
})

test('提交后进入处理中页', async ({ page }) => {
  await mockApi(page)

  await page.goto('/upload')
  await page.setInputFiles('input[type="file"]', validVideoPath)
  await page.getByRole('checkbox', { name: '我已确认这段视频只包含当前动作，主体清晰、完整，且基本符合拍摄要求。' }).check()
  await page.getByRole('button', { name: '确认并开始分析' }).click()

  await expect(page).toHaveURL(/\/processing$/)
  await expect(page.getByRole('heading', { name: '当前任务：正手高远球' })).toBeVisible()
  await expect(page.getByText('当前文件')).toBeVisible()
  await expect(page.getByText('valid-clear.mp4')).toBeVisible()
  await expect(page.getByRole('heading', { name: '分步骤反馈' })).toBeVisible()
  await expect(page.getByText('视频已上传')).toBeVisible()
})
