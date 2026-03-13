---
name: repo-delivery-baseline
description: Use when a task changes repository-level delivery expectations, verification depth, build/test/evaluate scope, Docker Compose behavior, or any feature that must stay aligned with the repo's make-based handoff gate.
---

# 何时使用这个 skill

当任务涉及以下任一情况时使用：

- 改动会影响仓库级启动、测试、构建、验证或评测路径
- 变更触及 `Makefile`、`scripts/`、`docker-compose.yml`、`README.md`、`.env.example`
- 改动跨越 `frontend/`、`backend/`、`analysis-service/`、`shared/` 中两个以上子系统
- 需要判断应该跑 `make test`、`make build`、`make verify`、`make verify-local`、`make evaluate` 的哪一组
- 需要确认“本地通过”和“可交付通过”是否是同一件事

# 仓库背景与上下文

这个仓库不是单模块项目，而是面向 MVP 交付的多模块仓库：

- `frontend/`：React 19 + Vite 的移动端 H5
- `backend/`：Fastify + TypeScript API 与本地文件/SQLite 存储
- `analysis-service/`：Python 姿态分析辅助模块
- `shared/contracts.d.ts`：前后端共享契约
- `evaluation/`：离线回归基线与 fixtures

仓库的统一交付入口以根目录为准，而不是各子模块各自为政。真实命令基线见：

- `README.md`
- `docs/engineering/DELIVERY-BASELINE.md`
- `Makefile`
- `scripts/verify.sh`
- `scripts/evaluate.sh`

# 核心规则

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
   - `make evaluate`：算法/评分/报告回归基线
4. 以下改动至少补跑 `make build`，不能只停留在 `make test`：
   - TypeScript 代码或类型
   - `shared/contracts.d.ts`
   - 构建脚本、Dockerfile、nginx、Vite/Fastify 启动路径
5. 以下改动默认补跑 `make evaluate`：
   - `reportScoringService`
   - pose summary / rejection reason / `analysisDisposition`
   - fixtures / baseline / evaluation summary
6. `make verify-local` 只用于当前机器没有 Docker daemon 的迭代期；对外 handoff、PR gate、交付口径仍以 `make verify` 为准。
7. 如果命令、环境变量或交付语义发生变化，要同步检查：
   - `README.md`
   - `docs/engineering/DELIVERY-BASELINE.md`
   - `Makefile`
   - 相关脚本
   - 受影响子模块 README

# 推荐代码组织方式

- 仓库级入口优先复用现有 `Makefile` 与 `scripts/`
- 不要新增平行的根命令体系
- 若只是补规则或说明，优先更新已有文档，而不是再创建新的“说明副本”
- 若任务同时影响代码和文档，先以实现真相校正文档，不要只改描述不改入口

# 与其他 skills 的协作边界

- 与 `backend-api-contracts` 联动：当 API 或共享契约变更需要判断验证等级时
- 与 `evaluation-and-regression` 联动：当需要决定是否补跑 `make evaluate` 时
- 与 `docs-spec-sync` 联动：当仓库命令、门禁或运行方式说明变化时
- 与任何功能型 skill 联动：它们负责改动本身，这个 skill 负责交付口径和验证门槛

# 任务完成后的输出要求

最终交付说明至少要写清：

- 本次改动影响了哪些子系统
- 选择了哪些验证命令，以及为什么
- 若只跑了 `verify-local` 或跳过了 `make evaluate`，必须明确原因
- 若命令/文档语义有变化，列出已同步的入口文档
