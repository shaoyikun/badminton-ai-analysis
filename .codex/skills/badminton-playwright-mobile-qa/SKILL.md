---
name: badminton-playwright-mobile-qa
description: Use when writing or updating mobile-first Playwright coverage for the badminton H5 flow, including home CTA, upload readiness, candidate clip selection, processing progress, report rendering, history, compare, and error recovery.
---

# 何时使用这个 skill

当任务涉及前端主流程自动化验证时使用：

- 新增或修改 Playwright E2E
- 验证首页到上传、候选片段选择、处理中、报告页渲染
- 调整 mock API、fixture 数据、移动端交互选择器

# 仓库背景与上下文

当前 Playwright 已经接入且是移动端优先，不需要从零搭建。先读：

- `frontend/playwright.config.ts`
- `frontend/e2e/home-and-upload.spec.ts`
- `frontend/e2e/processing.spec.ts`
- `frontend/e2e/report-history-compare.spec.ts`
- `frontend/e2e/error.spec.ts`
- `frontend/e2e/support/mockApi.ts`

真实约束：

- 默认项目是 `mobile-chromium`
- 使用 iPhone 13 viewport
- 测试自启 Vite dev server
- mock 覆盖 `/api` 与 `/artifacts`

# 核心规则

1. 先测真实用户路径，不测实现细节。
2. selector 优先级：
   - `getByRole`
   - 可读名称
   - 稳定 `testid`（只有在 role/name 不稳定时）
3. 默认优先 mock API，保持稳定与可重复，不把真实 backend 当 E2E 前提。
4. 测试要体现当前真实主流程：
   - 首页 CTA
   - 上传前就绪检查
   - 上传并粗扫片段
   - 用户确认候选片段
   - 处理中步骤反馈
   - 报告页/历史/对比页渲染
5. 当共享契约变化时，要同步更新：
   - `frontend/e2e/support/mockApi.ts`
   - fixtures
   - 断言文案或状态
6. 不要把 CSS 结构、类名、内部 state 当断言主目标。

# 推荐代码组织方式

- 主流程 spec 按页面或场景组织在 `frontend/e2e/*.spec.ts`
- 共享 mock 与数据构造继续放 `frontend/e2e/support/`
- 复杂场景优先新增 scenario builder，而不是在 spec 里内联巨大 JSON
- 页面断言围绕标题、CTA、状态文案、关键卡片展开

# 与其他 skills 的协作边界

- 与 `badminton-h5-product-ui` 联动：当页面产品化后需要补测试
- 与 `badminton-analysis-flow` 联动：当上传、选片、处理状态变化时
- 与 `shared-contracts-and-adapters` 联动：当 mock 数据需要跟共享契约同步时
- 与 `repo-delivery-baseline` 联动：当需要决定是否补跑整个前端测试路径时

# 任务完成后的输出要求

最终交付说明至少要写清：

- 新增或修改了哪些 Playwright 场景
- 覆盖的是哪条真实用户路径
- 是否更新了 mock API 或 fixtures
- 如果只做了局部验证，要明确哪些主流程还没覆盖
