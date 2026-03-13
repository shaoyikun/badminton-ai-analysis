当结果不稳定时，先判断问题属于哪一类，不要默认是动作识别或动作纠正逻辑出了错。

先分四类：

1. 输入质量问题
2. 证据不足
3. 执行失败 / 系统错误
4. 动作本身问题

典型判断顺序：

1. 先看主体是否过小、裁切严重、遮挡严重、机位不适合。
2. 再看 usable frame、coverage ratio、phase coverage、view profile 是否足够。
3. 再看 Python 调用是否超时、异常退出、输出非法 JSON 或产物缺失。
4. 只有前面都过关后，才增强动作纠正或规则评分结论。

优先检查：

- `analysis-service/services/pose_estimator.py`
- `backend/src/services/poseService.ts`
- `backend/src/services/reportScoringService.ts`
- `docs/algorithm-baseline.md` 中 `rejectionReasons`、`analysisDisposition`、`confidenceScore`

处理原则：

- 输入质量差：优先通过质量标记、evidence note、拍摄建议表达
- 证据不足：优先 `low_confidence` 或 `insufficient_evidence`
- 执行失败：映射成明确错误码，不伪装成动作结论
- 动作问题：只有在证据足够时才输出强纠正建议

如果继续输出报告，尽量让以下信息可解释：

- 为什么动作分还能算，但置信度下降
- 为什么当前样本只是低置信，而不是直接拒绝
- 为什么当前问题被归类为输入/证据问题，而不是动作错误

验证重点：

- `rejectionReasons` 与最终 disposition 是否分层清楚
- `lowConfidenceReasons` 是否真的代表边界型样本
- 纠正建议是否只出现在有足够动作证据的样本里
- fixture / baseline 是否覆盖边界型低置信样本
