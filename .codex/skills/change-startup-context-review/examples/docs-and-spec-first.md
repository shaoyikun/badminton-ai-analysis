# Task

用户需求涉及产品规则、交互约束、流程设计或验收标准，先判断该改代码、改文档，还是两者都改。

# What to inspect first

- `spec/README.md`
- 相关 `docs/design/`
- `docs/prd/PRD.md`
- `docs/feature-spec.md`
- 当前实现文件
- 对应 repo-local skill，尤其是 `docs-spec-sync`

# What likely exists already

- 文档分层和真源归属
- current-state 与 target-state 的区别
- 现有页面/流程/协议实现
- skill 与 docs/spec 的职责分工

# Startup conclusion

这类任务不能默认“先改代码再补文档”，也不能只写 spec 不看实现。先确认当前真相已经落在代码还是文档，判断这次需求是在纠正文档漂移、补充实现，还是两者都要同步，再进入实现阶段。

# Implementation direction

- 先找该需求对应的文档层级和实现落点
- 如果实现已存在但文档失真，优先联动 `docs-spec-sync`
- 如果文档只是目标态而实现未落地，要显式说明当前与目标的差距

# Common mistakes to avoid

- 把 skill 工作流写进 spec/docs
- 只改代码，不看现有文档是否已经过时
- 只写文档，不确认实现是否已经存在或冲突
- 混淆“当前实现真相”和“未来目标态”
