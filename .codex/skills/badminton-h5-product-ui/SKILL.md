---
name: badminton-h5-product-ui
description: Use when productizing or redesigning the mobile H5 experience in frontend/, especially the home, guide, upload, processing, report, history, compare, and error pages for the badminton analysis flow.
---

# Badminton H5 Product UI

## 何时使用

当任务聚焦于移动端 H5 页面体验时使用：

- 首页、拍摄指引、上传、分析中、报告、历史、复测对比、错误页改造
- 调试式页面转产品式页面
- 移动端信息层级、CTA、空态/加载态/失败态优化
- 页面拆分、卡片化、底部 CTA、状态组件复用

## 先读什么

真实页面与路由在 `frontend/src/`：

- 路由：`frontend/src/app/AppRouter.tsx`
- 页面：`frontend/src/features/home/`、`frontend/src/features/guide/`、`frontend/src/features/upload/`、`frontend/src/features/processing/`、`frontend/src/features/report/`、`frontend/src/features/history/`、`frontend/src/features/compare/`、`frontend/src/features/error/`
- 壳层：`frontend/src/app/MobileAppShell.tsx`
- 共享 UI：`frontend/src/components/ui/`

当前前端不是空壳，已经具备真实产品骨架：

- 路由为 `/`、`/guide`、`/analyses/new`、`/analyses/:taskId/processing`、`/analyses/:taskId/report`、`/history`、`/analyses/:taskId/comparison`、`/error`
- 上传页已经是“两步式”：上传并粗扫片段 -> 选择片段 -> 开始分析
- Playwright 默认按移动端 viewport 跑主流程
- 页面与组件默认使用 `*.module.scss`，共享 token 在 `frontend/src/styles/`
- `antd-mobile` 只允许选择性承接移动端交互原件，不接管页面视觉和品牌叙事

## 工作顺序/决策顺序

1. 先确认你改的是信息层级、文案、布局、状态覆盖还是页面拆分，不要一上来就重排 JSX。
2. 先读目标页面与已有 UI 组件，再决定是复用组件、抽 section component，还是补新的 feature helper。
3. 页面叙事先围绕真实产品能力重写，再映射到已有状态对象；不要让 UI 直接背负后端字段含义。
4. 如果页面逻辑已经开始吞掉状态推导、文案映射和数据整形，先抽 adapter/helper 再继续加 UI。
5. 交付时明确主 CTA、信息层级、状态覆盖和组件复用点，而不是只描述“视觉更好了”。

## 核心规则

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
7. 新增样式默认写到 `*.module.scss`，只把 token、reset 和极少量基础布局留在 `globals.scss`。
8. 选择性使用 `antd-mobile` 时，只用它解决移动端交互原件，例如 `Selector`、`Popup`、`Dialog`、`Toast`；Hero 卡、报告卡、历史卡和训练建议卡继续自研。
9. 文案要反映当前真实能力边界：
   - 支持 `clear | smash`
   - 候选片段粗扫是已有能力
   - 报告是“问题解释 + 复测建议”，不是实时教练系统
10. 复用优先：先复用现有 UI 组件、feature helper、adapter 和布局模式，再考虑新增组件。
11. 模块拆分优先：复杂页面应拆成 section component、文案映射 helper、卡片组件和 adapter，不要让单个页面文件同时承担所有逻辑。
12. 文件体量控制：
   - frontend page/provider/component 通常接近 250 行就要考虑拆分
   - shared adapter/formatter/helper 超过约 200 行应按职责拆分
13. `UploadPage` 这类大文件是待拆债务，不是模板。新增 UI 逻辑优先向子组件、helper 或 adapter 外抽。
14. 不要为了美化页面绕过当前数据流；需要新视图模型时，先配合 `shared-contracts-and-adapters` 处理映射。

## 何时联动其他 skills

- `mobile-ui-interaction-design`：需要主动做交互体检、组件选型校正、截图 review 或结构化自评时
- `badminton-analysis-flow`：页面改动涉及上传粗扫、片段选择、处理中状态流转
- `shared-contracts-and-adapters`：报告、历史、进度需要前端 view model
- `badminton-playwright-mobile-qa`：产品化改动需要补移动端 E2E
- `docs-spec-sync`：页面结构和交互层级发生显著变化

## 何时读取 examples/

在确认页面目标后再读对应 example：

- `examples/homepage-productization.md`：首页叙事、CTA、入口层级变化时读
- `examples/upload-preparation-page.md`：上传准备、提示、候选片段前置说明变化时读
- `examples/report-page-productization.md`：报告页产品化和模块化展示变化时读

## 任务完成后的输出要求

最终交付说明至少要写清：

- 改的是哪一页、主 CTA 或信息层级怎么变了
- 是否新增或复用了哪些 UI 组件
- 对空态、加载态、失败态做了哪些覆盖
