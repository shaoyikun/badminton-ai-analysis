# Task

`make evaluate` 出现 drift，想快速判断是算法预期变化、fixture 问题，还是新的回归。

# Before

- 评测输出会给 disposition、issue、coverage、error code 等摘要
- 当前仓库同时维护 `clear` 和 `smash` 的离线基线
- 并非每次 drift 都需要立刻更新 baseline

# Goal

建立一个回归排障顺序，避免只盯一个指标就下结论。

# Recommended structure

- 先看 drift 影响的是哪类 case、哪个 action type
- 再看 disposition 和 `primaryErrorCode` 分布
- 再看 issue hit 与 coverage tags
- 最后判断是逻辑变化、fixture 偏差还是 baseline 过旧

# Key implementation notes

- 若只有单个 case 波动，先看该 case 的输入类型和 notes
- 若 `smash` 集体变化，要检查是不是共享逻辑误伤了 shadow profile
- 若 coverage tags 缺失，先修 fixture，不要急着动 baseline
- triage 结论要写进提交说明，尤其是“为什么这是预期变化”

# Optional code sketch

```text
triage 顺序：
1. 哪些 case drift
2. disposition 是否变了
3. primaryErrorCode 是否异常偏移
4. coverage 是否缺失
5. 决定修代码、修 fixture 还是更新 baseline
```
