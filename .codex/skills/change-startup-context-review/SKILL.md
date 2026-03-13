---
name: change-startup-context-review
description: Use this skill before making any code or product change. First inspect the best available existing sources of truth in the repository and related context, then use them to guide implementation. Do not start coding from scratch assumptions when the repository already contains relevant docs, specs, tests, scripts, skills, APIs, or existing implementations.
---

# Change Startup Context Review

## 何时使用

这是一个仓库级通用前置 skill。除非任务非常小、非常局部且约束已经显而易见，否则任何开发改动开始前都应先触发它。

至少在以下情况使用：

- 任何开发改动开始前
- 任何需要判断“仓库里是不是已经有类似能力”的任务
- 任何可能受已有 `spec/`、`docs/`、tests、contracts、fixtures、scripts 影响的任务
- 任何跨模块改动
- 任何看起来简单，但其实可能受既有实现或协作规范约束的任务
- 任何用户需求还没有明确落点，需要先判断该改 frontend、backend、shared、analysis-service、evaluation 还是 docs/spec 的任务

## 先读什么

这个 skill 的目标不是让你把整个仓库重读一遍，而是先建立“这次改动最应该参考哪些现有真源”的最小集合。

优先检查当前仓库里的可信来源：

- 仓库级真源：
  - `AGENTS.md`
  - `README.md`
  - `docs/engineering/DELIVERY-BASELINE.md`
  - `Makefile`
  - `scripts/`
- 产品/交互/技术说明：
  - `docs/`
  - `spec/`
  - `docs/feature-spec.md`
- 子模块真源：
  - `frontend/README.md`
  - `backend/README.md`
  - `analysis-service/README.md`
- 共享契约与稳定结构：
  - `shared/contracts.d.ts`
  - `shared/upload-flow.json`
- 现有实现：
  - `frontend/src/`
  - `backend/src/`
  - `analysis-service/`
- 测试与回归材料：
  - `frontend/e2e/`
  - `backend/src/*.test.ts`
  - `analysis-service/tests/`
  - `evaluation/`
- repo-local skills：
  - `.codex/skills/`
  - 如果仓库未来新增 `.agents/skills/`，也应视为同类参考来源
- 任务附带输入：
  - 截图、设计稿、接口样例、错误日志、录屏、复现步骤

## 核心原则

### A. 先查再改

- 任何开发改动前，不要直接写代码
- 先检查仓库中现有可获得的信息
- 先确认是否已有类似实现、已有规范、已有接口、已有测试、已有文档、已有 skill
- 如果已有内容足以约束实现，应先对齐现有内容再修改

### B. 优先使用现有“可信来源”

- 优先看仓库内已存在的 README、spec、docs、tests、fixtures、contracts、scripts、skills 和现有实现
- 优先找当前模块的真源，而不是凭经验脑补“这类项目通常怎么做”
- 如果现有页面、现有 API、现有 service、现有 adapter 已经表达了模式，先复用其结构和边界

### C. 查阅要有目的，不是机械浏览

查阅时重点回答这些问题：

- 这类功能是不是已经存在
- 现有实现在哪里
- 有没有既定的数据结构、接口契约、状态模型、页面模式
- 有没有已写好的测试、mock、fixture 可以复用
- 有没有 spec/docs 规定行为边界
- 有没有现有 skill 已经约束了这类任务
- 这次改动会影响哪些模块

### D. 先建立“启动结论”，再开始实现

在动手之前，先形成一段简要启动结论，至少包括：

- 已查阅了哪些来源
- 找到了哪些直接相关内容
- 哪些内容可以复用
- 哪些地方存在空白，需要新实现
- 哪些约束必须遵守
- 本次改动的影响范围是什么

### E. 避免重复造轮子

- 如果现有仓库里已经有可复用实现，不要重新造一个平行版本
- 如果已有 spec/docs/skill 已经覆盖规则，不要另起一套矛盾规则
- 如果已有测试覆盖相近场景，优先扩展而不是另建重复测试

### F. 不确定时优先扩大上下文

- 当任务看似局部，但可能受更高层规则影响时，先向上看一层
- 例如前端改动要看 shared contracts、API mock、页面路由
- backend 改动要看 shared types、frontend 消费方式、tests、analysis-service 边界
- docs/spec 改动要看实现是否已经存在

## 启动决策流

1. 先判断改动落点：
   - `frontend`
   - `backend`
   - `shared`
   - `analysis-service`
   - `evaluation`
   - `docs/spec`
   - `cross-module`
2. 先查该落点最直接的真源：
   - 对应 README、目录、实现、tests、fixtures、skills
3. 再判断是否需要向上扩一层：
   - 是否有共享契约
   - 是否有消费者/生产者
   - 是否有文档或交付约束
4. 当你已经能写出“启动结论”时就停止扩查，不要求把仓库读完
5. 有了启动结论后，再切到对应的具体领域 skill 开始实现

## 默认启动检查清单

### 轻量检查

适用于明确的小改动、单模块改动：

