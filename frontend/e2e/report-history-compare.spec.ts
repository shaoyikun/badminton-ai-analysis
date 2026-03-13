import { expect, test } from '@playwright/test'
import {
  buildActionScenario,
  buildSessionSnapshot,
  comparisonHistoryTaskId,
  comparisonResponse,
  currentTaskId,
} from './support/data'
import { gotoWithSession } from './support/helpers'
import { mockApi } from './support/mockApi'

test('报告页回访加载成功', async ({ page }) => {
  await mockApi(page)

  await gotoWithSession(
    page,
    '/report',
    buildSessionSnapshot({ latestCompletedTaskId: currentTaskId }),
  )

  await expect(page.getByRole('heading', { name: /本次基于 9\/9 帧稳定识别结果生成/ })).toBeVisible()
  await expect(page.getByText('总评分')).toBeVisible()
  await expect(page.getByRole('heading', { name: '识别信息' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '动作阶段拆解' })).toBeVisible()
  const phaseCard = page.locator('.phase-breakdown-card')
  await expect(phaseCard.getByText(/^准备$/)).toBeVisible()
  await expect(phaseCard.getByText(/^引拍$/)).toBeVisible()
  await expect(page.getByRole('heading', { name: '骨架识别图' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '动作问题拆解' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '分维度评分' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '当前视角动作参考对照' })).toBeVisible()
  await expect(page.getByRole('link', { name: '再次测试' })).toHaveAttribute('href', '/upload')
  await expect(page.getByRole('link', { name: '查看历史' })).toHaveAttribute('href', '/history')
})

test('杀球报告页回访时使用当前动作上下文', async ({ page }) => {
  const smashScenario = buildActionScenario('smash')
  await mockApi(page, smashScenario)

  await gotoWithSession(
    page,
    '/report',
    buildSessionSnapshot({
      actionType: 'smash',
      latestCompletedTaskId: currentTaskId,
    }),
  )

  await expect(page.locator('.badge.badge-inverse').getByText('杀球', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /杀球样本已经完成正式分析/ })).toBeVisible()
})

test('报告页无会话保护', async ({ page }) => {
  await mockApi(page)

  await page.goto('/report')

  await expect(page).toHaveURL(/\/upload$/)
  await expect(page.getByRole('heading', { name: '上传视频' })).toBeVisible()
})

test('再次测试回到上传页时清空上一次成功任务草稿', async ({ page }) => {
  await mockApi(page)

  await gotoWithSession(
    page,
    '/upload',
    buildSessionSnapshot({
      taskId: currentTaskId,
      latestCompletedTaskId: currentTaskId,
      selectedVideoSummary: {
        fileName: 'last-success.mp4',
        fileSizeBytes: 12 * 1024 * 1024,
        mimeType: 'video/mp4',
        extension: '.mp4',
        durationSeconds: 9,
      },
    }),
  )

  await expect(page.getByText('last-success.mp4')).toHaveCount(0)
  await expect(page.getByText('上次尝试的视频')).toHaveCount(0)
  await expect(page.getByRole('checkbox')).not.toBeChecked()
})

test('历史页详情与基线切换', async ({ page }) => {
  await mockApi(page)

  await gotoWithSession(
    page,
    '/history',
    buildSessionSnapshot({
      latestCompletedTaskId: currentTaskId,
    }),
  )

  await expect(page.getByRole('heading', { name: '历史列表' })).toBeVisible()
  await page.getByRole('button', { name: /正手高远球 · 88 分/ }).first().click()

  await expect(page.getByText('历史样本详情')).toBeVisible()
  await expect(page.getByText('那次最核心的问题')).toBeVisible()
  await page.getByRole('button', { name: '设为当前基线并查看对比' }).click()

  await expect(page).toHaveURL(/\/compare$/)
  await expect(page.getByText('当前基线')).toBeVisible()
  await expect(page.getByText('2026/3/13 00:22:29')).toBeVisible()
  await expect(page.getByText(comparisonResponse.comparison.summaryText)).toBeVisible()
  await expect(page.getByRole('link', { name: '返回本次报告' })).toHaveAttribute('href', '/report')
})

test('历史页切到杀球时只展示杀球动作语境', async ({ page }) => {
  const smashScenario = buildActionScenario('smash')
  await mockApi(page, smashScenario)

  await gotoWithSession(
    page,
    '/history',
    buildSessionSnapshot({
      actionType: 'smash',
      latestCompletedTaskId: currentTaskId,
    }),
  )

  await expect(page.getByRole('heading', { name: '杀球历史样本' })).toBeVisible()
  await expect(page.getByText(/当前只展示.*杀球.*历史样本和同动作复测基线/)).toBeVisible()
  await expect(page.getByRole('button', { name: /杀球 ·/ }).first()).toBeVisible()
})

test('对比页空状态可恢复', async ({ page }) => {
  await mockApi(page)

  await gotoWithSession(page, '/compare', buildSessionSnapshot())

  await expect(page.getByText('暂无对比')).toBeVisible()
  await expect(page.getByRole('link', { name: '去历史记录' })).toHaveAttribute('href', '/history')
  await expect(page.getByRole('link', { name: '继续上传' })).toHaveAttribute('href', '/upload')
})

test('对比页有结果时展示复测结论', async ({ page }) => {
  await mockApi(page)

  await gotoWithSession(
    page,
    '/compare',
    buildSessionSnapshot({
      taskId: currentTaskId,
      latestCompletedTaskId: currentTaskId,
      selectedCompareTaskId: comparisonHistoryTaskId,
    }),
  )

  await expect(page.getByText('复测结论')).toBeVisible()
  await expect(page.getByRole('heading', { name: '这次先把关键动作收住' })).toBeVisible()
  await expect(page.getByText('参考分数变化')).toBeVisible()
  await expect(page.getByText('-1')).toBeVisible()
  await expect(page.getByText('引拍阶段比基线更需要回看。')).toBeVisible()
  await expect(page.getByRole('link', { name: '继续复测上传' })).toHaveAttribute('href', '/upload')
  await expect(page.getByRole('link', { name: '更换对比基线' })).toHaveAttribute('href', '/history')
})

test('对比页在模型升级时展示不可比提示', async ({ page }) => {
  await mockApi(page, {
    comparison: {
      ...comparisonResponse,
      comparison: null,
      unavailableReason: 'scoring_model_mismatch',
    },
  })

  await gotoWithSession(
    page,
    '/compare',
    buildSessionSnapshot({
      taskId: currentTaskId,
      latestCompletedTaskId: currentTaskId,
      selectedCompareTaskId: comparisonHistoryTaskId,
    }),
  )

  await expect(page.getByText('当前这次暂时不能直接和旧基线比较')).toBeVisible()
  await expect(page.getByText('评分模型已经升级')).toBeVisible()
})
