# Backend MVP

## 启动

```bash
cd backend
npm install
npm run dev
```

服务默认运行在：`http://127.0.0.1:8787`

## 当前公开接口
- `POST /api/tasks`
- `POST /api/tasks/:taskId/upload`
- `POST /api/tasks/:taskId/start`
- `GET /api/tasks/:taskId`
- `GET /api/tasks/:taskId/result`
- `GET /api/history?actionType=...&cursor=...`
- `GET /api/history/:taskId`
- `GET /api/tasks/:taskId/comparison?baselineTaskId=...`

调试接口：
- `GET /api/debug/tasks/:taskId/pose`

## 当前后端边界
- `src/server.ts`：HTTP 协议层和统一错误返回
- `src/domain/analysisTask.ts`：任务生命周期和状态约束
- `src/services/taskRepository.ts`：SQLite 任务/报告持久化
- `src/services/taskService.ts`：任务应用层、历史/复测查询、启动恢复和迁移
- `src/services/preprocessService.ts`：`ffprobe` / `ffmpeg` 视频探测与抽帧
- `src/services/analysisService.ts`：Python `analysis-service` CLI adapter
- `src/services/reportScoringService.ts`：规则评分和报告生成

## 当前存储方式
- `data/app.db`：任务、错误快照、历史索引、报告 JSON 元数据
- `artifacts/tasks/{taskId}/source.*`：原视频
- `artifacts/tasks/{taskId}/preprocess/`：抽帧和 manifest
- `artifacts/tasks/{taskId}/pose/result.json`：姿态原始结果
- `artifacts/tasks/{taskId}/report/report.json`：报告调试副本

数据库是查询真源；文件系统负责大文件和中间产物。

## 一个最小联调流程

```bash
curl -X POST http://127.0.0.1:8787/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"actionType":"clear"}'

curl -X POST http://127.0.0.1:8787/api/tasks/<taskId>/upload \
  -F file=@/path/to/demo.mp4

curl -X POST http://127.0.0.1:8787/api/tasks/<taskId>/start
curl http://127.0.0.1:8787/api/tasks/<taskId>
curl http://127.0.0.1:8787/api/tasks/<taskId>/result
```
