# Task

为首页主漏斗补一条移动端 E2E，覆盖“首页 -> 拍摄指引 -> 上传页”。

# Before

- Playwright 默认项目是 `mobile-chromium`
- 测试已经在 `frontend/e2e/home-and-upload.spec.ts`
- mock API 可通过 `frontend/e2e/support/mockApi.ts` 注入

# Goal

验证首页 CTA、动作切换和路由跳转在移动端 viewport 下都可达。

# Recommended structure

- `await mockApi(page)`
- `page.goto('/')`
- 断言首页标题与主 CTA
- 点击 `开始分析当前动作`
- 断言进入 `/guide`，再进入 `/upload`

# Key implementation notes

- 选择器优先 `getByRole` + 中文按钮文案
- 断言用户能看见的标题与 CTA，不断言内部 state
- 如果首页支持动作切换，至少覆盖 `clear` 或 `smash` 中的一条主路径
- 改首页结构后，优先保住这条漏斗测试

# Optional code sketch

```ts
await mockApi(page)
await page.goto('/')
await page.getByRole('link', { name: '开始分析正手高远球' }).click()
await expect(page).toHaveURL(/\/guide$/)
```
