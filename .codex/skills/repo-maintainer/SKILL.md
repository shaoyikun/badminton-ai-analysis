---
name: repo-maintainer
description: Use when the task is about maintaining this repository as a Codex-friendly product repo, including AGENTS instructions, scripts, env files, README workflow docs, build/test/verify commands, and other automation hygiene.
---

# Repo Maintainer

## 何时使用

当任务聚焦于仓库级维护、自动化和说明真源时使用：

- `AGENTS.md`、`README.md`、`Makefile`、`scripts/`、`.env.example`、`docker-compose.yml` 相关调整
- 启动、测试、构建、验证命令或交付口径变化
- 需要修正 repo-local skill、仓库说明、脚本入口之间的不一致
- 需要保持 Codex 在这个仓库里的维护体验健康、可交付、可复用

## 先读什么

- `AGENTS.md`
- `README.md`
- `Makefile`
- `docs/engineering/DELIVERY-BASELINE.md`
- `scripts/`
- `docker-compose.yml`

## 工作顺序/决策顺序

1. 先确认仓库级真源在哪：命令以 `Makefile` 和 `scripts/` 为主，交付口径以 `README.md` 与 `DELIVERY-BASELINE` 为主。
2. 优先修复已有入口，而不是新增平行入口或新的根级工具体系。
3. 只在最小必要范围内同步文档、脚本、说明；避免把同一条规则复制到多个文件里失去真源。
4. 如果变更会影响 handoff 结论，再联动 `repo-delivery-baseline` 判断验证等级。
5. 最终说明里把命令面、文档面、技能面分别讲清楚，避免用户只能从 diff 猜意图。

## 核心规则

1. 复用优先：优先扩展现有 `Makefile`、`scripts/`、README、AGENTS 和既有 shell wrapper，不新造第二套根命令体系。
2. 模块拆分优先：复杂 shell 逻辑应放到聚焦脚本里，让 `Makefile` target 保持薄；不要把多种职责塞进单个超长 recipe 或说明段落。
3. 文件体量控制：
   - 仓库级 script、TS helper、验证入口通常接近 300 行就要考虑按职责拆分
   - 文档若开始重复已有规则，应改为引用真源，而不是继续扩写副本
4. 现有大文件或大脚本不是模板；如果必须继续改它们，优先把新增职责外抽成小函数、小脚本或更清楚的章节。
5. 不要让 `AGENTS.md`、`README.md`、`DELIVERY-BASELINE` 互相复制整段规则；每份文件都应保留清晰职责边界。
6. 命令、环境变量或交付语义变化时，必须检查相关说明是否同步，而不是只改一个入口。
7. 仓库已经选定的技术栈约束，例如 `sass`、`*.module.scss`、选择性 `antd-mobile`、语义化 `taskId` 路由，不要只留在实现里；要同步到 README、前端 README、spec 和必要的 repo-local skills。
8. 新增依赖或脚手架能力时，优先补充现有说明与 skill，而不是默认让后来的人从 lockfile 猜技术决策。

## 何时联动其他 skills

- `repo-delivery-baseline`：需要判断 `make test`、`make build`、`make verify`、`make evaluate` 的跑法和口径
- `docs-spec-sync`：命令、流程或文档真源语义变化
- `skill-evolution`：新变更、坑点或排障经验值得回写到现有 skills，或需要新增 repo-local skill
- 任一功能型 skill：当仓库级入口变化会反过来影响功能实现或验证方式

## 何时读取 examples/

当前这个 skill 没有 examples 目录。若要决定验证等级、交付边界或文档同步策略，优先联动 `repo-delivery-baseline` 或 `docs-spec-sync` 的 examples。

## 任务完成后的输出要求

最终交付说明至少要写清：

- 改了哪些仓库级入口、说明或维护规则
- 是否保持了现有命令面和真源分工，还是有意调整了它们
- 哪些文档、脚本、skill 已同步，哪些没动以及为什么
- 对 handoff 或日常开发流程的影响是什么
