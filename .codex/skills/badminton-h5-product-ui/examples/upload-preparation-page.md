# Task

把上传页的“选择文件 + 就绪检查 + 候选片段选择”做成更清晰的移动端产品页面。

# Before

- 当前上传页路由是 `/upload`
- 页面已经有动作切换、文件选择、就绪检查、候选片段卡片
- 真实主 CTA 分两步：`上传并粗扫片段`、`确认片段并开始分析`

# Goal

让用户在移动端更容易理解“先做什么、现在卡在哪里、下一步是什么”。

# Recommended structure

- 顶部保留动作类型与当前动作专项提醒
- 文件信息与就绪检查做成卡片
- 片段粗扫结果独立成选择区块
- CTA 永远固定在当前流程最后一步

# Key implementation notes

- 空态时先强调拍摄要求和文件选择，不要直接展示分析态文案
- 就绪检查要用“已完成/待检查/阻塞原因”表达，不要只显示红绿灯
- 片段卡片里要持续显示“系统推荐”和“当前选中”
- 切换动作时如果已有文件，要显式清空并提示重新选择

# Optional code sketch

```tsx
<ActionTypeSelector />
<UploadSummaryCard />
<ReadinessChecklist />
{segmentScan ? <SegmentSelectionCard /> : null}
<BottomCTA primary={{ label: ctaLabel, disabled: !canContinue }} />
```
