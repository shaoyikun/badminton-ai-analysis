当仓库里没有现成模式，或者需要为算法、阈值、评测口径提供依据时，应主动参考公开资料，但目标仍然是当前仓库的可落地实现。

适合主动查资料的场景：

- 候选片段检测启发式明显不稳
- 需要比较不同动作分段或峰值检测方案
- 需要确认 MediaPipe / OpenCV /时序姿态 API 的能力边界
- 需要为 evidence gating、phase coverage、evaluation 指标提供更合理依据

优先资料来源：

1. 官方文档
2. 论文 / arXiv / 项目页
3. 高质量开源仓库
4. 工程文章

建议搜索主题：

- `video action segmentation lightweight heuristic`
- `pose-based motion phase detection`
- `MediaPipe pose sports motion analysis`
- `badminton swing keyframe detection`
- `confidence gating in pose estimation pipelines`
- `evaluation metrics for pose/action analysis systems`

资料使用后的落地要求：

1. 提炼出适合当前仓库的实现选择，而不是照搬原方案。
2. 明确变化落在哪一层：
   - backend preprocess / manifest
   - Python pose / summary
   - report scoring / evidence
   - evaluation / fixtures / baseline
3. 给出最小可审阅改动，而不是顺手做一轮无关重构。
4. 为新方案补对应测试、fixtures、baseline 解释或文档更新。

交付时至少说明：

- 查了什么类型的资料
- 最终采用了哪个工程化折中
- 为什么这个折中适合当前仓库，而不是理论上最强的方案
- 它如何落到了代码、测试和评测里
