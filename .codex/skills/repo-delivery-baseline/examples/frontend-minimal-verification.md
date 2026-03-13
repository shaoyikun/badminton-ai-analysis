# Task

改造 `frontend/src/features/home/HomePage.tsx` 的首页产品表达，但不改 API 契约、共享类型或 Docker 路径。

# Before

- 首页属于移动端 H5 路由壳层的一部分
- 仓库统一门禁在根目录 `make` 命令
- 这次改动只落在前端页面与样式层

# Goal

给出“前端改动后的最小验证路径”，同时避免把局部命令误当成仓库交付结论。

# Recommended structure

- 先跑前端局部验证：`cd frontend && npm run test:e2e`
- 若改动涉及 TypeScript/构建入口，再补 `make build`
- 需要给仓库级 handoff 结论时，再补 `make verify` 或明确说明只做了局部验证

# Key implementation notes

- 不要只写“跑了 Vite dev 就算完成”
- 如果首页 CTA、文案、路由跳转变了，优先补 Playwright 主漏斗场景
- 如果只改静态文案且没动构建/契约，可以不强制跑 `make evaluate`
- 最终说明里要区分：
  - “页面层已验证”
  - “仓库级 handoff 尚未验证”

# Optional code sketch

```text
最小本地路径：
1. cd frontend && npm run test:e2e
2. 若改到 TS/构建依赖，再跑 make build
3. 真正交付前跑 make verify
```
