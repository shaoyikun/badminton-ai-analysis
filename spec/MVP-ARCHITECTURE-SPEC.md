# MVP-ARCHITECTURE-SPEC

## 1. 文档目标
这份 spec 只回答一件事：基于当前 PoC 现状，项目要走到“可交付 MVP”时，前端、后端、`analysis-service` 分别保留什么、重构什么，以及最终应该以什么架构为目标。

约束：
- 只定义 MVP 必须稳定的架构边界
- 默认继续沿用当前 `frontend/` + `backend/` + `analysis-service/` 三段式结构
- 不为增强版、教练端、多动作扩展提前设计复杂平台层

---

## 2. 现状评估结论

### 2.1 应保留的架构与选型
- `frontend`: React 19 + Vite 的移动端 H5 路线应保留。它已经满足 MVP 的移动端页面组织、上传交互和结果展示需求，没有必要为了 MVP 改成 React Native、Next.js 或多端同构。
- `backend`: Fastify + TypeScript 单体 API 应保留。当前任务编排、历史记录、复测对比、报告聚合都还在同一个业务边界内，拆服务只会增加交付成本。
- `analysis-service`: Python + OpenCV + MediaPipe 的独立分析边界应保留。姿态估计依赖 Python 生态是合理的，继续与 TypeScript 后端解耦比强行迁回 Node 更稳。
- 规则评分与报告生成保留在后端，不下沉到 Python。MVP 阶段“姿态识别”和“业务解释/报告文案”是两个边界，当前拆法是对的。
- 轮询式任务查询短期继续保留。当前任务耗时较短，WebSocket 或 SSE 不是 MVP 必需项。

### 2.2 短期够用的方案
- 单体后端进程内驱动任务执行：短期够用，但前提是任务状态必须持久化，服务重启后可恢复或明确失败。
- Python 子进程调用：短期够用，不必为了 MVP 先做独立 HTTP/gRPC 分析服务。
- 规则评分 + 模板化报告：短期够用，而且比“直接让模型写报告”更可控。
- 本地文件或单机挂载卷保存视频与中间产物：短期够用，但必须把元数据与文件产物解耦。

### 2.3 需要重构的边界
- 前端边界：当前 `App.tsx + useAnalysisTask` 仍偏联调控制台，不适合作为可交付 MVP 的页面组织方式。需要改成“页面路由 + feature 模块 + API 层”的结构。
- 任务状态边界：当前只有 `status + preprocessStatus + poseStatus`，足够跑通 PoC，但不够表达 MVP 的统一状态机。需要引入明确的 `stage` 和错误快照。
- 后端公开 API 边界：`/preprocess`、`/pose` 这类接口更适合内部调试，不应继续作为 MVP 主协议的一部分。
- 存储边界：`data/tasks.json` 全量读写 + 分散的结果文件已经是 PoC 包袱。MVP 需要把“任务元数据”和“视频/产物文件”分离存储。
- 执行恢复边界：当前运行中的任务只在内存 `Map` 里跟踪，服务重启后会丢失运行态。MVP 至少需要“启动恢复/失败回收”机制。

### 2.4 已成为 PoC 包袱的部分
- 用户可见的“创建任务 -> 上传视频 -> 启动分析”三步式调试流程
- 前端页面和联调日志混在同一个壳里
- `tasks.json` 作为唯一任务索引文件
- 运行时自动下载 MediaPipe 模型
- 错误返回仍以松散的 `error` 字符串为主，缺少统一错误对象
- `/preprocess`、`/pose` 这类中间阶段接口直接暴露给前端

---

## 3. MVP 目标架构

### 3.1 总体结构

```text
Mobile H5 Frontend
  -> Fastify API / Task Application
    -> Task Repository (SQLite)
    -> Artifact Store (filesystem, future object storage adapter)
    -> Pipeline Runner
      -> ffprobe / ffmpeg
      -> analysis-service (Python CLI)
    -> Report Builder / Comparison Builder
```

### 3.2 目标原则
- 继续保持单仓、三子系统结构，不拆微服务
- 后端仍是唯一业务编排入口
- Python 只负责姿态估计和姿态摘要，不负责任务、历史、复测、报告
- 前端只消费“任务协议”和“报告协议”，不感知预处理/姿态内部实现细节
- 所有用户可见错误都必须落到稳定错误码，而不是进程报错文本

---

