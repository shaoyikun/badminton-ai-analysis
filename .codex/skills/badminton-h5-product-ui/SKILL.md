---
name: badminton-h5-product-ui
description: Use when productizing or redesigning the mobile H5 experience in frontend/, especially the home, guide, upload, processing, report, history, compare, and error pages for the badminton analysis flow.
---

# 何时使用这个 skill

当任务聚焦于移动端 H5 页面体验时使用：

- 首页、拍摄指引、上传、分析中、报告、历史、复测对比、错误页改造
- 调试式页面转产品式页面
- 移动端信息层级、CTA、空态/加载态/失败态优化
- 页面拆分、卡片化、底部 CTA、状态组件复用

# 仓库背景与上下文

真实页面与路由在 `frontend/src/`：

- 路由：`frontend/src/app/AppRouter.tsx`
- 页面：`frontend/src/features/home/`、`guide/`、`upload/`、`processing/`、`report/`、`history/`、`compare/`、`error/`
- 壳层：`frontend/src/app/MobileAppShell.tsx`
- 共享 UI：`frontend/src/components/ui/`

当前前端不是空壳，已经具备真实产品骨架：

- 路由为 `/`、`/guide`、`/upload`、`/processing`、`/report`、`/history`、`/compare`、`/error`
- 上传页已经是“两步式”：上传并粗扫片段 -> 选择片段 -> 开始分析
- Playwright 默认按移动端 viewport 跑主流程

# 核心规则

1. 先读这些文件再改 UI：
   - `frontend/README.md`
   - `docs/design/INTERACTION-DESIGN.md`
   - `docs/design/WIREFRAMES.md`
   - 当前目标页面对应的 `frontend/src/features/*Page.tsx`
2. 默认采用移动端单列布局，避免桌面信息密度和多栏布局。
3. 页面主叙事必须是产品语言，不要把联调词汇、内部错误、原始字段直接暴露给用户。
4. 每页只保留一个主 CTA：
   - 首页：开始分析当前动作
   - 上传页：上传并粗扫片段 / 确认片段并开始分析
   - 报告页：再次测试
5. 状态必须成套处理：
   - 空态
   - 加载/处理中
   - 成功完成
   - 失败/可恢复
6. 组件优先沿用现有模式：
   - `BottomCTA`
   - `Notice`
   - `EmptyState`
   - `StatusPill`
   - `StepProgress`
7. 文案要反映当前真实能力边界：
   - 支持 `clear | smash`
   - 候选片段粗扫是已有能力
   - 报告是“问题解释 + 复测建议”，不是实时教练系统
8. 不要为了美化页面绕过当前数据流；需要新视图模型时，先配合 `shared-contracts-and-adapters` 处理映射。

# 推荐代码组织方式

- 路由级页面容器继续放在 `frontend/src/features/*Page.tsx`
- 页面内复杂区块拆到 `frontend/src/components/` 或 feature 子组件
- 用户可见的文案、标签、状态说明集中在页面/feature 层，不把后端原始字段直接塞进 JSX
- 需要共享的卡片、徽标、底部操作条，优先补到 `frontend/src/components/ui/`

# 与其他 skills 的协作边界

- 与 `badminton-analysis-flow` 联动：当页面改动涉及上传粗扫、片段选择、处理中状态流转
- 与 `shared-contracts-and-adapters` 联动：当报告、历史、进度需要前端 view model
- 与 `badminton-playwright-mobile-qa` 联动：当产品化改动需要补移动端 E2E
- 与 `docs-spec-sync` 联动：当页面结构和交互层级发生显著变化时

# 任务完成后的输出要求

最终交付说明至少要写清：

- 改的是哪一页、主 CTA 或信息层级怎么变了
- 是否新增或复用了哪些 UI 组件
- 对空态、加载态、失败态做了哪些覆盖
- 跑了哪些前端验证；如果没跑 Playwright，要明确说明
