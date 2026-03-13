# Frontend H5

前端的统一启动、测试、构建和交付门禁以仓库根目录为准：

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

## 本地前端调试

只调试前端时，可以单独执行：

```bash
cd frontend
npm run dev
```

默认开发地址：

- `http://127.0.0.1:5173`

## 前端 UI 自动化测试

前端 H5 的主流程与关键状态页已经接入 Playwright：

```bash
cd frontend
npm run test:e2e
```

常用补充命令：

```bash
cd frontend
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:install
```

说明：

- Playwright 默认以移动端 viewport 运行
- 测试会自行启动一个 Vite dev server，并用 mock API 覆盖 `/api` 与 `/artifacts`
- 上传页使用仓库内 fixture，不依赖桌面文件或本地脏数据

本地 `npm run dev` 会通过 `vite.config.ts` 将 `/api`、`/artifacts`、`/health` 代理到 `http://127.0.0.1:8787`。

## 当前能力

- 基于真实路由的移动端 H5 产品壳层
- 首页、拍摄指引、上传、分析中、报告、历史、复测对比、错误页
- 上传页先完成创建任务与整段视频粗扫，再由用户确认候选片段后启动最终分析
- 自动轮询分析状态并在完成后跳转报告
- 历史样本查看与设为对比基线
- 隐藏式联调抽屉，支持 `?debug=1` 开启

## 路由与深链

当前前端公开路由固定为：

- `/`
- `/guide`
- `/analyses/new`
- `/analyses/:taskId/processing`
- `/analyses/:taskId/report`
- `/history`
- `/analyses/:taskId/comparison`
- `/error`

说明：

- 旧 `/upload`、`/processing`、`/report`、`/compare` 已不再作为兼容入口保留
- 报告页、分析中页、对比页默认按 `taskId` 从 API 冷启动 hydration
- `sessionStorage` 只保留上传草稿、候选片段选择、动作类型和 debug 开关，不再保存报告/对比主数据

## 样式与组件约束

当前移动端 H5 样式固定采用：

- `*.module.scss` 作为页面与组件默认样式方案
- `frontend/src/styles/tokens.scss` 维护设计 token
- `frontend/src/styles/globals.scss` 只保留 reset、root token 和极少量全局基础样式
- `frontend/src/styles/PageLayout.module.scss` 作为页面级公共布局壳层

组件库策略固定为：

- 允许选择性使用 `antd-mobile`
- 当前已用于移动端交互原件，例如 `Selector`、`Popup`
- 不允许让组件库接管品牌视觉、报告叙事、Hero 卡片或训练建议卡片

## Docker 路径说明

Compose 路径下，frontend 会：

- 先执行 `vite build`
- 由 nginx 托管静态资源
- 通过 nginx 反向代理 `/api`、`/artifacts`、`/health` 到 backend
