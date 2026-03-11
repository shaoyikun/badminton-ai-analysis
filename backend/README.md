# Backend PoC

## 启动

```bash
cd backend
npm install
npm run dev
```

服务默认运行在：`http://127.0.0.1:8787`

## 当前接口
- `POST /api/tasks`
- `POST /api/tasks/:taskId/upload`
- `POST /api/tasks/:taskId/preprocess`
- `GET /api/tasks/:taskId/preprocess`
- `POST /api/tasks/:taskId/analyze`
- `GET /api/tasks/:taskId`
- `GET /api/tasks/:taskId/result`

## 当前说明
当前阶段仍属于 PoC 第一阶段，但已开始把“真实视频预处理”链路提前留好结构：

- 上传—任务—预处理—分析—结果链路可跑通
- 预处理阶段会记录基础视频元数据（文件名、大小、mime、估算时长、估算帧数）
- 预处理阶段会生成占位产物（规范化文件名、抽帧计划、时间戳采样点）
- `analyze` 在预处理未完成时会先自动补跑预处理，再进入 mock 分析
- 分析结果仍为模拟结果，但已把 preprocess 信息一并挂到结果中，方便后续替换为真实抽帧、姿态识别、评分逻辑

## 一个最小联调流程

```bash
curl -X POST http://127.0.0.1:8787/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"actionType":"clear"}'

curl -X POST http://127.0.0.1:8787/api/tasks/<taskId>/upload \
  -F file=@/path/to/demo.mp4

curl -X POST http://127.0.0.1:8787/api/tasks/<taskId>/analyze
curl http://127.0.0.1:8787/api/tasks/<taskId>
curl http://127.0.0.1:8787/api/tasks/<taskId>/result
```
