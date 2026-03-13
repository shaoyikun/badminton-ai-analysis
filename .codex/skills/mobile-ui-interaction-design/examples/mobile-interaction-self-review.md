# Task

实现完一个页面后，让 Codex 对交互、布局、样式、组件选择做结构化自评，并在发现问题后自动修正一轮。

# Before

- 页面功能已经完成
- 还没有系统检查交互质量
- 很容易直接收工，遗漏 demo 味和状态缺口

# Goal

在交付前强制做一轮 rubric 自评，让页面至少达到稳定、清晰、可交付的移动端下限。

# Recommended structure

- 先列 rubric
- 对每项给出“通过 / 风险 / 待修”
- 有明显问题时回到代码继续优化
- 最终输出附带自评总结

# Key implementation notes

- rubric 至少覆盖信息层级、主 CTA、首屏理解、移动端操作、组件合理性、状态完整性、文案产品化
- 如果拿得到截图，把截图清晰度也纳入 rubric
- 不要只写“整体不错”，而要写出具体风险和已修动作
- 如果某项仍然主观，明确标记为需要人工设计/产品确认

# Optional code sketch

```ts
const rubric = {
  hierarchy: 'pass',
  primaryCta: 'needs-fix',
  mobileReachability: 'pass',
  stateCoverage: 'needs-fix',
}
```
