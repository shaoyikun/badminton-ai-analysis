# Backend MVP

后端的统一启动、测试、构建和交付门禁以仓库根目录为准：

```bash
make setup
make run
make test
make build
make verify
```

第一次进入仓库时，先读：

- `../README.md`
- `../docs/engineering/DELIVERY-BASELINE.md`

## 本地后端调试

只调试后端时，可以单独执行：

```bash
cd backend
npm run dev
```

默认地址：

- `http://127.0.0.1:8787`

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

开发者调试脚本：

- `./scripts/debug-algorithm-baseline.sh <preprocess-task-dir> [--format markdown|json]`
- `./scripts/evaluate.sh [--json] [--update-baseline]`
- 这个脚本不会改动现有 API，只会直接读取 preprocess 目录、调用现有 Python pose CLI，并复用 backend 评分逻辑输出调试摘要
- 适合在排查 `rejectionReasons`、逐帧 metrics 和 `scoringEvidence` 原始中间值时使用
- `evaluate.sh` 会运行 `evaluation/fixtures/index.json` 中的离线评测集，并对比 checked-in baseline

## 当前模块边界

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
