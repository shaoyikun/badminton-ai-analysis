# DEPLOYMENT

## 1. 最快启动方式（Docker Compose）

```bash
git clone https://github.com/shaoyikun/badminton-ai-analysis.git
cd badminton-ai-analysis
docker compose up --build
```

默认访问地址：
- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8787`

## 2. 常用命令

```bash
docker compose up --build
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
```

最省事的一键启动：

```bash
./scripts/up.sh
```

如果刚拉了新代码，或需要强制重建镜像：

```bash
./scripts/up.sh --build
```

停止：

```bash
./scripts/down.sh
```

查看日志：

```bash
./scripts/logs.sh
./scripts/logs.sh backend
./scripts/logs.sh frontend
```

也可以用 Makefile 缩短命令：

```bash
make up
make up-build
make compose-ps
make compose-logs-backend
make compose-logs-frontend
make down
```

## 3. 本地开发模式（不用 Docker）

```bash
./scripts/setup-dev.sh
./scripts/start-dev.sh
```

## 4. 运行前提

### Docker 方案
- Docker Desktop（macOS / Windows）或 Docker Engine（Linux）
- Docker Compose v2

### 非 Docker 方案
- Node.js 22+
- npm
- Python 3
- ffmpeg
- ffprobe

如果直接执行 `./scripts/setup-dev.sh`，脚本会在缺少基础工具时优先尝试自动安装（当前支持 Homebrew / apt-get）。

## 5. 故障排查

### 端口被占用
检查 5173 / 8787 是否已被其他进程使用。

### backend unhealthy
查看日志：
```bash
docker compose logs -f backend
```
重点检查：
- ffmpeg / ffprobe 是否可用
- Python 依赖是否安装成功
- `analysis-service` 是否被正确复制进容器

### frontend 打不开或接口报错
查看日志：
```bash
docker compose logs -f frontend
```
确认 nginx 是否正常启动，以及 `/api` 是否已正确转发到 backend。

## 6. 备注
当前 Compose 方案已经比开发态更接近发布态：
- frontend 使用 nginx 托管静态构建产物
- frontend 通过反向代理访问 backend
- backend 使用构建产物启动
- `backend/data` 与 `backend/uploads` 通过 volume 持久化
- backend 构建支持通过 `APT_MIRROR` 切换更快的 apt 镜像源，减轻首次构建时 Debian 官方源过慢的问题
