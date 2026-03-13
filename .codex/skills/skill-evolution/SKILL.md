---
name: skill-evolution
description: Use when a new change, pitfall, workaround, or repeated debugging lesson suggests the current repo-local skills should be updated or a new skill should be created to preserve that knowledge.
---

# Skill Evolution

## 何时使用

当任务不只是完成当前改动，还暴露了值得沉淀到 repo-local skills 的经验时使用：

- 新变更引出了一个可复用的实现模式、排障顺序或验证顺序
- 这次踩坑花了明显时间，后续很可能再次踩到
- 修复过程暴露了隐藏约定、目录边界、契约真源或交付门槛
- 现有 `.codex/skills/` 里没有覆盖这个经验，或者覆盖得不够具体
- 你怀疑“以后遇到同类任务，Codex 还会再犯一次同样的错”

## 先读什么

- `AGENTS.md`
- `.codex/skills/` 当前所有 skill 目录名与对应 `SKILL.md`
- 本次任务的 diff、报错日志、失败路径或排障记录
- 直接关联的现有 skill，例如 `repo-maintainer`、`analysis-pipeline` 或本次真正触发的 specialized skill

## 工作顺序/决策顺序

1. 先把这次新增经验写成一句话：到底是新的 workflow、边界规则、验证门槛，还是高频坑点。
2. 浏览当前 `.codex/skills/`，判断有没有一个现有 skill 已经拥有这个责任边界。
3. 若现有 skill 已覆盖该主题，优先补充那个 skill，而不是急着新建 skill。
4. 只有在经验已经形成独立、可复用、跨任务可触发的主题时，才创建新 skill。
5. 新建 skill 时，要让它回答“以后什么时候该自动触发”和“触发后先做什么”，而不是只记录这次事故复盘。
6. 完成后回看 `AGENTS.md` 是否需要补一条更高层的工作约定，避免知识只留在 skill 目录里。

## 核心规则

1. 复用优先：先更新最贴近的现有 skill；只有在现有 skill 会因此变得职责混乱时，才拆出新 skill。
2. 不为一次性细节、单文件冷门坑或纯偶发现象创建 skill。skill 应服务未来多次任务，而不是保存一次性的聊天纪要。
3. 新 skill 必须有清晰触发边界，不能与已有 skill 高度重叠到让 Codex 不知道该选哪个。
4. skill 内容要沉淀稳定经验，不要把这次任务的临时路径、一次性日志或偶然环境状态直接固化进去。
5. 若经验本质上属于某个现有编码 skill 的“核心规则”或“工作顺序”，优先回写那个 skill，而不是再建并列 skill。
6. 若经验跨越多个 skill，应优先沉淀成更上层的决策规则，例如：
   - 什么时候必须补跑某类验证
   - 什么时候必须拆模块而不是继续堆大文件
   - 什么时候必须同步契约、mock、文档和评测
7. 如果新经验会改变仓库级协作方式、DoD、技能入口或真源说明，要同步更新 `AGENTS.md`。
8. skill 要保持精炼，优先写可执行判断和步骤，不写长篇背景故事。

## 何时联动其他 skills

- `repo-maintainer`：经验会影响 AGENTS、脚本、仓库级协作方式或维护规则
- `analysis-pipeline`：经验横跨上传、分析、报告等主链路多个边界
- 任一本次真正使用到的 specialized skill：经验应该回写到该 skill 的核心规则或 examples 读取时机
- `docs-spec-sync`：经验同时意味着文档真源需要补充或纠偏

## 何时读取 examples/

当前这个 skill 没有 examples 目录。若将来发现“何时更新旧 skill vs 何时创建新 skill”的判断仍然容易摇摆，再补 examples 来沉淀典型分界案例。

## 任务完成后的输出要求

最终交付说明至少要写清：

- 这次新增沉淀的经验是什么，为什么值得进入 repo-local skills
- 你更新了哪个现有 skill，还是新增了哪个 skill；为什么这么选
- 这条经验未来能帮 Codex 避免什么重复踩坑或重复劳动
- 是否同步更新了 `AGENTS.md` 或其他更高层规则
