# Task

把首页从“功能入口页”提升成更完整的移动端产品首页，但保留当前动作切换与开始分析入口。

# Before

- 当前首页路由是 `/`
- 首页已有动作切换、开始分析 CTA、历史入口
- 当前仓库正式支持 `clear | smash`

# Goal

提升首页的信息层级，让用户一眼看懂“这是什么、现在支持什么、下一步点哪里”。

# Recommended structure

- 保留单列移动端布局
- 顶部先做价值说明和动作切换
- 中部放 3 步使用说明或可信度说明
- 底部保留一个主 CTA：`开始分析当前动作`
- 历史入口保留为次入口

# Key implementation notes

- 不要把首页做成桌面多栏 landing page
- 动作切换状态要继续驱动 CTA 文案，例如“开始分析杀球”
- 调试词汇改成产品词汇，例如“当前已正式开放杀球分析”优于内部术语
- 改动首页文案或结构后，优先补首页到上传页的移动端 E2E

# Optional code sketch

```tsx
<HeroSection />
<ActionTypeSelector />
<ThreeStepIntro />
<BottomCTA primary={{ label: `开始分析${selectedActionLabel}`, to: '/guide' }} />
```
