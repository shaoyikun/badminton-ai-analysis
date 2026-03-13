# Task

梳理 backend 从上传视频到 Python `analysis-service` 执行完成之间的握手边界。

# Before

- backend 会先做视频校验、粗扫、选片段、抽帧
- Python 不是 HTTP 服务，而是被 backend 调用的 CLI
- 前端不直接感知 Python 输入输出

# Goal

让调用链清晰到可以安全改造而不把 Python 内部结构泄漏给前端。

# Recommended structure

- `preprocessService` 负责输入视频和 preprocess manifest
- `analysisService` / `poseService` 负责调用 Python 与读取 pose result
- `taskService` 负责推进任务状态与映射错误码
- 前端只消费任务协议和报告协议

# Key implementation notes

- backend 与 Python 之间传递目录或 manifest，不传页面语义对象
- Python 的 stderr、traceback 只能进入日志或开发信息，不直接映射用户文案
- 如果分析只针对选中片段，manifest 里要记录 `selectedSegmentId` 与 window
- 若 Python 输出结构变化，要先确认 `poseService`、评分逻辑、evaluation 都能接住

# Optional code sketch

```text
taskService
  -> preprocessService.extractFrames(selectedSegmentWindow)
  -> analysisService.run(preprocessDir)
  -> poseService.readPoseResult(resultPath)
  -> reportScoringService.build(...)
```
