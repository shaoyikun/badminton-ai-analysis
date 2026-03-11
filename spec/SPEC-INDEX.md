# SPEC-INDEX

## 1. 目的
这个文件用于说明 `spec/` 目录中各份规格文件的职责、优先级、推荐阅读顺序，以及后续使用大模型或人工开发时的执行规则。

---

## 2. 推荐阅读顺序
后续任何实现、PoC、代码生成、任务拆解，建议按以下顺序阅读：

1. `PRODUCT-SPEC.md`
2. `INTERACTION-SPEC.md`
3. `API-SPEC.md`
4. `DATA-SPEC.md`
5. `ACCEPTANCE-CRITERIA.md`
6. `IMPLEMENTATION-PLAN.md`

---

## 3. 各文件职责

### 3.1 `PRODUCT-SPEC.md`
定义产品目标、平台约束、MVP 范围、主流程和异常流程。

### 3.2 `INTERACTION-SPEC.md`
定义移动端交互原则、核心页面、信息层级和关键交互要求。

### 3.3 `API-SPEC.md`
定义 MVP 阶段最小接口集合和错误类型。

### 3.4 `DATA-SPEC.md`
定义报告、历史记录、复测对比等核心数据结构。

### 3.5 `ACCEPTANCE-CRITERIA.md`
定义当前阶段验收标准，用于判断“是否完成”。

### 3.6 `IMPLEMENTATION-PLAN.md`
定义后续实现顺序与阶段划分。

---

## 4. 优先级规则
当不同 spec 之间出现理解冲突时，优先级按以下顺序处理：

1. `PRODUCT-SPEC.md`
2. `INTERACTION-SPEC.md`
3. `API-SPEC.md`
4. `DATA-SPEC.md`
5. `ACCEPTANCE-CRITERIA.md`
6. `IMPLEMENTATION-PLAN.md`

解释：
- 产品规格定义“做什么 / 不做什么”
- 交互规格定义“怎么呈现和怎么走流程”
- API 和数据规格定义“怎么落地实现”
- 验收和计划是执行辅助，不应反向覆盖产品定义

---

## 5. 使用规则
后续任何人或大模型在继续这个项目时，应遵循：

1. 先阅读 `SPEC-INDEX.md`
2. 按推荐顺序阅读相关 spec
3. 实现必须以 spec 为准，不要自行扩展超出 MVP 范围的能力
4. 如果需求发生变化，先更新 spec，再更新原型、文档或代码
5. 验收时对照 `ACCEPTANCE-CRITERIA.md`

---

## 6. 对大模型使用的建议提示词
如果后续用大模型参与开发，建议明确说明：

- 这是一个已有 spec 的项目
- 请先阅读 `spec/SPEC-INDEX.md` 和相关 spec 文件
- 后续实现必须遵循 spec，不要擅自扩展范围
- 当前前端路线以 React Web / React H5 为默认实现方向
- 若发现 spec 与实现冲突，应先指出冲突，再建议如何更新 spec

---

## 7. 当前结论
`spec/` 目录不是自动生效的魔法目录，它的价值来自于：
- 被明确当成后续实现依据
- 被持续更新
- 被所有后续参与者重复引用

这个索引文件的作用，就是确保项目不会因为 spec 变多而失去可用性。
