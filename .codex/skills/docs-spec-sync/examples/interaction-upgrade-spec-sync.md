# Task

上传页和处理中页交互升级后，想同步 spec 与 design docs，但不想把执行方法和产品规则混在一起。

# Before

- 设计文档定义页面目标和信息层级
- spec 摘要定义页面集合、状态与数据边界
- skill 应该只沉淀“遇到类似任务怎么同步”的工作流

# Goal

让交互升级后的页面结构与文档保持一致，同时保持 spec/docs 与 skill 分工清晰。

# Recommended structure

- 交互目标、页面结构更新到 `docs/design/INTERACTION-DESIGN.md`
- 摘要状态和页面集合更新到 `spec/INTERACTION-SPEC.md`
- 若实现方法可复用，再沉淀到 `badminton-h5-product-ui` 或 `badminton-analysis-flow`

# Key implementation notes

- 不要把“改 UI 时先看哪几个文件”的流程写进 spec
- 不要把产品页面层级原样复制进 skill
- 如果文档里同时存在目标态和现状，要显式写清
- 当前仓库最需要补同步的是候选片段粗扫与选择流

# Optional code sketch

```text
design doc: 页面怎么组织
spec: 页面与状态摘要
skill: 下次遇到类似任务时怎么执行
```
