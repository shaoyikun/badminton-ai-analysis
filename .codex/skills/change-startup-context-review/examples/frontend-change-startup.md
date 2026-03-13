# Task

修改前端页面结构、交互或组件表现，但不想和当前页面模式、路由或样式体系冲突。

# What to inspect first

- `README.md`
- `frontend/README.md`
- `frontend/src/app/AppRouter.tsx`
- 目标页面目录与相邻页面
- `frontend/src/components/ui/`
- `frontend/src/styles/`
- `frontend/e2e/fixtures/` 与 `frontend/e2e/support/mockApi.ts`
- 相关 `docs/design/` 与 `spec/INTERACTION-SPEC.md`

# What likely exists already

- 现有路由和深链模式
- `*.module.scss`、token、页面壳层
- `BottomCTA`、`Notice`、空态/状态组件
- 现有页面信息层级与移动端布局模式
- Playwright mobile-first mock 和 fixture

# Startup conclusion

当前前端已经有稳定路由、样式方案、公共 UI 组件和移动端 E2E 支撑。先复用目标页面周边的布局、CTA 和状态模式，再决定是否需要新增 section component 或 helper，不要直接新建一套平行 UI 模型。

# Implementation direction

- 先沿着目标路由找到现有页面和共享组件
- 优先扩展既有页面模式、样式 token、mock 数据和测试场景
- 如果页面逻辑开始堆状态映射，再联动 `shared-contracts-and-adapters` 或 `badminton-h5-product-ui`

# Common mistakes to avoid

- 跳过现有路由和页面模式，直接重搭页面
- 在页面里硬编码后端字段含义
- 新写一套和 `*.module.scss`、token 不一致的样式模式
- 忽略已有 Playwright mock，导致 UI 只在手工联调时成立
