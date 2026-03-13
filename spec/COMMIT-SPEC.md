# COMMIT-SPEC

## 1. 目标
这份规范用于统一本仓库的 commit 粒度、命名方式和提交流程，保证历史记录适合 review、回滚和后续协作。

项目当前仍处于 PoC 到早期 MVP 阶段，commit 应优先服务于：
- 小步提交
- 易于 review
- 便于定位问题和回滚
- 能清楚表达这次改动影响了哪个子系统

## 2. 基本原则
- 一次 commit 只解决一个明确问题或一个紧密相关的小改动集合
- 不要把无关改动塞进同一个 commit
- 如果代码改动依赖文档更新，文档应和代码放在同一个 commit
- 如果只是重命名、格式化、删除废弃文件，尽量单独 commit
- commit 以“方便别人 review 和自己回退”为第一标准，而不是以“省 commit 数量”为目标

## 3. 推荐提交时机
以下情况适合单独提交：
- 一个接口或一条分析链路已经跑通
- 一个明确 bug 已修复并完成验证
- 一次小范围重构已经保持行为不变
- 一组紧密相关的 spec / README / 文档同步已完成
- 一个前后端联动改动已经端到端对齐

以下情况不建议提交：
- 代码处于半完成状态，主流程明显不可用
- 同时混入功能改动、重构、格式化和无关文档整理
- 只是临时调试日志、注释试验或本地联调痕迹

## 4. Commit Message 格式
推荐格式：

```text
<type>(<scope>): <summary>
```

示例：

```text
feat(backend): 增加姿态分析适配层
fix(frontend): 失败后停止轮询任务状态
refactor(shared): 抽取前后端共享契约类型
docs(spec): 增加 commit 提交规范
chore(repo): 对齐 verify 校验输出
```

## 5. Type 约定
- `feat`：新增功能或新增用户可感知能力
- `fix`：修复 bug、回归或错误状态
- `refactor`：不改行为的结构调整
- `docs`：README、spec、设计文档、注释等文档改动
- `test`：新增或调整自动化测试
- `chore`：杂项维护、配置整理、非业务逻辑改动
- `build`：构建、脚本、Docker、依赖或发布流程调整

## 6. Scope 约定
优先使用当前仓库已有边界作为 scope：
- `frontend`
- `backend`
- `analysis-service`
- `shared`
- `spec`
- `docs`
- `repo`
- `prototype`

如果一次改动确实跨多个目录，但仍属于同一条链路，可用更高层 scope：
- `pipeline`
- `infra`

## 7. Summary 写法
- 用祈使句或结果导向短语，简短说明“这次改了什么”
- 推荐使用英文 `type/scope`，`summary` 尽量使用中文，方便团队快速阅读历史记录
- 如果确实涉及专有技术词、接口名、脚本名，可在中文中保留必要英文术语
- 不要用 `update stuff`、`misc fixes`、`tmp`、`wip` 这类低信息量描述
- 不在 summary 末尾加句号

推荐：
- `fix(backend): 处理预处理产物缺失场景`
- `docs(repo): 说明 Docker 与本地启动流程`
- `refactor(frontend): 拆分结果页状态处理逻辑`

不推荐：
- `update`
- `fix bugs`
- `wip`
- `tmp commit`

## 8. Body 与 Footer
小改动允许只写一行 summary。

以下情况建议补 body：
- 改动跨前后端
- 有重要权衡或兼容性影响
- 需要说明验证方式

body 建议包含：
- 为什么改
- 主要改动点
- 如何验证

如果有关联任务、问题单或后续事项，可在 footer 中补充引用，但不是强制要求。

## 9. 提交前检查
提交前按改动范围执行最小必要验证：
- 纯文档改动：确认引用和路径正确
- 单一子系统改动：至少验证受影响模块可用
- 可运行代码改动：优先执行 `make test`
- TypeScript、共享契约、构建脚本、Dockerfile、Compose 或生产构建相关改动：不能只停在 `make test`，至少补跑 `make build`
- 交付前或较大改动：执行 `make verify`

如果因为环境限制未执行某项检查，应在 handoff 或 PR 说明中明确写出。

## 10. 本仓库特别约束
- 保持 commit 小而可 review，符合当前 PoC 导向
- 不要把 frontend、backend、analysis-service 的无关改动混在一个 commit
- 当 workflow、命令或目录边界发生变化时，同步更新 README / spec / 相关说明
- 对生成文件、构建产物和本地运行数据保持克制，除非确有必要，不要纳入 commit

## 11. 推荐示例
- `feat(pipeline): 增加复测对比接口`
- `fix(backend): 保留预处理失败时的上传错误码`
- `refactor(shared): 复用前后端共享 DTO 类型`
- `docs(spec): 对齐当前接口返回的数据结构说明`
- `build(repo): 将 make verify 作为交付前校验入口`
