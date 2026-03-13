# Task

为上传接口增加“上传后立即返回粗扫候选片段”的能力，同时保持前端兼容。

# Before

- 上传接口是 `POST /api/tasks/:taskId/upload`
- 当前前端上传后会等待候选片段对象
- `UploadTaskResponse` 已是共享契约的一部分

# Goal

在不打断现有上传主流程的前提下演进上传响应结构。

# Recommended structure

- 优先扩展现有 `UploadTaskResponse`
- 把候选片段相关字段收口在 `segmentScan`
- 维持已有任务主字段不变
- 同步更新 frontend provider 与 mock API

# Key implementation notes

- 不要让上传接口一半返回任务资源、一半返回孤立扫描对象
- 如果字段来自 `preprocess`，优先由 backend 统一投影成共享响应
- 新增字段优先是可选兼容，再视消费方普及程度提升为必填
- 如果响应语义变化，要更新 `spec/DATA-SPEC.md` 或相关 docs

# Optional code sketch

```ts
interface UploadTaskResponse extends TaskStatusResponse {
  fileName?: string
  segmentScan?: SegmentScanSummary
}
```
