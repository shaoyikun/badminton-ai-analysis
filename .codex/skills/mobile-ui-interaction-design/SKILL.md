---
name: mobile-ui-interaction-design
description: Use this skill when working on frontend views, page interaction, component selection, mobile UX improvements, or productizing rough/demo-like UI. Prefer mature Ant Design / Ant Design Mobile components where appropriate. When the task touches UI, proactively review the current interaction, optimize it if needed, and use screenshots or Playwright screenshots for UI review when available. If visual judgment is subjective, reference mature open-source projects or mainstream mobile app patterns instead of inventing unusual interactions.
---

# Mobile UI Interaction Design

## 何时使用

当任务涉及前端视图、页面布局、组件结构、交互流程、样式表现时使用：

- 新增页面或新 section
- 修改页面布局、首屏结构、信息层级或 CTA
- 重构上传流程、步骤流、候选选择、结果页、错误恢复
- 调整弹窗、表单、列表、卡片、导航、底部操作区
- 任何涉及“前端视图”的代码改动，而不只是纯数据层改动
- 页面看起来不协调、不像产品、交互不顺畅，或明显还停留在 demo 味
- 可以拿到页面截图、Playwright 截图、视觉快照的 review 场景
- 需要参考成熟开源项目或主流移动端产品交互模式的场景

如果任务已经明确是移动端 H5 页面产品化，先联动 `badminton-h5-product-ui`；本 skill 负责在那个基础上进一步做交互体检、组件选型校正、截图 review 和自评闭环。

## 仓库上下文

这个仓库的前端不是通用 Web 后台，而是移动端 H5 训练产品：

- 技术栈是 `React 19 + Vite + react-router-dom`
- 页面默认走移动端单列结构，路由和页面在 `frontend/src/app/` 与 `frontend/src/features/`
- 样式默认采用 `*.module.scss`，共享 token 在 `frontend/src/styles/tokens.scss`，全局基础样式在 `frontend/src/styles/globals.scss`
- 页面公共壳层和内容骨架已经存在，例如 `MobileAppShell`、`PageLayout.module.scss`
- 仓库里已经有稳定复用的 UI 原件：`BottomCTA`、`Notice`、`EmptyState`、`StatusPill`、`StepProgress`
- `antd-mobile` 已经被选择性接入，当前用于 `Selector`、`Popup` 这类移动端交互原件；品牌视觉、Hero、报告卡片和训练叙事仍然以仓库自研组件为主

当前前端的典型风险不是“完全没 UI”，而是：

- 页面已经有产品骨架，但局部改动时容易只修字面需求，忽略整体交互顺序
- 大页面例如上传页、报告页容易继续堆逻辑，导致结构松散、状态反馈不完整
- 某些控件和卡片是自研组合，若不主动复盘，容易出现组件选择不一致、触达区不舒服、说明文案像调试页
- 页面可能满足业务逻辑，却仍然存在 CTA 不明显、首屏不清晰、分组拥挤、空态/失败态缺失等“看起来像 demo”问题

## 先读什么

开始改 UI 前，优先读真实真源而不是凭印象设计：

- `frontend/README.md`
- `docs/design/INTERACTION-DESIGN.md`
- `docs/design/WIREFRAMES.md`
- `docs/design/UI-DESIGN-SYSTEM.md`
- 当前目标页面对应的 `frontend/src/features/*Page.tsx`
- 相关共享 UI 组件：`frontend/src/components/ui/`

如果任务带截图、Playwright 截图、视觉快照，也把它们当成一等输入，不要只读代码。

## 默认工作顺序

1. 先读目标页面、共享 UI、设计文档，确认页面目标、主 CTA、状态和真实路由承接。
2. 不按字面直接改代码，先诊断当前交互是否存在明显问题。
3. 根据任务模式选择成熟组件和页面结构，再决定是否拆 section component、adapter 或状态 helper。
4. 实现时优先保持页面容器、状态逻辑、展示组件职责分离。
5. 如果拿得到截图或 Playwright 视觉快照，做一轮 UI review；发现明显问题就继续修。
6. 输出前必须做一轮结构化 UI 自评。
7. 自评若发现明显问题，先修正一轮，再给最终结果。

## 核心规则

### A. 触发前端视图修改时，主动识别并优化交互

只要任务涉及视图、页面、组件、交互、样式，不要只按用户点名的那一小块机械修改。

