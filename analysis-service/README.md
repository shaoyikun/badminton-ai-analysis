# Analysis Service

这是羽毛球 AI 项目的姿态识别 / 分析服务预留目录。

当前阶段目标：
- 先把 `关键帧 -> 姿态点结果` 的最小链路搭出来
- 优先验证 Python 服务、关键帧读取、结果输出结构
- 后续再把规则评分、动作诊断、报告生成继续接到主后端

建议结构：
- `app.py`：服务入口或命令行入口
- `services/pose_estimator.py`：姿态识别逻辑
- `services/frame_loader.py`：关键帧读取与遍历
- `models/`：模型文件或下载说明
- `samples/`：样例输入输出
