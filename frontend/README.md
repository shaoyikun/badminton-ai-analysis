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

本地 `npm run dev` 会通过 `vite.config.ts` 将 `/api`、`/data`、`/health` 代理到 `http://127.0.0.1:8787`。

## 当前能力

- 基于真实路由的移动端 H5 产品壳层
- 首页、拍摄指引、上传、分析中、报告、历史、复测对比、错误页
- 上传页一键串行完成创建任务、上传视频、启动分析
- 自动轮询分析状态并在完成后跳转报告
- 历史样本查看与设为对比基线
- 隐藏式联调抽屉，支持 `?debug=1` 开启

## Docker 路径说明

Compose 路径下，frontend 会：

- 先执行 `vite build`
- 由 nginx 托管静态资源
- 通过 nginx 反向代理 `/api`、`/artifacts`、`/health` 到 backend
