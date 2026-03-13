# Task

实现了新的候选片段选择体验，想判断哪些文档需要同步，哪些不该搬成 skill。

# Before

- 实现已经存在于 `UploadPage`、provider、`shared/contracts.d.ts`
- `docs/design/INTERACTION-DESIGN.md` 与 `spec/INTERACTION-SPEC.md` 还残留旧的“一键开始分析”表述
- `docs/algorithm-baseline.md` 已较准确描述现状

# Goal

把“实现真相”同步回正确层级的文档，同时避免重复维护。

# Recommended structure

- 实现事实写回交互文档与摘要 spec
- 候选片段对象定义继续留在 `shared/contracts.d.ts`
- “以后遇到类似任务怎么做”的流程写进对应 skill

# Key implementation notes

- 不要把 `SegmentScanSummary` 结构复制粘贴到多个 spec 文件里
- 交互文档需要更新“上传后粗扫候选片段，再确认片段开始分析”
- 如果某份文档仍想保留目标态，请明确标注，不要让读者误以为是当前实现
- 最终总结里可以顺带指出哪些旧内容建议后续并档或重命名

# Optional code sketch

```text
实现真相：
UploadPage -> coarse scan -> candidate selection -> start analysis

同步目标：
- docs/design/INTERACTION-DESIGN.md
- spec/INTERACTION-SPEC.md
```
