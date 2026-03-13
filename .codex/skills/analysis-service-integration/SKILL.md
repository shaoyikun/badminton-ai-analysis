---
name: analysis-service-integration
description: Use when changing how backend preprocesses media, invokes the Python analysis-service, interprets pose outputs, or exposes recoverable failures without leaking Python internals to the frontend.
---

# Analysis Service Integration

## 何时使用

当任务涉及 backend 与 Python `analysis-service` 的集成边界时使用：

- `ffprobe` / `ffmpeg` 预处理
- Python CLI 调用参数和输入输出
- pose 结果读取、失败处理、恢复策略
- artifact 目录结构和中间产物边界

## 先读什么

当前 Python 服务不是独立对外产品入口，而是 backend 调用的辅助模块。先读：

- `analysis-service/README.md`
- `analysis-service/app.py`
- `backend/src/services/preprocessService.ts`
- `backend/src/services/analysisService.ts`
- `backend/src/services/poseService.ts`
- `docs/algorithm-baseline.md`

## 工作顺序/决策顺序

1. 先确认变更落在预处理、Python 调用、结果读取、错误映射还是产物边界。
2. 从 backend 调用点 trace 到 Python 输入输出，再反向检查哪些上游消费者依赖这些结果。
3. 先维持 backend 与 Python 的清晰职责边界，再决定字段、目录或错误语义是否需要调整。
4. 只有在共享语义或上游协议真的需要变化时，才联动共享契约、评测和文档。
5. 若任务要继续改已有超大文件，优先把新增职责外抽为 manifest builder、result mapper、error translator 或 Python helper 模块。

## 核心规则

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
7. 复用优先：优先扩展 `preprocessService`、`analysisService`、`poseService`、`artifactStore` 等现有边界，不新增平行调用链。
8. 模块拆分优先：manifest 组装、CLI 调用、结果映射、错误翻译、产物读写应按职责拆开，避免 route 或 orchestration 文件同时承担这些职责。
9. 文件体量控制：
   - backend route/service/adapter 通常接近 300 行就要考虑拆分
   - shared helper、result mapper、error translator 超过约 200 行应按职责拆分
10. `analysis-service/services/pose_estimator.py` 已是超大文件，视为待拆债务而不是模板。新增姿态逻辑优先抽到独立 Python helper，而不是继续把分支堆进去。
11. 若更改 Python 输出结构、pose summary 字段或 rejection 语义，要同步考虑 `evaluation-and-regression`。

## 何时联动其他 skills

- `badminton-analysis-flow`：状态推进、选片分析边界变化
- `backend-api-contracts`：上游错误码、状态对象或报告协议变化
- `evaluation-and-regression`：pose summary、评分输入、baseline 输出变化
- `docs-spec-sync`：分析能力边界或失败语义变化
- `repo-delivery-baseline`：需要决定验证等级或补跑 `make evaluate`

## 何时读取 examples/

在你已经定位到具体边界之后再读对应 example，不要把 example 当唯一实现方式：

- `examples/analysis-job-handshake.md`：backend 与 Python 输入输出握手变化时读
- `examples/python-service-failure-handling.md`：需要重新设计错误映射、重试或 recoverable failure 时读
- `examples/artifact-generation-boundary.md`：产物目录、manifest、调试副本边界变化时读

## 任务完成后的输出要求

最终交付说明至少要写清：

- backend 与 Python 的调用边界改了什么
- 中间产物或输入输出结构是否变化
- 失败是如何向上游映射的
- 是否需要补跑 `make evaluate`，以及为什么
