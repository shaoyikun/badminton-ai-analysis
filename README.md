# 羽毛球 AI 动作分析

这是一个面向 MVP 交付准备的羽毛球动作分析仓库，当前包含：

- `frontend/`: React 19 + Vite 的移动端 H5 PoC
- `backend/`: Fastify + TypeScript API 与本地文件存储
- `analysis-service/`: Python 姿态分析辅助服务

当前协作基线以“统一启动、统一验证、统一交付门禁”为目标，不扩展新业务功能。产品背景、设计和技术方案沉淀在 `docs/` 与 `spec/`，工程交付入口以本 README 和 `docs/engineering/DELIVERY-BASELINE.md` 为准。

## 当前上传分析流

当前上传链路固定为两步式：

1. 上传完整视频，backend 先做一次粗粒度挥拍候选扫描
2. 前端展示候选片段，用户确认 `selectedSegmentId`，必要时可轻量微调前后边界，再启动最终分析

说明：

- 系统现在默认更偏向“完整挥拍”而不是“最短最干净的运动峰”
- 最终抽帧和报告回显都以用户确认后的 `selectedSegmentWindow` 为准
- 这一步仍然只分析一个候选片段，不会并行精分析全部候选

## 当前前端真相

截至 2026-03-13，移动端 H5 已切到以下产品实现约束：

- 语义化路由：
  - `/`
  - `/guide`
  - `/analyses/new`
  - `/analyses/:taskId/processing`
  - `/analyses/:taskId/report`
  - `/history`
  - `/analyses/:taskId/comparison`
  - `/error`
- 报告页、分析中页、复测对比页都支持直接用 `taskId` 深链访问，不再依赖“最近一次任务”的隐式会话恢复
- `sessionStorage` 只保留动作类型、上传草稿、候选片段选择和 debug 开关，不再保存报告/对比主真相
- 前端样式默认采用 `*.module.scss` + CSS Modules，公共 token 收口在 `frontend/src/styles/tokens.scss` / `frontend/src/styles/globals.scss`
- `antd-mobile` 仅选择性承接移动端交互原件，例如 `Selector`、`Popup`；页面视觉和叙事仍由仓库自研组件负责

## 稳定交付方式

仓库的标准协作入口固定为：

```bash
make setup
make run
make test
make build
make verify
make evaluate
```

- `make run`：稳定启动命令，优先走 Docker Compose，无法使用 Docker 时回退到本地开发模式
- `make test`：backend 自动化测试 + frontend Playwright H5 UI 自动化测试 + Python 轻量测试
- `make build`：backend / frontend 生产构建 + Python 语法编译校验
- `make verify`：严格交付门禁，包含前端 lint、全部测试、全部构建，以及 Docker Compose 构建校验

注意：

- `make test` 不等价于 `make build`
- backend 当前测试通过 `tsx` 执行 TypeScript 测试文件，能覆盖行为回归，但不能替代 `tsc` 的完整类型检查
- 只要改动触及 TypeScript 类型、共享 contracts、构建脚本或 Docker 构建路径，交付前至少要再确认一次 `make build`

本地没有可用 Docker daemon 时，可临时使用：

```bash
make verify-local
```

它等价于 `SKIP_DOCKER_VERIFY=1 make verify`，只适合本地迭代，不等价于交付验收。

## 环境要求

- Node.js 22+ 与 npm
- Python 3（当前 CI 使用 Python 3.11）
- `ffmpeg` 与 `ffprobe`
- Docker Desktop 或兼容的 Docker Compose 环境
  - 不是本地开发必需
  - 是 `make verify` 和最小部署路径的必需条件

## 首次初始化

```bash
git clone <your-repo-url>
cd badminton-ai-analysis
cp .env.example .env
make setup
```

`make setup` 会：

- 检查 `node`、`npm`、`python3`、`ffmpeg`、`ffprobe`
- 在支持的环境里尝试通过 Homebrew 或 `apt-get` 安装缺失基础工具
- 安装 backend / frontend 的 npm 依赖
- 安装 `analysis-service/requirements.txt` 中的 Python 依赖

如果自动安装失败，请按脚本提示手动补齐工具后重新执行 `make setup`。

## 标准命令总览

执行 `make help` 可以查看统一入口。常用命令如下：

| 命令 | 用途 | 备注 |
| --- | --- | --- |
| `make setup` | 安装本地依赖 | 首次进入仓库优先执行 |
| `make run` | 启动仓库 | Docker Compose 优先，失败时回退本地开发 |
| `make dev` | 强制本地开发模式 | 直接启动 frontend + backend |
| `make test` | 运行自动化测试 | backend + frontend Playwright + analysis-service |
| `make build` | 运行生产构建 | backend + frontend + Python 编译校验 |
| `make verify` | 严格交付门禁 | 需要可用 Docker daemon |
| `make verify-local` | 本地快速校验 | 跳过 Docker Compose 构建检查 |
| `make evaluate` | 运行离线评测 fixtures | 对比 checked-in baseline，适合算法回归 |
| `make logs` | 查看 Docker Compose 日志 | 仅 Docker 路径可用 |
| `make down` | 停止 Docker Compose 服务 | 仅 Docker 路径可用 |

## 启动路径

### 推荐路径：Docker Compose

```bash
make run
```

如果本机 Docker daemon 可用，仓库会启动：

- backend: `http://127.0.0.1:8787`
- frontend: `http://127.0.0.1:5173`

相关说明：

- frontend 通过 nginx 托管构建产物，并反向代理 `/api`、`/artifacts`、`/health`
- backend 容器内包含 `python3`、`pip`、`ffmpeg`
- 数据通过 Docker volume 持久化：
  - `backend_data`
  - `backend_uploads`

