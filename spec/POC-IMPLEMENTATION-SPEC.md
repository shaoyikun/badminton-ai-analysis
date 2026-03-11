# POC-IMPLEMENTATION-SPEC

## 1. 目标
本文件定义羽毛球 AI 动作分析项目的第一阶段技术 PoC 实施方案。

PoC 的目标不是一次性做出完整 AI 产品，而是验证以下关键链路是否跑通：

1. 移动端前端能够上传视频
2. 后端能够接收视频并创建分析任务
3. 系统能够追踪任务状态
4. 系统能够返回一份结构化报告（第一阶段允许模拟结果）
5. 后续可平滑替换为真实视频分析与姿态识别能力

---

## 2. PoC 范围

### 2.1 第一阶段必须完成
- 最小后端项目骨架
- 视频上传接口
- 分析任务创建接口
- 任务状态查询接口
- 分析结果查询接口
- 本地文件存储
- 模拟分析 Worker
- 返回结构化报告 JSON

### 2.2 第一阶段可以先不做
- 真实姿态识别
- 真实关键帧提取
- 真实动作评分模型
- 用户登录体系
- 数据库复杂表设计
- 云端对象存储
- 生产级权限与鉴权体系

---

## 3. 推荐技术栈

### 3.1 API 服务
- Node.js
- TypeScript
- Fastify

### 3.2 异步任务
- Redis
- BullMQ

### 3.3 数据存储
- 第一阶段：本地 JSON / 本地文件 + 可选 SQLite
- 第二阶段：PostgreSQL

### 3.4 视频与 AI 分析服务
- 第一阶段：Node Worker 模拟分析
- 第二阶段：Python 分析服务（OpenCV + MediaPipe / MoveNet）

### 3.5 前端承接
- 现阶段继续使用移动端原型 / H5 作为交互承接
- 后续可迁移 React Native

---

## 4. PoC 目录建议

建议在仓库内新增：

```text
backend/
  src/
    server.ts
    routes/
    services/
    workers/
    types/
    utils/
  uploads/
  data/
```

### 说明
- `routes/`：接口路由
- `services/`：任务创建、结果读取等业务逻辑
- `workers/`：模拟分析任务
- `types/`：任务状态、报告结构定义
- `uploads/`：本地视频文件
- `data/`：任务与结果 JSON

---

## 5. 第一阶段接口设计

## 5.1 创建分析任务
### `POST /api/tasks`

#### 请求体
```json
{
  "actionType": "clear"
}
```

#### 返回
```json
{
  "taskId": "task_xxx",
  "status": "created"
}
```

---

## 5.2 上传视频
### `POST /api/tasks/:taskId/upload`

#### 行为
- 接收视频文件
- 保存到本地 `backend/uploads/`
- 更新任务状态为 `uploaded`

#### 返回
```json
{
  "taskId": "task_xxx",
  "status": "uploaded",
  "fileName": "demo.mov"
}
```

---

## 5.3 启动分析
### `POST /api/tasks/:taskId/analyze`

#### 行为
- 把任务加入队列
- Worker 异步处理
- 更新状态为 `processing`

#### 返回
```json
{
  "taskId": "task_xxx",
  "status": "processing"
}
```

---

## 5.4 查询任务状态
### `GET /api/tasks/:taskId`

#### 返回
```json
{
  "taskId": "task_xxx",
  "status": "completed"
}
```

状态枚举建议：
- `created`
- `uploaded`
- `processing`
- `completed`
- `failed`

---

## 5.5 获取分析结果
### `GET /api/tasks/:taskId/result`

#### 返回结构
```json
{
  "taskId": "task_xxx",
  "actionType": "clear",
  "totalScore": 76,
  "dimensionScores": [
    { "name": "准备姿态", "score": 82 },
    { "name": "引拍完整度", "score": 73 },
    { "name": "转体/转髋", "score": 68 },
    { "name": "击球点", "score": 71 }
  ],
  "issues": [
    {
      "title": "击球点偏晚",
      "description": "接触球点更靠近身体后侧。",
      "impact": "出球深度不足，后场压制力下降。"
    }
  ],
  "suggestions": [
    {
      "title": "高点击球定点练习",
      "description": "每天 3 组，每组 15 次。"
    }
  ],
  "retestAdvice": "建议 3~7 天后保持同一机位复测。"
}
```

---

## 6. Worker 行为定义

第一阶段 Worker 不做真实 AI，只模拟真实流程：

1. 读取任务
2. 等待 2~5 秒（模拟处理）
3. 根据 actionType 返回预置报告模板
4. 保存结果 JSON
5. 更新状态为 `completed`

### 这样做的价值
- 提前验证前后端接口
- 提前验证异步状态流转
- 提前验证移动端页面与数据结构是否合理
- 为后续替换真实分析服务保留接口稳定性

---

## 7. 第二阶段替换路径

第一阶段跑通后，逐步替换为真实能力：

### 7.1 替换 Worker 内部逻辑
从“返回预置 JSON”变成：
- 调用 Python 分析服务
- 获取姿态识别结果
- 生成结构化报告

### 7.2 新增 Python 服务
建议目录：

```text
analysis-service/
  app.py
  services/
  models/
  samples/
```

### 7.3 Python 服务职责
- 接收视频文件路径
- 抽帧
- 姿态识别
- 输出关键点和基础评估结果

---

## 8. 第一阶段验收标准

PoC 第一阶段完成时，应满足：

1. 可以创建任务
2. 可以上传视频
3. 可以启动分析
4. 可以查询状态
5. 可以拿到结构化结果
6. 前端 / 原型侧能消费这份结果
7. 错误状态能正常返回

---

## 9. 开发顺序建议

### Step 1
初始化 `backend/` 项目骨架

### Step 2
实现任务创建接口

### Step 3
实现视频上传接口

### Step 4
实现分析任务队列与模拟 Worker

### Step 5
实现状态查询接口

### Step 6
实现结果读取接口

### Step 7
让前端 / 原型接入这套接口（哪怕先手动模拟）

---

## 10. 当前结论
当前项目已经具备足够的产品规格、交互规格和移动端原型，可以进入最小后端 PoC。PoC 第一阶段的目标是验证“上传—任务—状态—结果”链路，而不是追求真实 AI 能力一步到位。
