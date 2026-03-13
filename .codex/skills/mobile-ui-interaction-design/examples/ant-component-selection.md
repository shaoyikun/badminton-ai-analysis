# Task

在上传流程、候选选择、分析中、结果页这些场景里，更科学地选择 `Ant Design` / `Ant Design Mobile` 组件。

# Before

- 页面里已经有自研组件和样式
- 新需求可能想手写更多控件
- 不确定该复用仓库组件还是直接上 Ant 组件

# Goal

优先用成熟组件提升一致性，但不让组件库接管整页品牌视觉和叙事。

# Recommended structure

- 上传流程：`Uploader` 或清晰的上传触发区 + `Notice` + `BottomCTA`
- 候选选择：`List`、单选卡片、`Tag`、状态标签
- 分析中：`Steps` / `Progress` 风格组件 + 当前步骤说明
- 结果页：Hero 自研，摘要卡和辅助列表可借鉴 `Card`、`Collapse`、`Result`

# Key implementation notes

- 先判断用户任务，再决定组件，不要先堆库组件
- `Selector`、`Popup`、`Dialog`、`Toast` 这类移动端原件优先从 `antd-mobile` 选
- Hero、品牌卡片、报告结论区继续优先走仓库自研模式
- 如果一个自研控件本质只是“按钮 + 状态 + 列表”，先问自己能不能用成熟组件替代

# Optional code sketch

```tsx
<Selector options={actionOptions} value={[actionType]} onChange={handleActionChange} />
<List>
  {segments.map((segment) => <SegmentListItem key={segment.id} segment={segment} />)}
</List>
<BottomCTA primary={{ label: '确认片段并开始分析', onClick: handleSubmit }} />
```
