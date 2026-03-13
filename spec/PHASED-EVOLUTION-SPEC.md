# PHASED-EVOLUTION-SPEC

## 0. 当前推进状态

这是后续 Codex 每次开工前必须先读的入口，用来避免重复判断“现在做到第几阶段了”。

### 当前结论

- 当前项目状态：`phase_4_completed`
- 当前已完成到：`Phase 4：置信度与失败策略校准`
- 当前下一阶段：`Phase 5：Smash 影子模式`
- 当前下一阶段状态：`not_started`
- 最后更新日期：`2026-03-13`

### 阶段状态表

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| Phase 1 | `completed` | 动作阶段锚点、debug 可见性、测试与文档已完成 |
| Phase 2 | `completed` | 分阶段报告、comparison 兼容策略、前端展示、测试与文档已完成 |
| Phase 3 | `completed` | clear-only 离线评测基线、fixture/baseline、文档与 gate 已完成 |
| Phase 4 | `completed` | 拒绝/低置信阈值、边界 fixture、文档与 gate 已完成 |
| Phase 5 | `not_started` | 可开始为 smash 建立影子模式基线 |
| Phase 6 | `blocked` | 依赖 smash 影子模式完成 |

### 状态枚举

- `not_started`：阶段还没开始
- `in_progress`：阶段正在实现，但还没满足验收条件
- `completed`：阶段验收条件已满足，可以进入下一阶段
- `blocked`：当前阶段还不能开始，存在明确前置条件

### 维护规则

后续每次 Codex 推进项目时，在开始实现前后都要检查并在必要时更新这一节：

1. 开工前先读取“当前下一阶段”和“阶段状态表”。
2. 若本次完成了一个阶段，必须把该阶段改成 `completed`，并把下一个阶段改成 `not_started` 或 `in_progress`。
3. 若阶段做了一半停下，必须把该阶段标记为 `in_progress`，并补一句阻塞点或剩余项。
4. 若发现原阶段过大，应先更新本 spec 的阶段拆分与状态，再继续编码。
5. 没有更新这一区域的实现交付，视为阶段 handoff 不完整。

## 1. 文档目标

这份 spec 把深度研究报告中的有效建议，收敛成适合当前仓库继续演进的阶段路线图。

约束：

- 这是一份 `spec-only` 文档，不代表任何阶段已经开始实现
- 后续 Codex 每个会话只允许推进一个阶段
- 每个阶段都必须是单次会话内可收口、可验证、可交接的最小闭环
- 如果实现中发现前置条件不足，应先停在当前阶段并更新 spec，不要跨阶段顺手扩写

## 2. 当前基线（截至 2026-03-13）

当前仓库已经吸收了研究报告中的一部分高优先级建议，后续阶段不应重复建设这些内容：

- 正式动作范围已收敛为 `clear-only`
- MediaPipe Tasks pose 模型已经通过锁文件固化版本与校验信息
- `analysis-service` 已优先使用 Tasks `VIDEO` mode，并对关键点做时序平滑
- 报告已拆分为“动作质量”和“证据置信度”两条线
- backend report 已开始消费专项几何特征，不再只依赖旧版 `bodyTurnScore` / `racketArmLiftScore`
- clear-only 离线评测基线、checked-in fixtures/baseline 与 `make evaluate` gate 已建立

当前真正仍未完成、也是后续阶段要继续解决的问题：

- 还没有稳定的动作阶段切分，`repeatability` 仍主要依赖全局聚合代理
- 报告虽有专项特征，但还不能明确说明“哪一个动作阶段”出了问题
- `smash` 仍处于关闭状态，不能在没有独立评测和独立规则的前提下重新开放

相关现状主文档：

- `docs/action-scope.md`
- `docs/algorithm-baseline.md`
- `docs/feature-spec.md`

## 3. 会话推进规则

后续 Codex 必须遵守下面的阶段推进纪律：

1. 一个会话只做一个阶段，不同时推进两个阶段。
2. 一个阶段只能修改该阶段声明的主边界；超出范围的工作一律记录到下一阶段，不顺手实现。
3. 每个阶段结束时都要同时更新：
   - 代码
   - 自动化测试
   - 对应 `docs/` / `spec/`
4. 只有当本阶段验收条件满足后，下一阶段才允许开始。
5. 若某阶段需要新增命令、fixture、协议字段或评分版本，必须在该阶段内把使用方式写清楚，不能留给下一阶段补文档。
6. 默认按仓库标准命令完成验证：
   - `make test`
   - `make build`
   - `make verify`
   - 若受 Docker 环境限制，至少说明为何只执行了 `make verify-local`
