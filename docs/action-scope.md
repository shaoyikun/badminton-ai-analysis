# Action Scope

## 当前结论

截至 2026-03-13，`badminton-ai-analysis` 的正式分析范围已开放为 `clear + smash`。

这意味着：

- 共享契约中的公开 `ActionType` 为 `clear | smash`
- 前端正式动作、拍摄指引、上传说明、历史筛选与报告文案都支持正手高远球和杀球
- 后端正式分析链路、评分逻辑、标准动作对照、历史与复测对比都支持双动作
- 历史记录和复测对比仍然只允许同动作类型内比较，不允许跨动作混比

此前补齐的 `smash` 独立 shadow/profile 能力已经接入正式 runtime：

- backend 继续使用独立的 `smash` scoring profile
- 离线评测仍可通过 `./scripts/evaluate.sh --action-type smash` 单独运行
- `smash` 继续使用独立的标准动作对照素材、文案、issue 标签和 baseline
- 公开 runtime 现在直接返回 `smash` 正式报告，但评分版本仍独立于 `clear`

## 公开支持后的观测边界

当前公开支持 `smash`，不代表系统已经具备完整击球质量判断能力：

- `repeatability` 仍主要依赖 `contactPreparationScore + scoreVariance + temporalConsistency + motionContinuity`
- 还没有真正的动作阶段切分
- 还没有球拍、羽球、击球点检测
- `viewProfile` 仍是轻量几何推断，不是时序视角分类器
- 报告仍主要以 summary 聚合证据，不是逐帧因果解释

当前 `smash` 的观测边界仍然有限：

- 只能判断身体加载、挥拍臂加载、击球候选到随挥的连贯性
- 不能判断真实击球点、球速、落点
- 不能判断球拍、羽球或触球质量

## 兼容策略

- 公开 API / shared contracts：声明 `clear | smash`
- 旧客户端兼容：若继续传 `"smash"`，会直接进入正式 `smash` 分析链路
- 其他未知动作值：返回 `invalid_action_type`

## 当前正式开放的最小前提

当前已满足以下前提：

1. `smash` 已使用独立评分维度和阈值，不复用 `clear` 阈值
2. `smash` 已有最小可验证 regression fixtures 和 baseline
3. `standardComparison`、文案和参考图逻辑已独立输出 `smash`
4. 文档已写清 `smash` 在机位、准备态、时序稳定性上的专属观测边界
5. clear + smash 已纳入统一离线评测回归
6. 公开协议、历史/comparison 和前端入口已在同一阶段一次收口