先判断当前交互是否存在以下明显问题：

- 页面目标是否清晰，用户是否一眼知道“这页是干什么的”
- 信息层级是否混乱，标题、说明、卡片和状态是否挤成一团
- 主 CTA 是否不明显，或和次操作竞争注意力
- 状态是否缺失，用户是否知道当前卡在哪里、下一步是什么
- 是否存在反直觉交互，例如奇怪的确认方式、难以理解的流程顺序
- 是否有不必要的复杂布局、过密分栏、过度装饰或像后台系统的交互

如果发现当前交互明显不合理，应把必要的顺手优化一起做掉，而不是只改用户提到的单点。

### B. 优先复用成熟组件

在涉及前端视图时，优先考虑 `Ant Design` 或 `Ant Design Mobile` 的成熟交互原件，以及仓库里已有的稳定 UI 组件。

优先考虑这些成熟组件是否更合适：

- `Button`
- `Card`
- `List`
- `Tabs`
- `Modal`
- `Popup`
- `Dialog`
- `Form`
- `Picker`
- `Progress`
- `Result`
- `Empty`
- `Skeleton`
- `Toast`
- `Tag`
- `Steps`
- `Collapse`
- `Uploader`

同时优先复用仓库自带模式：

- `BottomCTA`
- `Notice`
- `EmptyState`
- `StatusPill`
- `StepProgress`

不要为了“特别”而手搓复杂但体验差的控件。组件选型必须解释“为什么它更贴合当前任务心智”，而不是盲目堆组件。

### C. 移动端优先

这个仓库是移动端 H5，不是桌面后台。

默认遵循：

- 优先单列布局
- 触控区域足够大，避免小字链接承担主操作
- 主操作尽量固定在用户容易触达的位置，例如底部 CTA
- 弹窗、底部操作区、表单、列表、结果页要符合移动端手势和滚动习惯
- 不要生成像后台管理台、多列表格、桌面网页一样的交互

### D. 页面交互必须像真实产品，不像 demo

每个页面都必须让用户知道：

- 当前页面是什么
- 用户现在该做什么
- 下一步会发生什么

因此要明确：

- 标题、副标题、说明、状态提示、警示信息的层级
- 主 CTA 与次 CTA 的关系
- 用户可执行的下一步

避免：

- 直接暴露技术字段、内部状态码、调试口吻
- 无意义动画和无解释的视觉堆砌
- 看起来像“字段渲染页”或“工程调试页”的布局

### E. 组件选择要科学

先判断用户任务，再选组件，不要先有组件后找场景。

常见判断方式：

- 上传流程：优先 `Uploader`、清晰的就绪检查卡、底部 CTA，而不是自造复杂上传控件
- 候选选择：优先使用列表、单选、分组卡片、标签和明确的“推荐/已选中”反馈
- 分析中：优先使用步骤流、进度反馈、说明文案，而不是空转动效
- 报告页：优先用 Hero、结果摘要、分组卡片、`Result` 风格总结，而不是把全部字段平铺
- 错误恢复：优先明确错误说明 + 唯一下一步，而不是把失败信息埋在角落

不要使用少见、奇怪、需要学习成本的交互模式。

### F. 状态必须完整

每个关键页面和组件都要检查：

- `empty`
- `loading`
- `success`
- `error`

失败态必须给下一步动作，不能只有报错文字。默认不允许只实现 happy path。

### G. 文案产品化

文案要简洁、清晰、可操作。

要求：

- 优先用用户能理解的话表达系统状态
- 避免开发调试口吻、接口字段直出、含糊短语
- 标题讲页面任务，说明讲原因，状态文案讲下一步

## 截图驱动的 UI review 机制

如果任务可以获取页面截图、Playwright 截图、视觉快照，则优先结合截图进行 review，而不是只看代码逻辑。

review 时不要只检查“功能通不通”，还要逐项看：

- 首屏是否清晰，是否能快速理解页面目的
- 主 CTA 是否突出，是否被次要内容淹没
- 卡片、列表、标题、说明是否挤在一起
- 留白是否合理，是否有明显过密或过空
- 弹窗是否拥挤，是否像桌面弹窗硬塞到手机里
- 重要信息是否被淹没在弱层级内容中
- 页面是否像真实移动端产品，而不是 demo 页面

如果从截图中发现明显问题，应继续修正 UI，而不是直接结束任务。

默认闭环：