## 4. 前端页面组织

### 4.1 页面与路由

| 路由 | 页面 | 目标 | 主要数据 |
| --- | --- | --- | --- |
| `/` | 首页 | 建立认知，进入主流程，给出历史入口 | 历史概览可选 |
| `/guide` | 拍摄规范页 | 降低无效上传 | 静态内容 |
| `/analyses/new` | 上传页 | 选择动作、选择视频、完成粗扫与片段确认 | 动作枚举、前端页内校验、`SegmentScanSummary` |
| `/analyses/:taskId/processing` | 分析中页 | 展示任务阶段与失败跳转 | `TaskStatusResponse` |
| `/analyses/:taskId/report` | 报告页 | 展示本次结果 | `ReportResult` |
| `/history` | 历史记录页 | 查看同动作历史样本 | `HistoryListResponse` |
| `/analyses/:taskId/comparison` | 复测对比页 | 查看默认或自选基线对比 | `ComparisonResponse` |
| `/error` | 错误状态页 | 统一承接错误恢复 | `errorCode` + 页面参数 |

说明：
- MVP 前端不再把“创建任务”作为独立用户页面。
- 上传页点击主流程后，由前端顺序触发：创建任务 -> 上传文件 -> 粗扫候选片段 -> 用户确认片段 -> `POST /start` -> 跳到分析中页。
- 历史详情不必单独做成独立路由，可以先作为历史页内抽屉/卡片详情。

### 4.2 前端模块边界
- `app/`: 路由、壳层、轻量 session、跨页导航约束
- `features/upload/`: 上传、动作选择、前端页内校验、候选片段确认
- `features/processing/`: 轮询、阶段映射、失败跳转
- `features/report/`: 报告摘要、问题列表、标准动作对比
- `features/history/`: 历史列表、基线选择、历史详情
- `features/compare/`: 复测对比与教练式总结
- `components/ui/`: 自研移动端 UI 组件
- `styles/`: 全局 token / reset 与页面级共享布局
- `app/analysis-session/`: API adapter、flow helper、轻量持久化
- `shared/contracts.d.ts`: 前后端共享类型源

前端不应再承担：
- 预处理阶段调试数据直接展示
- Python 结果结构的二次拼接

说明：
- `AnalysisSessionProvider` 只保留动作类型、上传草稿、候选片段选择、轻量错误状态和 debug 偏好等轻量 session。
- 报告页、分析中页、复测对比页的主数据都必须通过 `taskId` 从 API 冷启动 hydration。

### 4.3 前端实现约束
- 样式默认使用 `*.module.scss` + CSS Modules。
- `frontend/src/styles/tokens.scss` 与 `frontend/src/styles/globals.scss` 是 token 和极薄全局样式真源；复杂页面样式不得继续堆回单一全局 CSS。
- 允许选择性使用 `antd-mobile` 作为移动端交互原件，例如 `Selector`、`Popup`、`Dialog`、`Toast`。
- `antd-mobile` 不得接管品牌主题、Hero 结论卡、报告主叙事区块和训练建议卡。
- 路由级页面默认使用 `React.lazy` 做 code splitting；首页首包不应强绑报告、历史、对比、design-system 或 debug 代码。

---

## 5. 接口契约

## 5.1 公开 API 范围
MVP 前端只依赖下面这些接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/tasks` | 创建分析任务 |
| `POST` | `/api/tasks/:taskId/upload` | 上传视频 |
| `POST` | `/api/tasks/:taskId/start` | 启动处理流程 |
| `GET` | `/api/tasks/:taskId` | 查询任务状态 |
| `GET` | `/api/tasks/:taskId/result` | 获取报告 |
| `GET` | `/api/history?actionType=...` | 获取同动作历史列表 |
| `GET` | `/api/history/:taskId` | 获取历史样本详情 |
| `GET` | `/api/tasks/:taskId/comparison?baselineTaskId=...` | 获取复测对比 |

说明：
- 现有 `/preprocess`、`/pose` 系列接口降级为内部调试接口，不进入 MVP 主协议。
- 当前公开动作范围为 `clear + smash`；其他未知动作值继续返回 `invalid_action_type`。

## 5.2 核心任务对象

```ts
type TaskStatus = 'created' | 'uploaded' | 'processing' | 'completed' | 'failed'

