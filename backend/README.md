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
- `POST /api/tasks/:taskId/analyze`
- `GET /api/tasks/:taskId`
- `GET /api/tasks/:taskId/result`

## 当前说明
当前阶段为 PoC 第一阶段：
- 上传—任务—状态—结果链路可跑通
- 分析结果仍为模拟结果
- 后续会替换为真实视频处理与姿态识别能力
