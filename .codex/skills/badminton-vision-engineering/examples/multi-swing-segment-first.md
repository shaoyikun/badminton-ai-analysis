多挥拍视频任务里，先解决“该分析哪一次挥拍”，不要一上来把整段视频当单次动作送去精分析。

推荐顺序：

1. 先看当前粗扫入口和输出是否已经足够表达多个候选片段。
2. 优先扩展候选片段质量信号、排序依据和推荐逻辑。
3. 只有在推荐片段语义稳定后，再去调单片段抽帧、pose 或 report。

实现时优先检查：

- `analysis-service/services/swing_segment_detector.py`
- `backend/src/services/preprocessService.ts`
- `spec/DATA-SPEC.md` 中 `segmentScan` 相关字段
- 上传页和报告页对 `recommendedSegmentId`、`selectedSegmentId` 的消费

优先解决的问题：

- 候选窗口是否覆盖完整挥拍，而不是只截到峰值
- 排名是否把准备段/收拍截断风险当成 penalty
- 当多个候选接近时，是否能解释为什么推荐其中一个
- 无可靠候选时，是否保留 fallback 和质量标记而不是静默退化

优先考虑的输出信号：

- `swingSegments`
- `recommendedSegmentId`
- `segmentDetectionVersion`
- `coarseQualityFlags`
- `rankingScore`

验证时不要只看“有没有检测出片段”，还要看：

- 推荐片段是不是用户最可能想分析的那次挥拍
- 片段边界是否更完整
- 截断、遮挡、主体过小这类风险是否被保留下来
- baseline / fixture 是否能解释推荐逻辑变化
