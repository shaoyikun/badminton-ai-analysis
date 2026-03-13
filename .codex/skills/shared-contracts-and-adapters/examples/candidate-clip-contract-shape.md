# Task

为候选片段选择流补一个稳定契约，让 backend、frontend、mock 和文档都围绕同一个对象工作。

# Before

- 当前共享层已有 `SegmentScanSummary`、`SwingSegmentCandidate`
- 上传页和 mock API 都依赖这些对象
- 候选片段是当前仓库的重要真实能力，不是临时 UI 假数据

# Goal

让候选片段的共享结构足够稳定，既能服务前端展示，也不把页面细节写进 contracts。

# Recommended structure

- 共享层只保留候选片段元数据、推荐片段、已选片段、window 与检测来源
- 页面文案、标签、格式化文本在前端 adapter 层处理
- backend 统一把 preprocess 结果投影成共享对象

# Key implementation notes

- `segmentId`、时间范围、置信度、质量标记应是共享字段
- “系统推荐”“待进入精分析”这类文案不应放进 contracts
- 若新增质量标记，要同步前端的 flag label 映射
- mock 数据应复用同样的结构，而不是手写另一套简化对象

# Optional code sketch

```ts
interface SegmentScanSummary {
  status: 'completed'
  swingSegments: SwingSegmentCandidate[]
  recommendedSegmentId: string
  selectedSegmentId?: string
}
```