如果需要强制重建镜像：

```bash
./scripts/up.sh --build
```

### 回退路径：本地开发模式

```bash
make dev
```

或让 `make run` 在 Docker 不可用时自动回退。

本地开发模式会：

- 启动 backend 开发服务：`http://127.0.0.1:8787`
- 启动 frontend Vite dev server：`http://127.0.0.1:5173`
- 通过 `VITE_API_BASE` 或 Vite proxy 连接 backend

本地开发常见前提：

- 端口 `8787`、`5173` 未被占用
- 已执行 `make setup`
- `PYTHON_BIN` 能指向可用的 Python 解释器

## 环境变量

建议先复制 `.env.example` 到 `.env`。当前统一维护的变量如下：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `BACKEND_PORT` | `8787` | 本地开发和 Compose 映射的后端端口 |
| `FRONTEND_PORT` | `5173` | 本地开发和 Compose 映射的前端端口 |
| `VITE_API_BASE` | 空 | frontend API 根地址；Compose 推荐留空走同源，本地脚本会自动回退到 `http://127.0.0.1:${BACKEND_PORT}` |
| `PYTHON_BIN` | `python3` | backend 脚本和本地开发使用的 Python 入口 |
| `POSE_LANDMARKER_MODEL_PATH` | 空 | analysis-service 显式 pose landmarker 模型路径；设置后优先使用该文件 |
| `POSE_LANDMARKER_MODEL_CACHE_DIR` | 空 | analysis-service pose landmarker 缓存目录；默认使用 `analysis-service/models/` |
| `UPLOAD_MAX_FILE_SIZE_BYTES` | `209715200` | backend 上传大小限制 |
| `APT_MIRROR` | `mirrors.aliyun.com` | backend Dockerfile 安装系统依赖时使用的镜像源 |

`SKIP_DOCKER_VERIFY` 仅用于临时本地校验，不建议写入 `.env`。请直接执行：

```bash
SKIP_DOCKER_VERIFY=1 make verify
```

或使用：

```bash
make verify-local
```

## 最小部署说明

当前最稳定的部署路径是 Docker Compose。

### 标准步骤

```bash
cp .env.example .env
make run
```

或直接：

```bash
docker compose up --build -d
```

### 默认端口与健康检查

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:8787`
- backend health: `http://127.0.0.1:8787/health`
- frontend health（由 nginx 反代 backend）: `http://127.0.0.1:5173/health`

### 部署后最小 smoke check

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:5173/health
```

你还应确认：

- 前端首页可以在浏览器打开
- `docker compose ps` 中 backend / frontend 为健康状态
- 需要排障时可使用 `make logs`

更完整的交付检查、回归路径和故障排查见 [docs/engineering/DELIVERY-BASELINE.md](docs/engineering/DELIVERY-BASELINE.md)。

## 离线评测

仓库提供最小离线评测框架，用于量化算法和规则改动：

```bash
make evaluate
./scripts/evaluate.sh --action-type clear
./scripts/evaluate.sh --action-type smash
```

它会读取 `evaluation/fixtures/index.json`，回放 video / preprocess / pose fixtures，并与 `evaluation/baseline.json` 对比。

当前约定：

- `make evaluate` 默认会同时跑 `clear + smash` 两条离线基线
- `./scripts/evaluate.sh --action-type smash` 会单独跑 `smash` 的正式回归基线
- `make evaluate` 默认会在 baseline drift、缺 baseline case 或缺少 `requiredCoverageTagsByAction` 时返回非零
- `successRate` 的定义是“非 `rejected` / 全部”；`low_confidence` 仍计入成功完成率
- 只有明确接受新行为时，才允许执行 `./scripts/evaluate.sh --update-baseline`

以下改动默认需要补跑离线评测：

- 评分、阈值、fallback 逻辑
- pose summary / rejection reason / `debugCounts` 契约
- fixture / baseline / evaluation summary 逻辑
- 任何会影响 `analysisDisposition`、`issues`、`rejectionReasons`、`lowConfidenceReasons` 的改动

如何新增样本、刷新 baseline、解读 `primaryErrorCode` / disposition 一致性等指标见 [evaluation/README.md](evaluation/README.md)。

## 验收清单与回归路径

工程基线验收至少包括：

- 已执行 `make setup`
- `make test` 通过
- `make build` 通过
- 若改动触及评分、阈值、pose summary 契约、fixtures 或 baseline，`make evaluate` 通过
- 有 Docker daemon 的环境里 `make verify` 通过
- README、`.env.example`、`Makefile`、脚本、子系统 README 对同一命令语义保持一致

最小手工回归路径如下：

1. 启动服务：`make run`
2. 打开前端首页
3. 检查 `/health`
4. 创建分析任务
5. 上传一个本地短视频
6. 启动分析
7. 确认状态流转并看到结果页
8. 确认历史/复测入口未回归

样例视频不默认入仓，使用方式见 [samples/README.md](samples/README.md)。

## 子系统与文档入口

子系统说明：

- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)
- [analysis-service/README.md](analysis-service/README.md)

工程交付文档：

- [docs/engineering/DELIVERY-BASELINE.md](docs/engineering/DELIVERY-BASELINE.md)

产品与技术文档：

- [docs/prd/PRD.md](docs/prd/PRD.md)
- [docs/tech/TECH-SOLUTION.md](docs/tech/TECH-SOLUTION.md)
- [docs/design/INTERACTION-DESIGN.md](docs/design/INTERACTION-DESIGN.md)
- [spec/README.md](spec/README.md)