type TaskStage =
  | 'upload_pending'
  | 'uploaded'
  | 'validating'
  | 'extracting_frames'
  | 'estimating_pose'
  | 'generating_report'
  | 'completed'
  | 'failed'

interface TaskStatusResponse {
  taskId: string
  actionType: 'clear' | 'smash'
  status: TaskStatus
  stage: TaskStage
  progressPercent: number
  errorCode?: string
  errorMessage?: string
  retryable: boolean
  segmentScan?: SegmentScanSummary
  previousCompletedTaskId?: string
  createdAt: string
  updatedAt: string
}
```

约束：
- `status` 用于流程级判断
- `stage` 用于分析中页和排障
- `progressPercent` 只做阶段性进度提示，不做精确耗时承诺
- `uploaded + stage=uploaded + segmentScan` 表示“粗扫完成，等待用户确认候选片段”，不是处理中页状态
- `failed` 为终态；用户重新上传时创建新任务，不复用失败任务
- `smash` 已进入正式开放范围，但继续使用独立评分版本与标准对照

## 5.3 报告对象
报告主结构继续沿用 `DATA-SPEC.md` 中的 `ReportResult`，但 MVP 必填字段必须包括：
- `taskId`
- `actionType`
- `totalScore`
- `summaryText`
- `dimensionScores`
- `issues`
- `suggestions`
- `retestAdvice`

按需返回字段：
- `history`
- `comparison`
- `standardComparison`
- `scoringEvidence`
- `preprocess`

## 5.4 历史与复测
- 历史列表只返回同动作、已完成任务
- 默认复测基线为“上一条同动作已完成任务”
- 允许手动指定 `baselineTaskId`
- 禁止跨动作类型对比，服务端返回 `comparison_action_mismatch`

## 5.5 错误返回结构

```json
{
  "error": {
    "code": "invalid_duration",
    "message": "video duration should be between 5 and 15 seconds",
    "retryable": true
  }
}
```

约束：
- `code` 是前端映射的唯一稳定键
- `message` 给日志与开发排障使用
- `retryable` 明确前端是否展示“重新上传/重试”

---

## 6. 任务状态流转

### 6.1 正常流转

```text
created/upload_pending
-> uploaded/uploaded
-> processing/validating
-> processing/extracting_frames
-> processing/estimating_pose
-> processing/generating_report
-> completed/completed
```

### 6.2 异常流转
- `validating` 失败：进入 `failed/failed`，错误码通常为拍摄规范或文件校验类错误
- `extracting_frames` 失败：进入 `failed/failed`，错误码通常为 `preprocess_failed`
- `estimating_pose` 失败：进入 `failed/failed`，错误码通常为 `pose_failed`
- `generating_report` 失败：进入 `failed/failed`，错误码通常为 `report_generation_failed`

### 6.3 页面映射
- `created`、`uploaded`: 上传页或上传后跳转中的过渡态
- `processing/*`: 分析中页
- `completed`: 报告页
- `failed`: 错误页

### 6.4 启动恢复规则
- 后端启动时，扫描仍处于 `processing/*` 超时状态的任务
- 若产物完整，可恢复到下一阶段继续执行
- 若无法恢复，标记为 `failed`，错误码使用 `task_recovery_failed`

MVP 不要求外部消息队列，但必须满足“服务重启后任务不会永久卡死”。

---

## 7. 存储方式

### 7.1 MVP 推荐存储
- 任务元数据和状态：SQLite
- 原视频、抽帧产物、姿态原始结果：本地文件系统或容器挂载卷
- 报告 JSON：优先落库，同时允许缓存为文件

### 7.2 推荐目录布局

```text
data/
  app.db
artifacts/
  tasks/
    {taskId}/
      source.mp4
      preprocess/
        manifest.json
        frame-01.jpg
      pose/
        result.json
      report/
        report.json
```

说明：
- 不再使用单个 `data/tasks.json` 作为全量任务索引
- 文件系统负责“大文件和中间产物”
- 数据库负责“状态、索引、查询和历史聚合”

### 7.3 必要数据表
- `analysis_tasks`: 任务主表，保存状态、阶段、动作类型、错误快照、产物路径、时间戳
- `analysis_reports`: 报告结果表，保存结构化报告 JSON 和索引字段

MVP 不要求：
- 对象存储
- 向量库
- 审计日志平台
- 通用工作流引擎

---

## 8. 错误码体系

### 8.1 错误码设计原则
- 优先复用当前前端已消费的业务错误码
- 错误码表达业务原因，不暴露底层栈信息
- 同一个错误码在所有接口中语义一致

### 8.2 MVP 必备错误码

| 分类 | errorCode | HTTP 状态 | 说明 |
| --- | --- | --- | --- |
| 请求 | `invalid_action_type` | `400` | 不支持的动作类型 |
| 请求 | `file_required` | `400` | 未上传文件 |
| 请求 | `task_not_found` | `404` | 任务不存在 |
| 状态 | `invalid_task_state` | `409` | 当前状态不允许执行该操作 |
| 状态 | `result_not_ready` | `409` | 结果尚未生成 |
| 文件 | `upload_failed` | `400/413/500` | 上传或落盘失败 |
| 文件 | `unsupported_file_type` | `422` | 文件格式不支持 |
| 文件 | `invalid_duration` | `422` | 时长不在 5~15 秒 |
| 质量 | `multi_person_detected` | `422` | 多人同框 |
| 质量 | `body_not_detected` | `422` | 人体未稳定识别 |
| 质量 | `poor_lighting_or_occlusion` | `422` | 光照差或遮挡严重 |
| 质量 | `invalid_camera_angle` | `422` | 机位不合适 |
| 流水线 | `preprocess_failed` | `500/422` | 预处理执行失败 |
| 流水线 | `pose_failed` | `500/422` | 姿态识别失败 |
| 流水线 | `report_generation_failed` | `500` | 报告生成失败 |
| 对比 | `comparison_action_mismatch` | `409` | 对比任务动作类型不一致 |
| 恢复 | `task_recovery_failed` | `500` | 启动恢复失败 |
| 系统 | `internal_error` | `500` | 未分类内部错误 |

### 8.3 前端映射规则
- `invalid_duration`、`upload_failed` 优先回上传页
- `multi_person_detected`、`body_not_detected`、`poor_lighting_or_occlusion`、`invalid_camera_angle` 优先回拍摄规范页
- `preprocess_failed`、`pose_failed`、`report_generation_failed` 允许“重新上传”与“查看拍摄规范”双路径

---

## 9. 模块边界

### 9.1 Frontend
负责：
- 页面组织与页面状态
- 上传前页内校验
- 轮询任务状态
- 报告、历史、复测结果展示
- 错误码到用户提示的映射

不负责：
- 评分逻辑
- 任务状态推导
- 姿态原始结果解释

### 9.2 Backend
负责：
- HTTP 协议层
- 任务状态机
- 视频上传与存储编排
- 预处理、姿态识别、报告生成的串联
- 历史记录聚合
- 默认对比基线选择
- 错误码统一输出

不负责：
- 前端文案拼装
- MediaPipe / OpenCV 具体实现细节

### 9.3 analysis-service
负责：
- 读取抽帧产物
- 运行姿态估计
- 输出稳定的姿态 JSON 结果
- 生成姿态级摘要指标

不负责：
- 任务创建
- 文件上传
- 历史记录
- 复测对比
- 报告文案
- 用户错误码定义

### 9.4 共享契约
必须保留一个共享 contract 边界，作为：
- 前端请求/响应类型源
- 后端 DTO 类型源
- 后续文档与测试的唯一字段基准

MVP 目标是“共享契约为明确源码”，而不是只有一个类型声明副本。

---

## 10. 交付边界结论

### 10.1 MVP 仍适合保留的骨架
- React H5 前端
- Fastify 单体后端
- Python 姿态识别子系统
- 规则评分与模板化报告
- 轮询式异步任务

### 10.2 MVP 必须完成的重构
- 前端从联调壳切到页面化组织
- 公共 API 收口到任务协议
- 任务状态从“多个散状态”收口到统一状态机
- 存储从 `tasks.json` 升级为“数据库 + 产物文件”双层结构
- 运行态任务具备恢复或失败回收能力
- 错误码体系统一

### 10.3 MVP 明确不做
- 微服务拆分
- WebSocket 实时推送
- 通用工作流平台
- 训练计划引擎
- 多动作扩展框架
- 教练/B 端多租户架构

## 11. 相关文档
- `spec/PRODUCT-SPEC.md`
- `spec/INTERACTION-SPEC.md`
- `spec/DATA-SPEC.md`
- `docs/tech/TECH-SOLUTION.md`
