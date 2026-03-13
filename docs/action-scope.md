# Action Scope

## 当前结论

截至 2026-03-13，`badminton-ai-analysis` 的正式分析范围统一收敛为 `clear-only`。

这意味着：

- 共享契约中的公开 `ActionType` 只保留 `clear`
- 前端正式动作、拍摄指引、上传说明、历史筛选与报告文案都围绕正手高远球
- 后端正式分析链路、评分逻辑、标准动作对照、错误文案都以 `clear` 为唯一支持动作
- 旧客户端若仍显式传 `"smash"`，后端会返回 `unsupported_action_scope`

同时，Phase 5 已补齐 `smash` 的离线 shadow mode：

- backend 内部评分层已经有独立的 `smash` shadow profile
- 离线评测已可通过 `./scripts/evaluate.sh --action-type smash` 单独运行
- `smash` shadow 会使用独立的标准动作对照素材、文案、issue 标签和 baseline
- 这条能力只服务于离线评测与开发验证，不改变公开 API / 前端正式入口

## 为什么这次不继续支持 Smash

当前后端还不具备低风险的 `smash` 正式支持条件：

- 评分维度、阈值和解释文案都仍围绕 `clear` 构建
- `repeatability` 仍主要依赖 `contactPreparationScore + scoreVariance + temporalConsistency + motionContinuity`
- 还没有真正的动作阶段切分
- 还没有球拍、羽球、击球点检测
- `viewProfile` 仍是轻量几何推断，不是时序视角分类器
- 报告仍主要以 summary 聚合证据，不是逐帧因果解释

当前 `smash` shadow 的观测边界也仍然有限：

- 只能判断身体加载、挥拍臂加载、击球候选到随挥的连贯性
- 不能判断真实击球点、球速、落点
- 不能判断球拍、羽球或触球质量
- 不能直接替代 Phase 6 的公开协议、前端入口和历史/复测能力

## 兼容策略

- 公开 API / shared contracts：只声明 `clear`
- 旧客户端兼容：后端继续把 `"smash"` 识别为已知但未开放动作，并返回 `unsupported_action_scope`
- 其他未知动作值：返回 `invalid_action_type`

## 重新开放 Smash 前的最小条件

满足以下条件之前，不应把 `smash` 重新放回正式动作范围：

1. 有独立的 `smash` 评分维度和阈值，不能直接复用 `clear` 阈值
2. 有最小可验证的 `smash` regression fixtures 和 baseline
3. `standardComparison`、文案和参考图逻辑能独立输出 `smash`
4. 至少能说明 `smash` 在机位、准备态、时序稳定性上的专属观测边界
5. 能跑通离线评测，并证明 `smash` 不会把 `clear` 主链路回归带坏
6. Phase 6 中公开协议、历史/comparison 和前端入口的改动，必须在独立阶段里一次收口，不与 shadow mode 混做
