# Task

审查一个移动端 H5 是否真的具备正式产品壳层，而不是视觉上“像有导航”。

# Review checklist

- 滚动时 `window.scrollY` 是否保持为 0
- `main` 是否是唯一主滚动容器
- 顶部栏是否在滚动后仍留在 viewport 顶部
- 底部 Tab / CTA 是否稳定停留在底部，而不是在长页面底部才出现
- 首屏是否只表达当前任务，而不是把下一阶段也堆进来

# Red flags

- 整个页面高度远大于 viewport，header/top nav 跟着文档一起滚走
- 用 `sticky` 假装固定，但 sticky 的父容器本身就是无限长文档
- 步骤条只是“Step 1 / Step 2”的标题文字
- 候选片段、微调、调试指标以工具面板形式常驻