- 根 `README.md`
- 当前改动目录下的 `README`
- 最相关的 1 个 repo-local skill
- 最相关的现有实现文件
- 最相关的 tests / mock / fixtures
- 如有公开结构变化，再补看 `shared/contracts.d.ts` 或相关 spec/docs

### 完整检查

适用于跨模块改动、协议变化、主流程变化、需求落点不清晰的任务：

- `AGENTS.md`
- `README.md`
- `docs/engineering/DELIVERY-BASELINE.md`
- 当前涉及子模块的 README
- 相关 `spec/` 与 `docs/`
- 相关 repo-local skills
- 相关 tests / mocks / fixtures / evaluation baseline
- 相关 shared contracts/types/schemas
- 相关现有页面、API、service、adapter
- 相关脚本和命令入口
- 任务附带的截图、设计稿、报错、接口样例、复现步骤

## 不同改动面的默认参考路径

### Frontend

- `README.md`
- `frontend/README.md`
- `frontend/src/app/AppRouter.tsx`
- 目标页面目录
- `frontend/src/components/`
- `frontend/src/styles/`
- `frontend/e2e/`
- 相关 `docs/design/` 与 `spec/INTERACTION-SPEC.md`

### Backend

- `README.md`
- `backend/README.md`
- `backend/src/server.ts`
- 对应 `services/`、`domain/`、`types/`
- `shared/contracts.d.ts`
- frontend 消费路径
- backend tests、mock API、相关 scripts

### Shared / Contracts

- `shared/contracts.d.ts`
- `backend/src/types/task.ts`
- `frontend/src/app/AnalysisSessionProvider.tsx`
- `frontend/e2e/support/mockApi.ts`
- `spec/DATA-SPEC.md`

### Analysis Service

- `analysis-service/README.md`
- `analysis-service/app.py`
- `analysis-service/services/`
- `backend/src/services/analysisService.ts`
- `backend/src/services/preprocessService.ts`
- `analysis-service/tests/`
- `docs/algorithm-baseline.md`

### Evaluation / Regression

- `evaluation/README.md`
- `evaluation/baseline.json`
- `evaluation/fixtures/index.json`
- `backend/src/dev/evaluateFixtures.ts`
- `scripts/evaluate.sh`
- `docs/algorithm-baseline.md`

### Docs / Spec

- `spec/README.md`
- 对应 `docs/` 真源
- 当前实现文件
- 对应领域 skill

### Cross-Module

- `AGENTS.md`
- `README.md`
- `docs/engineering/DELIVERY-BASELINE.md`
- `shared/contracts.d.ts`
- 各模块入口文件
- 相关 docs/spec
- 验证与评测入口

## 使用时的输出要求

每次使用这个 skill 时，在真正改代码前先输出一个简短启动摘要：

### Startup Context Review
- 已查阅来源：
- 发现的现有实现/规范：
- 可直接复用的内容：
- 本次需要新增或重构的部分：
- 受影响模块：
- 需要特别遵守的约束：

这段摘要应该简短、可核查、能直接指导下一步实现，而不是泛泛复述目录名。

## 与其他 skills 的协作边界

这是一个通用前置 skill，不替代具体领域 skill。

它主要解决的是：

- 启动前的上下文查阅
- 现有真源定位
- 复用机会识别
- 影响范围判断
- 启动参考结论建立

当任务进入具体实现后，应切换或联动对应的领域 skill，例如：

- UI / 页面 / 交互任务：`badminton-h5-product-ui`
- 分析流程 / 上传到报告状态流：`badminton-analysis-flow`
- backend API / 共享契约：`backend-api-contracts`
- shared 类型 / adapter：`shared-contracts-and-adapters`
- analysis-service 边界：`analysis-service-integration`
- 评分 / baseline / regression：`evaluation-and-regression`
- docs / spec 同步：`docs-spec-sync`
- 仓库级验证与交付：`repo-delivery-baseline`
- 仓库级维护或 skill 体系演进：`repo-maintainer`、`skill-evolution`

## 何时读取 examples/

当你已经判断出改动面之后，再读最贴近的 example：

- `examples/frontend-change-startup.md`
- `examples/backend-change-startup.md`
- `examples/cross-module-change-startup.md`
- `examples/docs-and-spec-first.md`

这些 examples 只帮助你快速建立“先看什么、如何总结”，不替代具体实现 skill。

## 任务完成后的要求

最终总结里应说明：

- 本次改动参考了哪些已有内容
- 哪些现有实现、测试、文档或 skill 被直接复用
- 如果发现现有 spec/docs/skill 过时或冲突，要明确指出
- 如果因为缺少现有信息而只能新建方案，也要明确说明缺口在哪里

## 成功标准

这个 skill 生效时，Codex 应该做到：

- 不是从零假设开始写代码
- 不是机械地把仓库扫一遍
- 能先给出一段可核查的启动结论
- 能说明为什么复用现有实现，而不是另起一套
- 能在需要时把任务交给更具体的领域 skill
