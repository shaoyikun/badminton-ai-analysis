# Task

重构上传链路，让用户先上传并粗扫整段视频，再从候选挥拍片段里选择真正进入分析的一段。

# Before

- 当前仓库已经有候选片段能力
- 共享对象在 `SegmentScanSummary` 与 `SwingSegmentCandidate`
- 上传页真实文案已经是“上传并粗扫片段”

# Goal

保持前后端对“先粗扫、后选片段、再精分析”的一致状态建模，避免页面和接口各说各话。

# Recommended structure

- 上传成功后先拿到 `segmentScan`
- provider 里保存 `segmentScan` 与 `selectedSegmentId`
- 页面展示候选片段卡片，默认高亮 `recommendedSegmentId`
- 用户确认后再调用 `/api/tasks/:taskId/start`

# Key implementation notes

- 不要用单个 `isScanning`、`isReady`、`hasSegments` 三四个 boolean 拼状态
- `selectedSegmentId` 为空时，CTA 不应该直接进入 `/analyses/:taskId/processing`
- mock 场景也要返回真实 `SegmentScanSummary`
- 如果后端没有候选片段，也要明确 fallback 行为，而不是让页面 silent fail

# Optional code sketch

```ts
type ClipSelectionState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'scan_ready'; segmentScan: SegmentScanSummary; selectedSegmentId: string }
  | { kind: 'scan_error'; errorCode: FlowErrorCode }
```
