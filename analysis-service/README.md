# Analysis Service

`analysis-service/` 是后端调用的 Python 姿态分析辅助模块，不作为独立产品入口维护。统一启动、测试、构建和交付门禁以仓库根目录为准：

```bash
make setup
make run
make test
make build
make verify
```

第一次进入仓库时，先读：

- `../README.md`
- `../docs/engineering/DELIVERY-BASELINE.md`

## 当前职责

- 读取预处理后的关键帧
- 执行姿态估计
- 输出供 backend 消费的结构化结果

当前目录约定：

- `app.py`：CLI / 入口
- `services/frame_loader.py`：关键帧读取与遍历
- `services/pose_estimator.py`：姿态识别逻辑
- `models/pose_landmarker_lite.lock.json`：固定版 MediaPipe Tasks pose 模型锁文件
- `tests/`：轻量自动化测试

## 时序稳定性实现

- MediaPipe Tasks 路径优先使用 `VIDEO` mode，并读取 `preprocess/manifest.json` 里的 `sampledFrames[].timestampSeconds`
- `VIDEO` 不可用时自动回退到 Tasks `IMAGE` mode；Tasks 初始化失败或依赖不可用时，再回退到 legacy `mp.solutions`
- 帧结果同时输出 `rawMetrics`、`smoothedMetrics`、`finalMetrics`
- `metrics` 字段继续保留，等于 `finalMetrics`
- `summary.scoreVariance` 基于 `finalMetrics.compositeScore`
- `summary` 额外输出 `rawScoreVariance`、`temporalConsistency`、`motionContinuity`

## 模型版本固化

默认模型来源：

- 锁文件：`analysis-service/models/pose_landmarker_lite.lock.json`
- 默认缓存目录：`analysis-service/models/`

可选环境变量：

- `POSE_LANDMARKER_MODEL_PATH`：显式指定模型文件路径
- `POSE_LANDMARKER_MODEL_CACHE_DIR`：覆盖默认缓存目录

更新模型版本时：

1. 更新 `models/pose_landmarker_lite.lock.json` 里的 `version`、`url`、`sha256`
2. 删除旧缓存文件或改用新的缓存目录
3. 重新执行一次 pose 分析，确认新模型下载并通过校验
4. 运行 `make test`、`make build`，再做一次本地样例回放

## 最小验证建议

至少保留以下 3 种对比：

1. synthetic jitter 序列，对比 raw 与 smoothed 的 `scoreVariance` 和 `motionContinuity`
2. mocked Tasks detector，对比 `VIDEO` 成功路径和 `IMAGE` fallback 路径
3. 真实 preprocess 目录回放，对比改造前后的 `summary.rejectionReasons` 与稳定性字段

## 本地单独调试

安装依赖：

```bash
cd analysis-service
python3 -m pip install -r requirements.txt
```

运行测试：

```bash
cd analysis-service
PYTHONPATH=. python3 -m unittest discover -s tests -p 'test_*.py'
```

仓库级 `make test` 与 `make build` 已覆盖这里的最小验证路径。
