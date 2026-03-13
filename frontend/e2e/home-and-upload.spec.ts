import { expect, test } from '@playwright/test'
import { buildActionScenario, invalidImagePath, validVideoPath } from './support/data'
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

  await expect(page.getByRole('button', { name: '上传并粗扫片段' })).toBeDisabled()
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
  await expect(page.getByRole('button', { name: '上传并粗扫片段' })).toBeDisabled()
})

test('上传页合规文件解锁提交', async ({ page }) => {
  await mockApi(page)

  await page.goto('/upload')
  await page.setInputFiles('input[type="file"]', validVideoPath)

  await expect(page.getByText('文件名：valid-clear.mp4')).toBeVisible()
  await expect(page.getByText('时长：8 秒')).toBeVisible()
  await expect(page.getByText('时长符合当前 MVP 分析窗口。')).toBeVisible()
  await expect(page.getByRole('button', { name: '上传并粗扫片段' })).toBeDisabled()

  await page.getByRole('checkbox', { name: '我已确认这段视频只包含当前动作，主体清晰、完整，且基本符合拍摄要求。' }).check()
  await expect(page.getByRole('button', { name: '上传并粗扫片段' })).toBeEnabled()
})

test('粗扫后可选片段并进入处理中页', async ({ page }) => {
  await mockApi(page)

  await page.goto('/upload')
  await page.setInputFiles('input[type="file"]', validVideoPath)
  await page.getByRole('checkbox', { name: '我已确认这段视频只包含当前动作，主体清晰、完整，且基本符合拍摄要求。' }).check()
  await page.getByRole('button', { name: '上传并粗扫片段' }).click()

  await expect(page.getByRole('heading', { name: '选择要分析的挥拍片段' })).toBeVisible()
  await expect(page.getByText('系统推荐')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认片段并开始分析' })).toBeEnabled()
  await page.getByRole('button', { name: '确认片段并开始分析' }).click()

  await expect(page).toHaveURL(/\/processing$/)
  await expect(page.getByRole('heading', { name: '当前任务：正手高远球' })).toBeVisible()
  await expect(page.getByText('当前文件')).toBeVisible()
  await expect(page.getByText('valid-clear.mp4')).toBeVisible()
  await expect(page.getByText('分析片段')).toBeVisible()
  await expect(page.getByText('segment-02')).toBeVisible()
  await expect(page.getByRole('heading', { name: '分步骤反馈' })).toBeVisible()
  await expect(page.getByText('正在校验与抽帧')).toBeVisible()
})

test('粗扫后可轻量微调当前候选片段时间窗', async ({ page }) => {
  await mockApi(page)

  await page.goto('/upload')
  await page.setInputFiles('input[type="file"]', validVideoPath)
  await page.getByRole('checkbox', { name: '我已确认这段视频只包含当前动作，主体清晰、完整，且基本符合拍摄要求。' }).check()
  await page.getByRole('button', { name: '上传并粗扫片段' }).click()

  await expect(page.getByText('当前会送去精分析的时间窗：6.32s - 8.12s')).toBeVisible()
  await page.getByRole('button', { name: '起点提前' }).click()
  await expect(page.getByText('当前会送去精分析的时间窗：6.20s - 8.12s')).toBeVisible()
  await expect(page.getByText('已微调')).toBeVisible()
  await page.getByRole('button', { name: '恢复系统切段' }).click()
  await expect(page.getByText('当前会送去精分析的时间窗：6.32s - 8.12s')).toBeVisible()
})

test('首页切换到杀球后可进入对应上传与处理中链路', async ({ page }) => {
  const smashScenario = buildActionScenario('smash')
  await mockApi(page, {
    ...smashScenario,
    currentTaskStatus: smashScenario.startTaskResponse,
  })

  await page.goto('/')

  await page.getByRole('tab', { name: '杀球' }).click()
  await expect(page.getByRole('link', { name: '开始分析杀球' })).toBeVisible()
  await expect(page.getByText('当前已正式开放杀球分析')).toBeVisible()

  await page.getByRole('link', { name: '开始分析杀球' }).click()
  await expect(page).toHaveURL(/\/guide$/)
  await expect(page.getByRole('heading', { name: '杀球拍摄重点' })).toBeVisible()

  await page.getByRole('link', { name: '我已了解，去上传' }).click()
  await expect(page).toHaveURL(/\/upload$/)
  await expect(page.getByText('杀球专项：优先保证身体加载、挥拍臂加载、击球候选到随挥这一整段都拍完整。')).toBeVisible()

  await page.setInputFiles('input[type="file"]', validVideoPath)
  await page.getByRole('checkbox', { name: '我已确认这段视频只包含当前动作，主体清晰、完整，且基本符合拍摄要求。' }).check()
  await expect(page.getByRole('button', { name: '上传并粗扫片段' })).toBeEnabled()
  await page.getByRole('button', { name: '上传并粗扫片段' }).click()
  await expect(page.getByRole('button', { name: '确认片段并开始分析' })).toBeEnabled()
  await page.getByRole('button', { name: '确认片段并开始分析' }).click()

  await expect(page).toHaveURL(/\/(processing|report)$/)
  await expect(page.getByRole('heading', { name: '当前任务：杀球' })).toBeVisible()
})
