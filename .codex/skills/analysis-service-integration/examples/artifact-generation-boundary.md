# Task

明确上传视频、preprocess、pose、report 这些产物各归谁生成和消费，避免目录结构和责任边界混乱。

# Before

- backend 既负责文件存储，也负责任务状态推进
- Python 负责生成 pose 结果
- 当前仓库已存在 artifacts、manifest、pose result、report 调试副本

# Goal

保证产物边界清晰，让后续改造不会出现“前端依赖 Python 文件结构”这类耦合。

# Recommended structure

- 上传原视频：backend 持久化
- preprocess manifest / sampled frames：backend 预处理阶段生成
- pose result：Python 生成，backend 读取
- report.json：backend 评分与报告阶段生成

# Key implementation notes

- 前端只通过 `/api` 和 `/artifacts` 消费稳定输出，不直接理解 Python 工作目录
- manifest 应记录选片窗口与抽帧计划，但不承担页面文案职责
- 若新增中间产物，先判断它属于 debug、运行必需还是公开资源
- 目录改动若影响 mock 或调试脚本，要同步更新相应使用方

# Optional code sketch

```text
artifacts/tasks/{taskId}/
  source.*
  preprocess/manifest.json
  pose/result.json
  report/report.json
```