1. 实现页面或交互改动
2. 获取页面截图或 Playwright 截图
3. 记录“问题点 -> 修正建议”
4. 回到代码继续修
5. 再做一次简短复核

当任务明确涉及截图验证或页面 review 时，联动 `badminton-playwright-mobile-qa` 获取稳定的页面验证与截图承接。

## 参考开源项目 / 主流模式机制

当页面是否“好看”或“合理”带有主观性时，不要凭空臆想，也不要发明少见交互。

优先参考：

- 成熟开源项目中的相似页面模式
- 主流移动端 App 的常见交互结构
- 通用设计系统中成熟的控件用法

重点学习：

- 信息层级
- 页面结构
- 主操作位置
- 列表和卡片的组织方式
- 结果页与表单页的布局模式

不要求抄视觉风格，但要借鉴成熟交互范式。

如果采用了参考模式，最终总结时要说明：

- 参考了哪一类交互模式
- 为什么它适合当前页面
- 哪些地方做了本仓库语境下的调整

## 结构化自评与二次修正

每次涉及 UI / 视图 / 样式 / 交互的改动后，不能直接结束，必须做一轮“UI 交互自评”。

自评必须使用结构化 rubric，而不是一句“看起来不错”：

- 信息层级是否清楚
- 主 CTA 是否明显
- 首屏是否能快速理解页面目的
- 是否符合移动端单手操作习惯
- 组件选择是否成熟、统一、合理
- 是否存在奇怪、不常见、反直觉的交互
- 页面是否过于像 demo 或调试页
- 留白、分组、标题层级是否协调
- `loading / empty / error / success` 是否完整
- 文案是否像真实产品
- 如果结合截图，截图中的布局和重点是否清晰
- 如果参考了开源项目，该参考是否真正适配当前页面

输出前至少明确：

- 通过项
- 仍有风险的项
- 已额外修正的一轮内容

如果 rubric 发现明显问题，先修正一轮，再输出结果。

## 推荐代码组织方式

前端交互改动默认遵循：

- 页面容器与展示组件分离
- 状态逻辑与 UI 展示分离
- 复杂交互流程拆为独立组件
- 不要把页面、状态、样式、接口调用全部塞在一个文件里
- 如果引入 `Ant Design` / `Ant Design Mobile` 组件，要注意封装边界和整体风格统一

遇到这个仓库里的大页面，尤其要警惕继续向单文件堆 JSX、状态推导和文案分支；优先抽 section component、helper、adapter 或 flow-specific 子组件。

## 与其他 skills 的协作边界

- `badminton-h5-product-ui`：负责移动端 H5 页面产品化、页面目标、主 CTA、版式和已有页面模式；本 skill 在其基础上补充交互诊断、截图 review、自评闭环和组件选型质量
- `badminton-analysis-flow`：当任务涉及前端异步流程状态机、上传粗扫、片段确认、处理中状态流转时联动
- `badminton-playwright-mobile-qa`：当任务涉及 Playwright 页面验证、视觉快照、截图复核或需要稳定 UI 验证时联动
- `docs-spec-sync`：当页面结构、交互规则、状态口径变化需要同步 `docs/` 或 `spec/` 时联动

本 skill 重点解决的是：

- 页面交互设计质量
- 组件选型质量
- 视图 review 质量
- 最终交付前的自评与修正闭环

## 何时读取 examples/

根据任务类型按需读取：

- `examples/page-structure-refactor.md`：页面像 demo、结构拥挤、CTA 不清晰时
- `examples/ant-component-selection.md`：需要判断是否引入 Ant / Ant Mobile 组件，以及怎么选时
- `examples/screenshot-review-and-polish.md`：拿得到截图、需要做 review 闭环时
- `examples/mobile-interaction-self-review.md`：实现完页面后要做结构化自评时
- `examples/open-source-ui-reference.md`：交互判断主观性较强、需要参考成熟模式时

## 任务完成后的输出要求

最终交付说明至少要写清：

- 使用了哪些关键组件，为什么这么选
- 哪些交互是主动识别并顺手优化的
- 是否使用了截图 / Playwright 截图做 review
- 如果用了截图，发现了哪些问题，又修正了哪些点
- 是否参考了开源项目或主流产品模式
- 自评 rubric 的结果
- 自评后又修正了哪些地方
- 还剩哪些点需要人工设计师或产品判断进一步确认