7. 如果某阶段在实施前已经明显超出单会话容量，应先修改这份 spec 把阶段继续拆小，再开始写代码。

## 4. 阶段总览

| 阶段 | 主题 | 单会话目标 | 下一阶段前置条件 |
| --- | --- | --- | --- |
| Phase 1 | 动作阶段锚点 | 让 `clear` 输出稳定的阶段候选与锚点，但先不改评分 | Phase 1 字段稳定、测试通过 |
| Phase 2 | 分阶段报告 | 让报告和复测对比开始消费阶段信息 | Phase 2 评分版本与兼容策略明确 |
| Phase 3 | 离线评测基线 | 建立 `clear-only` 的最小可复现评测闭环 | Phase 3 产出固定 fixture 和指标口径 |
| Phase 4 | 置信度与失败策略校准 | 用评测结果校准拒绝/低置信阈值 | Phase 4 阈值有 fixture 佐证 |
| Phase 5 | Smash 影子模式 | 为 `smash` 补独立 spec、fixture 和评分口径，但不开放 runtime | Phase 5 clear/smash 双基线可离线评测 |
| Phase 6 | Smash 正式开放 | 在 clear 主链路不回归的前提下开放 `smash` | Phase 6 clear + smash 联合回归通过 |

## 5. Phase 1：动作阶段锚点

### 5.1 目标

在 `clear-only` 范围内，为当前 pose summary 增加“准备态 / 引拍 / 击球候选 / 随挥候选”的阶段锚点或阶段窗口输出，让系统第一次具备稳定的时序骨架，但先不直接改用户可见评分。

### 5.2 主要触点

- `analysis-service/services/pose_estimator.py`
- `shared/contracts.d.ts`
- `backend/src/services/poseService.ts`
- `docs/algorithm-baseline.md`
- `docs/feature-spec.md`

### 5.3 本阶段必须完成

- 基于现有 `VIDEO` mode 与专项特征，输出可复用的阶段候选字段
- 明确阶段字段的命名、含义、缺失条件和回退行为
- 让 debug 路径可以看到阶段候选结果
- 补齐最小测试，证明阶段锚点在稳定样本和低质量样本上的行为可预期

### 5.4 本阶段明确不做

- 不调整公开报告分数
- 不新增 `smash`
- 不引入球拍、羽球或击球点检测
- 不改前端页面展示

### 5.5 验收条件

- `PoseAnalysisResult.summary` 新字段在 contracts 中稳定定义
- 现有 report 输出仍保持兼容
- debug 文档能说明如何读取阶段锚点
- 测试覆盖正常样本、证据不足样本和阶段缺失样本

## 6. Phase 2：分阶段报告

### 6.1 目标

让 report 和 comparison 开始消费 Phase 1 的阶段结果，把“动作复现稳定性不足”从全局方差代理，升级成至少部分依赖阶段窗口的解释型评分。

### 6.2 主要触点

- `backend/src/services/reportScoringService.ts`
- `backend/src/services/taskService.ts`
- `shared/contracts.d.ts`
- `spec/DATA-SPEC.md`
- `docs/design/REPORT-TEMPLATE.md`

### 6.3 本阶段必须完成

- `swing_repeatability` 或等价维度开始显式引用阶段信息
- `issues` / `suggestions` / `retestAdvice` 能指出主要薄弱阶段，而不是只说全局不稳定
- `scoringModelVersion` 升级，并定义跨版本 comparison 的降级策略
- 若阶段证据缺失，report 要优雅回退到当前基线逻辑，而不是直接报错

### 6.4 本阶段明确不做

- 不改动作范围
- 不做新的模型或检测器接入
- 不做教练端或训练计划生成

### 6.5 验收条件

- 至少一个公开评分维度完成“阶段感知”
- 历史对比在跨评分版本时有明确兼容行为
- 报告模板和数据 spec 已同步更新
- 新增测试能区分“动作问题”和“阶段证据缺失”

## 7. Phase 3：离线评测基线

### 7.1 目标

建立 `clear-only` 的最小可复现评测闭环，让后续阈值、评分和动作扩展都有统一回归基线。

### 7.2 主要触点

- `backend/src/dev/evaluation.ts`
- `backend/src/evaluation.test.ts`
- `samples/` 或专用 fixture 目录
- `docs/engineering/DELIVERY-BASELINE.md`
- `README.md`

### 7.3 本阶段必须完成

- 定义最小 fixture 集合与 manifest 结构
- 输出固定指标：
  - 成功完成率
  - `hard reject` / `low_confidence` / `analyzable` 分布
  - 主要错误码分布
  - Top issue / disposition 一致性
