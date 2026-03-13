抽帧优化的目标不是“采更多帧”，而是“让更有价值的帧进入后续姿态和评分链路”。

推荐顺序：

1. 先看当前 preprocess manifest 里已有的抽帧字段和时间戳来源。
2. 保留均匀抽样作为基础覆盖。
3. 在此之上增加动作感知补采样或相位候选帧，而不是单纯上调总帧数。
4. 保持 manifest、report 回显、调试脚本与旧消费者兼容。

优先检查：

- `backend/src/services/preprocessService.ts`
- `analysis-service/services/frame_loader.py`
- `analysis-service/services/pose_estimator.py`
- `docs/algorithm-baseline.md` 中 `phaseCandidates` 和 summary 字段

优先提升的覆盖：

- 准备阶段
- 引拍阶段
- 击球候选附近
- 收拍阶段

设计时优先考虑这些信号是否需要补充：

- `samplingStrategyVersion`
- `sampledFrames[].sourceType`
- `sampledFrames[].timestampSeconds`
- `phaseCoverage`

避免的反模式：

- 只靠增加总帧数掩盖相位缺失
- 引入新抽帧结构却没有兼容旧 manifest 读取逻辑
- 让 report 或 evaluation 无法追踪哪些帧来自均匀抽样，哪些来自补采样

验证重点：

- 关键相位覆盖是否提升
- `phaseCandidates` 是否更稳定
- 同等帧预算下，summary 和 scoring evidence 是否更可读
- baseline drift 是否能够解释成“覆盖更合理”，而不是随机变化
