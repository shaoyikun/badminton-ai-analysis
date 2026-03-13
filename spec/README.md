# Spec 目录说明

这个目录保留少量“实现前先读一遍”的摘要规格，帮助快速理解项目边界、交互重点和核心数据结构。

## 当前保留文件
- `PRODUCT-SPEC.md`：产品定位、MVP 范围、主流程和异常流程摘要
- `PHASED-EVOLUTION-SPEC.md`：把研究结论收敛成“一个会话推进一个阶段”的演进路线图
- `MVP-ARCHITECTURE-SPEC.md`：PoC 到可交付 MVP 的目标架构、接口、状态机、存储和模块边界
- `INTERACTION-SPEC.md`：移动端页面重点、信息层级和关键交互要求摘要
- `DATA-SPEC.md`：报告、历史记录、复测对比和标准动作对比的数据结构摘要
- `COMMIT-SPEC.md`：commit 粒度、命名格式和提交流程规范

## 推荐阅读顺序
1. `PRODUCT-SPEC.md`
2. `PHASED-EVOLUTION-SPEC.md`
3. `MVP-ARCHITECTURE-SPEC.md`
4. `INTERACTION-SPEC.md`
5. `DATA-SPEC.md`
6. `COMMIT-SPEC.md`

## 使用原则
- `docs/` 仍是主文档区，`spec/` 不是平行维护的一整套副本
- `spec/` 只保留当前仍会被开发和协作反复引用的摘要信息
- 当主文档中的产品边界、交互结构或结果数据发生关键变化时，同步更新这里
- `PHASED-EVOLUTION-SPEC.md` 是当前阶段演进的正式摘要入口，不把实施顺序散落在其他文档里
- 如果某份 spec 只是 PoC 历史或与当前实现冲突，应优先合并到主文档或直接删除