- 写清如何运行评测、如何解读结果、什么算回归
- 至少覆盖机位不佳、主体过小、遮挡/光线差、准备态较弱、准备态较稳这几类样本

### 7.4 本阶段明确不做

- 不追求大规模标注数据集
- 不引入复杂训练或 benchmark 平台
- 不在本阶段开放 `smash`

### 7.5 验收条件

- 本地能稳定复现同一份评测摘要
- 评测夹具和预期结果被纳入版本管理
- 交付文档说明哪些改动必须补跑评测

## 8. Phase 4：置信度与失败策略校准

### 8.1 目标

基于 Phase 3 的评测结果，重新校准“硬拒绝 / 低置信完成 / 正常完成”的分界，减少因机位或时序噪声导致的误伤。

### 8.2 主要触点

- `analysis-service/services/pose_estimator.py`
- `backend/src/services/reportScoringService.ts`
- `backend/src/services/taskService.ts`
- `spec/DATA-SPEC.md`
- `docs/algorithm-baseline.md`

### 8.3 本阶段必须完成

- 把当前阈值和 fixture 结果绑定起来，而不是只凭经验调参
- 明确哪些 `rejectionReasons` 继续保留为硬拒绝，哪些下沉为低置信提示
- 校准 `confidenceScore` 与 `analysisDisposition` 的阈值
- 若用户可见错误文案发生变化，同步更新错误映射文档

### 8.4 本阶段明确不做

- 不开放新动作
- 不重构整个 pipeline
- 不把所有低质量样本都强行放行

### 8.5 验收条件

- 每一类 disposition 都有 fixture 支撑
- 阈值变化前后有评测对比说明
- clear 主链路在评测结果上不出现未解释的大幅退化

## 9. Phase 5：Smash 影子模式

### 9.1 目标

在保持 runtime `clear-only` 的前提下，为 `smash` 补齐独立的离线规则、标准对照和评测样本，先以“影子模式”验证，不直接暴露给公开 API。

### 9.2 主要触点

- `docs/action-scope.md`
- `spec/PRODUCT-SPEC.md`
- `spec/DATA-SPEC.md`
- `backend/src/dev/evaluation.ts`
- `docs/design/REPORT-TEMPLATE.md`

### 9.3 本阶段必须完成

- 定义 `smash` 的独立评分维度或权重口径，不能直接复用 `clear`
- 补齐 `smash` 的标准动作对照文案与素材映射规则
- 补齐 `smash` 的离线 fixtures 与期望输出
- 在 spec 中写清楚 `smash` 何时可以进入下一阶段

### 9.4 本阶段明确不做

- 不修改公开 `ActionType`
- 不修改前端正式动作入口
- 不让生产/演示路径开始接收 `smash`

### 9.5 验收条件

- runtime 仍保持 `clear-only`
- 离线评测已经可以单独跑 `smash`
- `smash` 不会复用 `clear` 的评分阈值与结论模板

## 10. Phase 6：Smash 正式开放

### 10.1 目标

在 clear 主链路已有稳定评测保护的前提下，正式开放 `smash` 的公开协议、后端分析链路和前端入口。

### 10.2 主要触点

- `shared/contracts.d.ts`
- `backend/src/services/taskService.ts`
- `backend/src/server.ts`
- `frontend/src/`
- `docs/action-scope.md`
- `spec/PRODUCT-SPEC.md`
- `spec/MVP-ARCHITECTURE-SPEC.md`

### 10.3 本阶段必须完成

- 公开 `ActionType` 扩回 `clear | smash`
- 后端校验、报告生成、历史筛选、复测对比都支持 `smash`
- 前端动作入口、拍摄指引、报告模板与错误文案都能独立表达 `smash`
- clear 与 smash 双动作回归同时通过

### 10.4 本阶段明确不做

- 不在同一阶段继续扩第三种动作
- 不在动作开放同时引入大范围 UI 重构
- 不把“动作开放”和“教练端能力”绑在一起上线

### 10.5 验收条件

- clear 和 smash 都有离线评测基线
- clear 主链路无显著回归
- spec / docs / fixtures / 自动化测试全部同步

## 11. 暂不进入当前路线图的内容

下面这些方向在研究报告里被识别为长期能力缺口，但不纳入当前 6 个阶段：

- 球拍检测、羽球检测、击球点精定位
- 端到端动作分类或完整时序模型替换
- 结构化训练计划生成
- 教练端、俱乐部端、多角色后台

这些能力只有在 Phase 1 到 Phase 6 完成后，才适合单独开新 spec。
