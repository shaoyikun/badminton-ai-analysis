# Task

为移动端产品壳层补 Playwright 回归，防止标题栏、Tab 和 CTA 退化回长文档流。

# Recommended assertions

- 读取 `header`、`main`、`nav` 的初始位置
- 主动滚动 `main.scrollTop`
- 断言 header / nav 的位置基本不变
- 主动执行 `window.scrollTo`
- 断言 `window.scrollY` 仍保持为 0

# Also cover

- 根级页与任务流页的 Tab 显示范围
- 空态页是否仍然符合固定壳层
- 选片页是否已经从上传页独立出来
