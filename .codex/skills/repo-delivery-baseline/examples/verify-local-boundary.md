# Task

当前机器没有 Docker daemon，但需要判断本次改动能不能先用 `make verify-local` 收敛风险。

# Before

- `make verify-local` 等价于 `SKIP_DOCKER_VERIFY=1 ./scripts/verify.sh`
- 它会跑 lint、tests、build，但跳过 Docker Compose 构建校验
- 交付门禁仍然是 `make verify`

# Goal

明确 `verify-local` 的使用边界，避免把它当成正式 handoff gate。

# Recommended structure

- 没有 Docker 时先跑 `make verify-local`
- 若改动碰到 shared/contracts、构建脚本、Dockerfile、nginx，仍要标记“尚未完成交付门禁”
- 拥有 Docker 环境后再补 `make verify`

# Key implementation notes

- `verify-local` 适合本地迭代，不适合作为最终交付证明
- 如果这次改动只涉及运行时文档或 skill 内容，可以说明未跑仓库级校验
- 若改动影响镜像构建路径，`verify-local` 的结论尤其有限
- 最终说明不要写成“verify 通过”，要写成“verify-local 通过”

# Optional code sketch

```text
可写结论：
已执行 make verify-local，本地 lint/test/build 通过；
由于当前机器无 Docker daemon，未完成 make verify。
```
