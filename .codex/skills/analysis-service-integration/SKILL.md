---
name: analysis-service-integration
description: Use when changing how backend preprocesses media, invokes the Python analysis-service, interprets pose outputs, or exposes recoverable failures without leaking Python internals to the frontend.
---

# 何时使用这个 skill

当任务涉及 backend 与 Python `analysis-service` 的集成边界时使用：

- `ffprobe` / `ffmpeg` 预处理
- Python CLI 调用参数和输入输出
- pose 结果读取、失败处理、恢复策略
- artifact 目录结构和中间产物边界

# 仓库背景与上下文

当前 Python 服务不是独立对外产品入口，而是 backend 调用的辅助模块。先读：

- `analysis-service/README.md`
- `analysis-service/app.py`
- `backend/src/services/preprocessService.ts`
- `backend/src/services/analysisService.ts`
- `backend/src/services/poseService.ts`
- `docs/algorithm-baseline.md`

真实链路包括：

- backend 用 `ffprobe` 读元数据
- backend 做片段粗扫与抽帧
- backend 调用 `analysis-service/app.py`
- Python 输出 pose 结果 JSON
- backend 基于 pose summary 与评分逻辑生成面向前端的报告与错误

# 核心规则

1. 不要把 Python 细节泄漏给前端；前端只消费稳定任务协议和报告协议。
2. backend 与 Python 的边界要清楚：
   - Python 负责姿态估计与姿态摘要
   - backend 负责任务状态、错误码、历史、复测对比、报告
3. 输入输出接口要固定：
   - Python 输入什么目录或 manifest
   - Python 输出什么 JSON 文件
   - backend 读取后如何转成共享类型
4. 失败要分层处理：
   - 预处理失败：`preprocess_failed`
   - pose 执行失败：`pose_failed`
   - 报告生成失败：`report_generation_failed`
   - 恢复失败：`task_recovery_failed`
5. 可恢复错误优先映射成上游可行动的错误码，不要把 stderr 原文直接暴露给用户。
6. 产物边界保持稳定：
   - 上传原视频
   - preprocess manifest / sampled frames
   - pose result
   - report 调试副本
7. 若更改 Python 输出结构、pose summary 字段或 rejection 语义，要同步考虑 `evaluation-and-regression`。

# 推荐代码组织方式

- 媒体准备与片段选择继续放在 `preprocessService`
- Python 调用适配继续收口在 `analysisService` / `poseService`
- 错误码映射留在 backend，不放进 Python 层
- 产物读写复用 `artifactStore` 与既有目录布局，不新增平行产物树

# 与其他 skills 的协作边界

- 与 `badminton-analysis-flow` 联动：当状态推进与选片分析边界变化时
- 与 `backend-api-contracts` 联动：当上游错误码、状态对象或报告协议变化时
- 与 `evaluation-and-regression` 联动：当 pose summary、评分输入或基线输出变化时
- 与 `docs-spec-sync` 联动：当分析能力边界或失败语义变化时

# 任务完成后的输出要求

最终交付说明至少要写清：

- backend 与 Python 的调用边界改了什么
- 中间产物或输入输出结构是否变化
- 失败是如何向上游映射的
- 是否需要补跑 `make evaluate`，以及为什么
