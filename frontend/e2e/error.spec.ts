import { expect, test } from '@playwright/test'
import { buildSessionSnapshot } from './support/data'
import { gotoWithSession } from './support/helpers'
import { mockApi } from './support/mockApi'

test('错误页无上下文时展示空状态', async ({ page }) => {
  await mockApi(page)

  await gotoWithSession(page, '/error', buildSessionSnapshot())

  await expect(page.getByText('无错误上下文')).toBeVisible()
  await expect(page.getByRole('link', { name: '去上传' })).toHaveAttribute('href', '/upload')
  await expect(page.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/')
})

test('错误页带恢复建议时展示主次 CTA', async ({ page }) => {
  await mockApi(page)

  await gotoWithSession(
    page,
    '/error',
    buildSessionSnapshot({
      errorState: {
        errorCode: 'poor_lighting_or_occlusion',
        title: '画面质量不足',
        summary: '光线、清晰度或遮挡影响了关键动作识别。',
        explanation: '当人物轮廓不清、画面过暗或关键部位被遮挡时，系统很难稳定抽取动作特征。',
        suggestions: [
          '换到光线更稳定的位置，避免逆光',
          '减少球网、围栏或其他人物对身体的遮挡',
          '确认手机镜头干净，拍摄时尽量保持稳定',
        ],
        uploadBanner: '上次失败是因为画面质量不足，建议先参考拍摄指引调整光线和遮挡。',
        primaryAction: 'guide',
        secondaryAction: 'upload',
      },
    }),
  )

  await expect(page.getByRole('heading', { name: '画面质量不足' })).toBeVisible()
  await expect(page.getByText('发生了什么')).toBeVisible()
  await expect(page.getByText('这次建议这样处理')).toBeVisible()
  await expect(page.getByRole('link', { name: '查看拍摄指引' })).toHaveAttribute('href', '/guide')
  await expect(page.getByRole('link', { name: '重新上传' })).toHaveAttribute('href', '/upload')
})
