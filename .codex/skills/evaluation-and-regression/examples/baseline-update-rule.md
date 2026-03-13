# Task

评测输出和 `evaluation/baseline.json` 不一致，判断什么时候可以更新 baseline。

# Before

- baseline 是 checked-in golden reference
- `make evaluate` 默认在 drift 时返回非零
- 不是所有 drift 都代表 bug，也不是所有 drift 都可以直接接受

# Goal

建立“何时解释 drift，何时更新 baseline”的明确规则。

# Recommended structure

- 先确认 drift 来自预期变更还是意外回归
- 看 disposition、top issue、error code、coverage 是否整体合理
- 只有预期行为变化被接受后，才执行 `--update-baseline`

# Key implementation notes

- 不要因为总分波动很小就忽略其他维度 drift
- baseline 更新要配套提交说明：改变了什么、为什么更合理、影响哪些 action type
- 若新增 fixture，先确认 `requiredCoverageTagsByAction` 仍完整
- 如果只是调试样本，不要直接混进正式 baseline

# Optional code sketch

```bash
./scripts/evaluate.sh --json
# 确认 drift 合理后
./scripts/evaluate.sh --update-baseline
```
