# 羽毛球 AI 动作分析项目

这是一个围绕“羽毛球动作视频分析 + 复测闭环反馈”的项目仓库。

目标是支持用户上传自己打羽毛球的视频，通过动作识别、关键帧提取、标准动作模板对比，输出结构化的动作诊断、问题影响说明、标准动作差异和复测闭环。

当前产品策略补充：首发阶段优先面向移动端上线，交互、原型和技术实现默认以移动端使用场景为主。
前端长期技术路线按 React Web / React H5 规划，当前不采用 React Native 作为默认实现路线。

---

## 1. 项目一句话

让羽毛球爱好者用一段自拍视频，就能获得接近教练式的动作反馈，并知道下一次复测该重点看什么。

---

## 2. 当前定位

这是一个偏垂直运动训练方向的 AI 产品，不只是视频识别工具。

当前的产品判断：
- 技术上可行
- 产品上有真实需求
- 商业上有变现可能
- 更适合做成“训练闭环产品”或“AI + 教练 / 球馆服务”

---

## 3. 当前进展

### 已完成
- [x] 明确项目方向与价值主张
- [x] 完成 MVP 范围定义
- [x] 输出主 PRD
- [x] 输出交互设计
- [x] 输出技术方案
- [x] 输出移动端原型主链路与关键异常状态
- [x] 建立轻量 Spec Coding 结构
- [x] 初始化本地 Git 仓库并推送远端
- [x] 搭建前后端最小技术 PoC
- [x] 跑通上传—任务—预处理占位—分析—结果链路

### 当前已有文档
#### 主文档
- `docs/prd/PRD.md`：当前主 PRD
- `docs/design/INTERACTION-DESIGN.md`：交互设计文档
- `docs/design/WIREFRAMES.md`：页面线框说明
- `docs/design/REPORT-TEMPLATE.md`：报告模板文档
- `docs/data/VIDEO-CAPTURE-SPEC.md`：视频拍摄规范
- `docs/tech/TECH-SOLUTION.md`：当前主技术方案
- `docs/tech/DEMO-PLAN.md`：Demo 实现计划

#### Spec Coding 目录
- `spec/PRODUCT-SPEC.md`
- `spec/INTERACTION-SPEC.md`
- `spec/DATA-SPEC.md`
- `spec/COMMIT-SPEC.md`
- `spec/README.md`

---

## 4. MVP 方案摘要

### 首期只做两个动作
1. 正手高远球
2. 杀球

### 首期约束条件
- 单人出镜
- 固定机位
- 5~15 秒短视频
- 推荐侧后方或正后方拍摄
- 一段视频只分析一种动作

### 首期核心输出
- 动作类型识别
- 动作总评分（辅助信息）
- 关键维度评分
- Top 3 动作问题
- 问题原因解释
- 复测关注点 / 轻量改进建议
- 标准动作关键帧对比
- 复测引导

---

## 5. 当前仓库结构

```text
badminton-ai-analysis/
├── README.md
├── .gitignore
├── backend/                 # Fastify + TypeScript 后端 PoC
│   ├── src/
│   ├── package.json
│   └── README.md
├── frontend/                # React + Vite 前端 PoC
│   ├── src/
│   ├── package.json
│   └── README.md
├── prototype/               # 可直接预览的移动端原型
├── docs/                    # 产品/设计/技术文档
│   ├── prd/
│   ├── tech/
│   ├── research/
│   ├── design/
│   └── data/
└── spec/                    # 面向实现协作的精简摘要规格
```

---

## 6. 当前代码能力

### frontend/
- 创建分析任务
- 上传真实视频文件
- 启动分析
- 自动轮询任务状态
- 自动拉取并展示结果
- 以移动端 H5 方式承接当前 PoC 链路

### backend/
- 创建任务
- 上传视频
- 记录任务状态
- 执行预处理占位链路
- 返回 mock 结构化分析结果
- 预留后续真实抽帧 / 姿态识别 / 评分逻辑的结构位置

---

## 7. 在其他电脑上启动项目

### 环境要求
- Node.js 22+（建议）
- npm
- Python 3
- ffmpeg
- ffprobe

### 首次初始化
```bash
git clone https://github.com/shaoyikun/badminton-ai-analysis.git
cd badminton-ai-analysis
cp .env.example .env
./scripts/setup-dev.sh
```

说明：`setup-dev.sh` 现在会在检测到缺失基础工具时，优先尝试自动安装（当前优先支持 Homebrew / apt-get）。

### 一条稳定启动命令
```bash
make run
```

默认会优先走 Docker Compose；如果本机没有 Docker，则回退到本地开发模式。

### 本地开发模式
```bash
./scripts/start-dev.sh
```

启动后默认地址：
- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8787`

### Docker Compose 启动
如果目标机器已经装了 Docker / Docker Compose，也可以直接：

```bash
docker compose up --build
```

或者直接一键启动：

```bash
./scripts/up.sh
```

说明：`up.sh` 现在同时兼容 Docker Desktop 和 colima 两种环境；如果检测到 Docker daemon 不可用，且本机装了 colima，才会尝试自动启动 colima。

如果你刚 pull 了新代码，或者我改了 Docker / 后端 / Python 分析逻辑，建议用带重建的版本：

```bash
./scripts/up.sh --build
```

也可以用 Makefile：

```bash
make up
make up-build
```

启动后默认地址：
- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8787`

常用命令：
```bash
docker compose up --build
docker compose down
docker compose logs -f backend
docker compose logs -f frontend
docker compose ps
```

