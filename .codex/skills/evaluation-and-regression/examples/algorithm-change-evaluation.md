# Task

修改了 `backend/src/services/reportScoringService.ts` 的阈值与 fallback 逻辑，想确认是否需要跑离线评测。

# Before

- 仓库已有 `evaluation/README.md`、fixtures 和 checked-in baseline
- `make evaluate` 会对比 `clear + smash`
- 阈值与 fallback 会直接影响 `analysisDisposition`、`issues`、`primaryErrorCode`

# Goal

在算法改动后，用仓库现有评测口径判断是“行为回归”还是“预期升级”。

# Recommended structure

- 修改评分逻辑后先跑 `make evaluate`
- 如果只想局部看某动作，可先用 `./scripts/evaluate.sh --action-type clear`
- 只有确认变化合理后才考虑 `--update-baseline`

# Key implementation notes

- 不要因为页面看起来正常就跳过离线评测
- 看结果时至少同时看 disposition、issue hit、coverage tags、baseline drift
- 如果 `smash` 也受影响，不要只跑 `clear`
- 若刷新 baseline，提交说明里要写明“为什么现在的变化是更正确的”

# Optional code sketch

```bash
make evaluate
./scripts/evaluate.sh --action-type clear --json
./scripts/evaluate.sh --action-type smash --json
```
