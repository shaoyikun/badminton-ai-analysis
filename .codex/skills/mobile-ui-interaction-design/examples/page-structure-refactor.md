# Task

把一个 demo 味很重、信息堆砌、按钮不清晰的页面，改造成更像真实移动端 App 的页面。

# Before

- 页面已经能渲染功能，但首屏没有重点
- 说明、数据、按钮堆在同一层
- CTA 不明确，用户不知道先点哪里

# Goal

让页面先讲清任务，再按卡片分组信息，并把主 CTA 放到用户容易理解和触达的位置。

# Recommended structure

- 顶部 Hero / 页面标题区：页面目的、一句话说明、当前状态
- 中部信息卡片分组：关键摘要、辅助说明、风险提示分开
- 底部主 CTA：只保留一个主动作，次动作弱化
- 状态反馈区：空态、加载态、失败态都能给下一步

# Key implementation notes

- 优先复用 `BottomCTA`、`Notice`、`EmptyState` 这类已有模式
- Hero 不要塞太多字段，首屏只讲当前页面任务
- 卡片分组按“先看什么、再看什么”组织，不按接口字段组织
- 如果用 Ant 组件，优先 `Card`、`List`、`Result` 这种成熟模式，不要自造怪布局

# Optional code sketch

```tsx
<HeroSection />
<SummaryCard />
<Notice tone="info" title="上传建议">先确认时长和机位，再开始下一步。</Notice>
<BottomCTA primary={{ label: '开始分析', onClick: handleStart }} />
```