对应 Makefile 快捷命令：
```bash
make run
make compose-up
make compose-ps
make compose-logs-backend
make compose-logs-frontend
make compose-down
```

### Compose 版本当前特性
- backend / frontend 都带 healthcheck
- frontend 改为 **Vite build + nginx 静态托管**，不再直接跑 dev server
- frontend 通过 nginx 反向代理 `/api`、`/data`、`/health` 到 backend
- backend 改为容器内直接跑构建产物（`npm start`），更接近发布态
- backend 的 `data/`、`uploads/` 用 Docker volume 持久化
- backend Dockerfile 支持通过 `APT_MIRROR` 切换 apt 镜像源，默认在 compose 中使用更快的镜像站以减少首次 build 耗时

---

## 8. 自动化维护命令

为了让 Codex 和人工协作都走同一套入口，当前仓库统一使用下面四条命令：

```bash
make run
make test
make build
make verify
```

它们分别表示：
- `make run`：启动仓库，优先 Docker，兜底本地开发模式
- `make test`：跑后端自动化测试和 Python 轻量测试
- `make build`：构建 backend、frontend，并编译 Python 源文件
- `make verify`：跑前端 lint、全部测试和全部构建，作为交付前检查

如果你不想用 Makefile，也可以直接调用：

```bash
./scripts/up.sh
./scripts/test.sh
./scripts/build.sh
./scripts/verify.sh
```

---

## 9. 当前测试 / 构建 / 部署现状

### 测试
- backend：使用 Node 内置 test runner 做轻量 API smoke test
- analysis-service：使用 `unittest` 做轻量文件级测试
- frontend：当前还没有独立组件测试，先通过 `eslint` 和生产构建兜底

### 构建
- backend：`npm run build`
- frontend：`npm run build`
- analysis-service：通过 `py_compile` 做语法级构建校验

### 部署
- 当前稳定部署方式仍是 Docker Compose
- 本地开发可直接跑 Node + Python + ffmpeg 工具链
- GitHub Actions 已接入仓库级验证，默认执行 `make verify`

---

## 10. Definition of Done

一项改动在当前仓库内算完成，至少要满足：
- 相关代码改动保持小而可 review
- `make test` 通过
- `make build` 通过
- 交付前能跑通 `make verify`
- 如果改了命令、环境变量或开发流程，需要同步更新 `README.md`、`.env.example`、`AGENTS.md` 和相关脚本
- 如果有剩余风险、跳过检查或已知限制，需要在交付说明里明确写出

### 说明
- `scripts/setup-dev.sh` 会安装 backend / frontend 的 npm 依赖，以及 `analysis-service/requirements.txt` 中的 Python 依赖。
- `scripts/start-dev.sh` 会同时启动 backend 和 frontend，并自动把 `python3` 路径注入给后端使用。
- `docker-compose.yml` 现在不只是开发联调版，而是更接近“可分发运行”的容器方案；backend 容器里已经包含 `python3`、`pip`、`ffmpeg`。
- 前端现在支持通过 `VITE_API_BASE` 配置后端地址；默认也支持走同源代理。
- 本地 `npm run dev` 时，Vite 已内置 `/api`、`/data`、`/health` 代理到 `127.0.0.1:8787`。
- 如果目标机器上的 Python 不叫 `python3`，可以手动指定：
```bash
PYTHON_BIN=/path/to/python ./scripts/start-dev.sh
```

---

## 8. Next Steps

### 技术方向
- [x] 已输出技术方案文档
- [x] 已搭建轻量 Spec Coding 结构
- [x] 已完成最小技术 PoC 主链路
- [ ] 将预处理从占位逻辑升级为真实元数据解析 / 抽帧
- [ ] 设计 MVP 动作评估指标
- [ ] 规划标准动作模板库
- [ ] 接入基础姿态识别方案

### 产品方向
- [x] 已补充主 PRD（包含优先级、页面字段、交互说明）
- [x] 已输出拍摄规范说明
- [x] 已完成分析报告模板
- [ ] 继续把原型与真实前端实现逐步对齐

### 研究方向
- [ ] 做竞品分析
- [ ] 访谈目标用户（20~50 人）
- [ ] 访谈羽毛球教练（5~10 人）
- [ ] 验证付费意愿与复测意愿

---

## 8. 初步里程碑建议

### Milestone 1：需求验证
- 完成 PRD、竞品、访谈提纲
- 明确目标用户画像
- 验证用户是否愿意上传视频和付费

### Milestone 2：方案设计
- 完成技术方案
- 完成动作标签体系
- 完成拍摄规范与报告模板

### Milestone 3：MVP 原型
- 完成核心页面原型
- 明确上传、分析、报告、复测流程

### Milestone 4：MVP 开发
- 完成基础上传与视频处理
- 完成两个动作的识别与评估
- 完成报告生成和历史记录

### Milestone 5：小范围测试
- 邀请真实用户试用
- 收集准确率、复测率、付费反馈
- 根据反馈迭代

---

## 9. 项目判断

这个项目最有希望的版本，不是“AI 替代羽毛球教练”，而是：

**AI 让普通爱好者更便宜、更高频地获得接近教练的反馈，并把反馈延伸成持续训练和服务。**

---

## 10. 当前阶段建议

现阶段最值得继续做的，不是无限补静态展示，而是按这个顺序推进：

1. 稳定前后端 PoC 主链路
2. 把预处理升级为真实视频处理第一版
3. 再接入基础姿态识别与规则评分
4. 最后补历史记录、复测对比和更完整的产品闭环
