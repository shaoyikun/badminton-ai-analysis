# Task

改动同时穿过 `frontend/`、`backend/`、`shared/`、`analysis-service/`、`evaluation/` 中两个以上模块，先判断影响范围和实现顺序。

# What to inspect first

- `AGENTS.md`
- `README.md`
- `docs/engineering/DELIVERY-BASELINE.md`
- `shared/contracts.d.ts`
- 主入口文件：`frontend/src/App.tsx`、`backend/src/server.ts`、`analysis-service/app.py`
- 相关 `docs/` 与 `spec/`
- 验证路径：`frontend/e2e/`、backend tests、`analysis-service/tests/`、`evaluation/`

# What likely exists already

- `create -> upload -> start -> poll -> report/history/compare` 主链路
- 共享状态和数据结构
- 现有验证与评测门禁
- 子模块之间的职责边界
- 现有 specialized skills 的分工

# Startup conclusion

跨模块任务最容易因为只盯一个目录而误判边界。先确认变更穿过了哪几层、谁生产数据、谁消费数据、哪些验证需要同步，再决定实现顺序；通常应先稳共享结构和边界，再改 UI 或局部逻辑。

# Implementation direction

- 先画出影响链：输入 -> 契约 -> service -> 页面/报告 -> 测试
- 优先确认共享对象、状态机和验证面
- 然后联动 `analysis-pipeline` 和对应 specialized skill 分层落实现

# Common mistakes to avoid

- 还没判断影响范围就开始同时改多处文件
- 只看一个模块的局部真相
- 忽略 evaluation、fixtures、mock 或交付入口
- 用“临时兼容”掩盖实际的跨模块契约变化
