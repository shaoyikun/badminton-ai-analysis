# Task

为上传页补一条候选片段选择 E2E，覆盖“上传并粗扫片段 -> 选择片段 -> 确认开始分析”。

# Before

- 当前真实页面已支持候选片段卡片
- mock API 可以返回 `segmentScan`
- `home-and-upload.spec.ts` 已有类似流程基础

# Goal

验证用户能看见推荐片段、切换片段并进入 `/analyses/:taskId/processing`。

# Recommended structure

- mock 上传接口返回 `segmentScan`
- `page.goto('/analyses/new')`
- 上传 fixture 视频并勾选确认项
- 点击 `上传并粗扫片段`
- 断言片段选择标题、推荐标签、确认 CTA

# Key implementation notes

- 断言“系统推荐”“当前选中”“segment-02”这类用户可见线索
- 若切换片段能力存在，断言当前选中状态真的变化
- 最终断言进入 `/analyses/:taskId/processing`，且页面显示 `分析片段`
- 不要去断言 provider 内部 state 或具体 className

# Optional code sketch

```ts
await page.getByRole('button', { name: '上传并粗扫片段' }).click()
await expect(page.getByRole('heading', { name: '选择要分析的挥拍片段' })).toBeVisible()
await page.getByRole('button', { name: '确认片段并开始分析' }).click()
```
