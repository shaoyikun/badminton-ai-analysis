# Task

完成页面改动后，结合页面截图或 Playwright 截图继续做 UI review，并把问题落回代码修正。

# Before

- 页面逻辑和交互已经实现
- 可以拿到浏览器截图、Playwright 截图或视觉快照
- 代码看起来没问题，但实际布局质量还不确定

# Goal

用截图复核首屏、层级、留白、按钮突出度和移动端观感，而不是只靠代码想象。

# Recommended structure

- 第一步：截取首屏和关键状态页
- 第二步：按 CTA、层级、留白、拥挤度逐项 review
- 第三步：记录“问题点 -> 修正建议”
- 第四步：回到代码继续修
- 第五步：再做一次简短截图复核

# Key implementation notes

- 首先看主 CTA 是否被淹没，其次看首屏是否说清页面目的
- 再检查卡片、标题、说明之间是否过密或顺序混乱
- 弹窗和底部操作区要特别看是否拥挤、按钮是否过小
- 截图里发现明显问题时，不要以“代码已经实现”为理由停止

# Optional code sketch

```tsx
const reviewNotes = [
  '首屏说明过长，CTA 被挤到折叠下方',
  '状态提示和正文贴得太近',
]

return <PageAfterPolish />
```
