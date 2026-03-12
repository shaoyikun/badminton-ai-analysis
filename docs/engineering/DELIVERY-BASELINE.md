# MVP 交付工程基线

这份文档面向多人协作、MVP 交付和 Codex handoff，约定本仓库的最小部署方式、统一验收口径、回归路径和常见排障方式。

## 统一入口

仓库级操作默认通过以下命令执行：

```bash
make setup
make run
make test
make build
make verify
```

补充命令：

```bash
make help
make dev
make verify-local
make logs
make down
```

命令约定：

- `make run`：稳定启动入口，优先 Docker Compose，回退本地开发模式
- `make dev`：强制本地开发路径
- `make verify`：严格交付门禁，默认包含 Docker Compose 构建校验
- `make verify-local`：本地快速校验，只用于无 Docker daemon 的临时验证

## 最小部署步骤

### 1. 准备环境

要求：

- Node.js 22+
- npm
- Python 3
- `ffmpeg` / `ffprobe`
- Docker Desktop 或等价 Docker Compose 环境

初始化：

```bash
cp .env.example .env
make setup
```

### 2. 启动服务

推荐：

```bash
make run
```

等价的显式 Compose 启动方式：

```bash
docker compose up --build -d
```

默认访问地址：

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:8787`

### 3. 最小 smoke check

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:5173/health
docker compose ps
```

期望结果：

- backend `/health` 返回成功
- frontend `/health` 通过 nginx 代理返回成功
- backend / frontend 均为 healthy

### 4. 日志与停止

```bash
make logs
make down
```

需要只看某个服务时，可直接执行：

```bash
./scripts/logs.sh backend
./scripts/logs.sh frontend
```

## 验收清单

交付前至少确认以下事项：

- `make setup` 已完成，依赖安装无遗漏
- `make test` 通过
- `make build` 通过
- `make verify` 在有 Docker daemon 的环境中通过
- 根 README、`.env.example`、`Makefile`、脚本、子系统 README 的命令和环境变量说明一致
- 如有跳过项、残留风险或临时开关，已在交付说明中明确

## 手工回归路径

以下路径用于判断“工程入口没有回归”，不是新增业务验收。

### 准备

- 启动服务：`make run`
- 准备一段本地短视频
  - 优先使用 5 到 15 秒的单人羽毛球动作视频
  - 样例来源约定见 [samples/README.md](../../samples/README.md)

### 路径

1. 打开前端首页，确认页面可访问
2. 检查 `http://127.0.0.1:8787/health`
3. 创建任务
4. 上传视频
5. 启动分析
6. 等待状态从处理中流转到完成或明确失败
7. 打开结果页，确认报告可加载
8. 打开历史页，确认记录可见
9. 打开复测对比入口，确认页面与数据链路未报错

### 可选 API smoke path

如需不经过前端做后端联调，可按顺序执行：

```bash
curl -X POST http://127.0.0.1:8787/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"actionType":"clear"}'

curl -X POST http://127.0.0.1:8787/api/tasks/<taskId>/upload \
  -F file=@/path/to/local-video.mp4

curl -X POST http://127.0.0.1:8787/api/tasks/<taskId>/start
curl http://127.0.0.1:8787/api/tasks/<taskId>
curl http://127.0.0.1:8787/api/tasks/<taskId>/result
```

## 环境变量口径

当前统一维护的变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `BACKEND_PORT` | `8787` | 本地开发与 Compose 端口映射 |
| `FRONTEND_PORT` | `5173` | 本地开发与 Compose 端口映射 |
| `VITE_API_BASE` | 空 | Compose 推荐留空走同源；本地脚本会自动回退到后端地址 |
| `PYTHON_BIN` | `python3` | 本地开发和脚本调用的 Python 入口 |
| `UPLOAD_MAX_FILE_SIZE_BYTES` | `209715200` | 上传限制 |
| `APT_MIRROR` | `mirrors.aliyun.com` | backend Docker 构建镜像源 |

说明：

- `SKIP_DOCKER_VERIFY` 只用于单次命令，不建议写入 `.env`
- 如需本地临时跳过 Docker 校验，请用 `make verify-local`

## 本地校验与交付门禁的区别

### 本地快速校验

```bash
make verify-local
```

适用场景：

- 当前机器没有 Docker daemon
- 只想确认 lint、测试、构建是否通过
- 需要快速判断脚本和代码是否明显回归

不包含：

- `docker compose build backend frontend`

### 严格交付门禁

```bash
make verify
```

适用场景：

- 提交前
- 交付前
- CI / PR gate

必须满足：

- Docker CLI 可用
- Docker daemon 正常运行

## 常见故障排查

### `make verify` 因 Docker daemon 不可用失败

表现：

- `Docker daemon is not available`

处理：

- 启动 Docker Desktop 或 colima
- 只做本地开发校验时改用 `make verify-local`

### `make run` 回退到了本地开发模式

表现：

- 脚本提示 Docker daemon 不可用，并转为 local development mode

处理：

- 如果这是预期行为，无需处理
- 如果希望走 Compose，请先恢复 Docker daemon，再重新执行 `make run`

### `make dev` 提示端口占用

表现：

- `Port 8787 is already in use`
- `Port 5173 is already in use`

处理：

- 结束已有进程，或修改 `.env` 中的 `BACKEND_PORT` / `FRONTEND_PORT`

### `make setup` 无法自动安装工具

表现：

- 缺少 `brew` / `apt-get`
- `sudo` 权限不足

处理：

- 手动安装缺失的基础工具
- 重新执行 `make setup`

### 上传或分析阶段失败

优先检查：

- `ffmpeg` / `ffprobe` 是否可用
- backend 日志是否有 Python 或文件路径错误
- 视频是否符合 [docs/data/VIDEO-CAPTURE-SPEC.md](../data/VIDEO-CAPTURE-SPEC.md) 的拍摄建议
