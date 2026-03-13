---
name: repo-delivery-baseline
description: Use when a task changes repository-level delivery expectations, verification depth, build/test/evaluate scope, Docker Compose behavior, or any feature that must stay aligned with the repo's make-based handoff gate.
---

# Repo Delivery Baseline

## 何时使用

当任务涉及以下任一情况时使用：

- 改动会影响仓库级启动、测试、构建、验证或评测路径
- 变更触及 `Makefile`、`scripts/`、`docker-compose.yml`、`README.md`、`.env.example`
- 改动跨越 `frontend/`、`backend/`、`analysis-service/`、`shared/` 中两个以上子系统
- 需要判断应该跑 `make test`、`make build`、`make verify`、`make verify-local`、`make evaluate` 的哪一组
- 需要确认“本地通过”和“可交付通过”是否是同一件事

## 先读什么

这个仓库不是单模块项目，而是面向 MVP 交付的多模块仓库：

- `frontend/`：React 19 + Vite 的移动端 H5
- `backend/`：Fastify + TypeScript API 与本地文件或 SQLite 存储
- `analysis-service/`：Python 姿态分析辅助模块
- `shared/contracts.d.ts`：前后端共享契约
- `evaluation/`：离线回归基线与 fixtures

仓库的统一交付入口以根目录为准，而不是各子模块各自为政。真实命令基线见：

- `README.md`
- `docs/engineering/DELIVERY-BASELINE.md`
- `Makefile`
- `scripts/verify.sh`
- `scripts/evaluate.sh`

## 工作顺序/决策顺序

1. 先判断改动影响了哪些子系统和哪一层能力，再决定最小验证路径和最终 handoff 路径。
2. 仓库级结论必须基于根命令，而不是某个子目录局部命令。
3. 如果变更引入了新验证逻辑，优先复用 `Makefile` 和 `scripts/` 的现有入口，而不是再造平行命令。
4. 当实现会继续压大已有验证脚本或构建入口时，优先拆职责，再补规则。
5. 交付时明确区分“局部验证已完成”和“仓库级 handoff 已完成”。

## 核心规则

1. 先判断改动影响的是哪一层：
   - 只影响单页表现：通常先做定向前端验证
   - 影响 API、共享类型、产物结构、Docker、脚本：直接提高验证等级
2. 仓库级结论只能基于根命令给出，不要把 `cd frontend && npm run ...` 当成最终交付结论。
3. 默认命令语义：
   - `make run`：稳定启动入口，Docker Compose 优先，本地 dev 回退
   - `make test`：自动化测试集合
   - `make build`：生产构建与 Python 编译检查
   - `make verify`：严格交付门禁，包含 Docker Compose 构建校验
   - `make verify-local`：本地临时替代，不等价于交付验收
   - `make evaluate`：算法、评分、报告回归基线
4. 以下改动至少补跑 `make build`，不能只停留在 `make test`：
   - TypeScript 代码或类型
   - `shared/contracts.d.ts`
   - 构建脚本、Dockerfile、nginx、Vite/Fastify 启动路径
5. 以下改动默认补跑 `make evaluate`：
   - `reportScoringService`
   - pose summary / rejection reason / `analysisDisposition`
   - fixtures / baseline / evaluation summary
6. `make verify-local` 只用于当前机器没有 Docker daemon 的迭代期；对外 handoff、PR gate、交付口径仍以 `make verify` 为准。
7. 复用优先：优先扩展既有 `Makefile`、`scripts/verify.sh`、`scripts/evaluate.sh` 和文档真源，不新增平行验证入口。
8. 模块拆分优先：复杂校验逻辑应拆到聚焦脚本或 helper，让根命令保持薄；不要把多种验证职责堆进一个超长 target 或 shell 文件。
9. 文件体量控制：
   - 仓库级 script、验证入口、TS helper 通常接近 300 行就要考虑拆分
   - shared helper 超过约 200 行应按职责拆分
10. 现有大文件或大脚本不是模板；新增验证逻辑优先外抽，而不是继续让 handoff 入口失控。
11. 如果命令、环境变量或交付语义发生变化，要同步检查：
   - `README.md`
   - `docs/engineering/DELIVERY-BASELINE.md`
   - `Makefile`
   - 相关脚本
   - 受影响子模块 README

## 何时联动其他 skills

- `backend-api-contracts`：API 或共享契约变更需要判断验证等级
- `evaluation-and-regression`：需要决定是否补跑 `make evaluate`
- `docs-spec-sync`：仓库命令、门禁或运行方式说明变化
- 任何功能型 skill：它们负责改动本身，这个 skill 负责交付口径和验证门槛

## 何时读取 examples/

当你已经判断出影响层级后，再读最贴近的 example：

- `examples/frontend-minimal-verification.md`：主要是前端页面或交互变化时读
- `examples/backend-contract-full-verification.md`：接口、共享契约、跨模块联动变化时读
- `examples/verify-local-boundary.md`：需要解释 `verify-local` 与 `verify` 边界时读

## 任务完成后的输出要求

最终交付说明至少要写清：

- 为什么跑了这组命令，而不是另一组
- 结论是“局部验证通过”还是“仓库级 handoff 通过”
- 是否因为环境限制跳过了 `make verify` 或 `make evaluate`
