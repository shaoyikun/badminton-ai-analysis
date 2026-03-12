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
- `tests/`：轻量自动化测试

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
