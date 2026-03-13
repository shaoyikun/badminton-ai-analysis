# 羽毛球动作 AI 分析 H5 UI 设计系统

## 1. 设计目标

这套设计系统服务于首页、上传页、分析中页、报告页、历史记录页、复测对比页和错误状态页，统一移动端 H5 的视觉语言、组件规范和前端命名映射。

设计气质固定为：

- 运动科技感
- 专业教练反馈感
- 清晰、可信、轻量
- 面向普通运动用户，不做后台化、游戏化或医疗化表达

## 2. 品牌关键词

- 运动张力
- 教练式反馈
- 清晰可信
- 轻量专注
- 科技秩序
- 渐进提升
- 真实训练感

## 3. Foundations

### 3.1 配色

- `Color/Brand/Primary`: `#2F6BFF`
- `Color/Brand/PrimaryPressed`: `#214FD1`
- `Color/Brand/PrimarySoft`: `#EAF0FF`
- `Color/Accent/Blue`: `#5BB6FF`
- `Color/Accent/BlueSoft`: `#ECF8FF`
- `Color/Accent/Amber`: `#F7B249`
- `Color/State/Success`: `#1E9E68`
- `Color/State/Warning`: `#E8A23A`
- `Color/State/Error`: `#D85B52`
- `Color/State/Info`: `#2F7CF6`
- `Color/Bg/Page`: `#F5F8FF`
- `Color/Bg/Surface`: `#FFFFFF`
- `Color/Bg/SurfaceSubtle`: `#F1F5FF`
- `Color/Bg/SurfaceStrong`: `#E5ECFB`
- `Color/Border/Default`: `#DBE5F5`
- `Color/Border/Strong`: `#C6D3EB`
- `Color/Text/Primary`: `#14213D`
- `Color/Text/Secondary`: `#66758F`
- `Color/Text/Inverse`: `#FFFFFF`

### 3.2 字体

- 中文主字体：`SF Pro Display`, `PingFang SC`
- Android 回退：`MiSans`, `Noto Sans SC`
- 数字评分建议：`DIN Alternate`，无资源时回退到 `SF Pro Display Semibold`

标题层级：

- `Text/Heading/XL`: `28 / 36 / Semibold`
- `Text/Heading/L`: `24 / 32 / Semibold`
- `Text/Heading/M`: `20 / 28 / Semibold`
- `Text/Heading/S`: `16 / 24 / Semibold`

正文层级：

- `Text/Body/L`: `16 / 26 / Regular`
- `Text/Body/M`: `14 / 22 / Regular`
- `Text/Body/S`: `13 / 20 / Regular`

辅助层级：

- `Text/Label/M`: `12 / 18 / Medium`
- `Text/Label/S`: `11 / 16 / Medium`
- `Text/Caption`: `12 / 18 / Regular`

数字展示：

- `Text/Display/Score/L`: `40 / 44 / Semibold`
- `Text/Display/Score/M`: `28 / 32 / Semibold`

### 3.3 间距、圆角、阴影

- 基础单位：`4`
- 常用间距：`4 / 8 / 12 / 16 / 20 / 24 / 32`
- 页面边距：`16`
- 卡片内边距：`16`
- Hero 卡内边距：`20`
- 小圆角：`12`
- 标准圆角：`16`
- 大圆角：`24`
- 胶囊圆角：`999`
- 轻阴影：`0 8 24 rgba(21,35,30,0.06)`
- 浮层阴影：`0 16 40 rgba(21,35,30,0.10)`

## 4. 核心组件

- `Button/Primary/L`
- `Button/Secondary/L`
- `Button/Ghost/M`
- `Button/Danger/L`
- `Card/Surface/Default`
- `Card/SurfaceSubtle/Default`
- `Card/Hero/Default`
- `Card/Status/Default`
- `Tag/Action/Default`
- `Tag/State/Success`
- `ScoreBadge/Neutral`
- `ScoreBadge/Good`
- `ScoreBadge/Improve`
- `Progress/Step`
- `Progress/Inline`
- `Notice/Info`
- `Notice/Warning`
- `Notice/Error`
- `EmptyState/Default`
- `ErrorState/Default`
- `BottomCTA/Default`

## 5. 报告场景组件

- `Report/ScoreSummary`
- `Report/Conclusion`
- `Report/Issue/Primary`
- `Report/Issue/Secondary`
- `Report/Advice`
- `Report/HistoryCompare`

报告页遵循：

1. 一句话结论先于总评分
2. 核心问题先于其余问题
3. 复测关注点先于辅助评分
4. 历史基线要明确告诉用户“现在和谁比”

## 6. 前端映射

前端样式 token 通过 CSS 变量落在 `frontend/src/styles/tokens.scss` 与 `frontend/src/styles/globals.scss`，页面与组件默认使用 `*.module.scss`：

- `--color-brand-primary`
- `--color-brand-primary-pressed`
- `--color-brand-primary-soft`
- `--text` / `--muted`
- `--radius-sm` / `--radius-md` / `--radius-lg`
- `--shadow-soft` / `--shadow-float`

核心复用组件位于：

- `frontend/src/components/ui/BottomCTA.tsx`
- `frontend/src/components/ui/Notice.tsx`
- `frontend/src/components/ui/ScoreBadge.tsx`
- `frontend/src/components/ui/StepProgress.tsx`

组件库边界：

- 允许选择性使用 `antd-mobile`
- 当前主要用于移动端交互原件，例如 `Selector`、`Popup`
- 不允许用组件库默认主题接管品牌色、Hero 结论卡、报告区块和训练建议卡

设计系统预览页位于：

- `/design-system/foundations`
- `/design-system/components`

## 7. Figma 组织建议

- 页面 `00 Cover`
- 页面 `01 Foundations`
- 页面 `02 Components`
- 页面 `03 Report Patterns`
- 页面 `04 Mobile Templates`

样式分组：

- `Colors`
- `Text Styles`
- `Effects`
- `Grid`

变量分组：

- `color`
- `spacing`
- `radius`
- `shadow`

组件集分组：

- `Base`
- `Feedback`
- `Report`

## 8. 优先落地页面

最适合优先落地的 5 个页面：

1. 报告页
2. 上传页
3. 分析中页
4. 首页
5. 错误状态页
