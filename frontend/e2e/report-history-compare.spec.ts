import { expect, test } from '@playwright/test'
import {
  buildActionScenario,
  buildSessionSnapshot,
  comparisonHistoryTaskId,
  comparisonResponse,
  currentTaskId,
  uploadTaskResponse,
} from './support/data'
import { assertShellLayout, gotoWithSession } from './support/helpers'
import { mockApi } from './support/mockApi'

const reportPath = `/analyses/${currentTaskId}/report`
const comparePath = `/analyses/${currentTaskId}/comparison`
const uploadPath = '/analyses/new'

test('报告页回访加载成功', async ({ page }) => {
  await mockApi(page)

  await gotoWithSession(
    page,
    reportPath,
    buildSessionSnapshot({ latestCompletedTaskId: currentTaskId }),
  )

  await assertShellLayout(page, { hasTabs: true })
  await expect(page.getByRole('heading', { name: /本次基于 9\/9 帧稳定识别结果生成/ })).toBeVisible()
  await expect(page.getByText('总评分')).toBeVisible()
  await expect(page.getByRole('heading', { name: '关键证据' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '识别视角与候选片段' })).toBeVisible()
  await expect(page.getByText('当前分析片段')).toBeVisible()
  await expect(page.getByRole('button', { name: /segment-02 6\.32s - 8\.12s 当前分析/ })).toBeVisible()
  await expect(page.getByText('准备', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('引拍', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: '动作问题拆解' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '分维度评分' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '当前视角动作参考对照' })).toBeVisible()
  await expect(page.getByRole('link', { name: '再次测试' })).toHaveAttribute('href', uploadPath)
  await expect(page.getByRole('link', { name: '查看完整复测对比' })).toHaveAttribute('href', `/analyses/${currentTaskId}/comparison`)
})

test('杀球报告页回访时使用当前动作上下文', async ({ page }) => {
  const smashScenario = buildActionScenario('smash')
  await mockApi(page, smashScenario)

  await gotoWithSession(
    page,
    reportPath,
    buildSessionSnapshot({
      actionType: 'smash',
      latestCompletedTaskId: currentTaskId,
    }),
  )

  await expect(page.getByText('杀球报告')).toBeVisible()
  await expect(page.getByRole('heading', { name: /杀球样本已经完成正式分析/ })).toBeVisible()
})

test('报告页深链可直接打开', async ({ page }) => {
  await mockApi(page)

  await page.goto(reportPath)

  await expect(page.getByRole('heading', { name: /本次基于 9\/9 帧稳定识别结果生成/ })).toBeVisible()
})

test('再次测试回到上传页时清空上一次成功任务草稿', async ({ page }) => {
  await mockApi(page)

  await gotoWithSession(
    page,
    uploadPath,
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
  await assertShellLayout(page, { hasTabs: true })
  await page.getByRole('button', { name: /正手高远球 · 83 分/ }).first().click()

  const sheet = page.getByRole('dialog', { name: '历史样本详情' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('那次最核心的问题')).toBeVisible()
  await sheet.getByRole('button', { name: '设为当前基线并查看对比' }).click()

  await expect(page).toHaveURL(new RegExp(`/analyses/${currentTaskId}/comparison$`))
  await expect(page.getByText('当前基线').first()).toBeVisible()
  await expect(page.getByText('2026/3/12 22:14:51')).toBeVisible()
  await expect(page.getByText(comparisonResponse.comparison.summaryText)).toBeVisible()
  await expect(page.getByRole('link', { name: '返回本次报告' })).toHaveAttribute('href', reportPath)
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
  await expect(page.getByText('当前只展示 杀球 的历史样本和同动作复测基线。').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /杀球 ·/ }).first()).toBeVisible()
})

test('对比页空状态可恢复', async ({ page }) => {
  await mockApi(page, {
    comparison: {
      ...comparisonResponse,
      comparison: null,
    },
  })

  await gotoWithSession(page, comparePath, buildSessionSnapshot())

  await assertShellLayout(page, { hasTabs: false, requireScrollable: false })
  await expect(page.getByText('暂无对比')).toBeVisible()
  await expect(page.getByRole('link', { name: '去历史记录' })).toHaveAttribute('href', '/history')
  await expect(page.getByRole('link', { name: '继续上传' })).toHaveAttribute('href', uploadPath)
})

test('对比页有结果时展示复测结论', async ({ page }) => {
  await mockApi(page)

  await gotoWithSession(
    page,
    comparePath,
    buildSessionSnapshot({
      taskId: currentTaskId,
      latestCompletedTaskId: currentTaskId,
      selectedCompareTaskId: comparisonHistoryTaskId,
    }),
  )

  await expect(page.getByText('复测结论')).toBeVisible()
  await expect(page.getByRole('heading', { name: '这次先把关键动作收住' })).toBeVisible()
  await expect(page.getByText('参考分数变化')).toBeVisible()
  await expect(page.getByText('-1', { exact: true })).toBeVisible()
  await expect(page.getByText('引拍阶段比基线更需要回看。')).toBeVisible()
  await expect(page.getByRole('link', { name: '继续复测上传' })).toHaveAttribute('href', uploadPath)
  await expect(page.getByRole('link', { name: '返回本次报告' })).toHaveAttribute('href', reportPath)
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
    comparePath,
    buildSessionSnapshot({
      taskId: currentTaskId,
      latestCompletedTaskId: currentTaskId,
      selectedCompareTaskId: comparisonHistoryTaskId,
    }),
  )

  await expect(page.getByText('当前这次暂时不能直接和旧基线比较')).toBeVisible()
  await expect(page.getByText('评分模型已经升级')).toBeVisible()
})

test('独立选片页可从 session 草稿恢复', async ({ page }) => {
  await mockApi(page)

  await gotoWithSession(
    page,
    `/analyses/${uploadTaskResponse.taskId}/segments`,
    buildSessionSnapshot({
      taskId: uploadTaskResponse.taskId,
      segmentScan: uploadTaskResponse.segmentScan ?? null,
      selectedSegmentId: uploadTaskResponse.segmentScan?.selectedSegmentId ?? '',
      selectedSegmentWindow: uploadTaskResponse.segmentScan?.selectedSegmentWindow ?? null,
    }),
  )

  await expect(page.getByRole('heading', { name: '确认本次真正要分析的挥拍片段' })).toBeVisible()
  await expect(page.getByText('高级微调（可选）')).toBeVisible()
  await assertShellLayout(page, { hasTabs: false })
})
