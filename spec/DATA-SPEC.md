# DATA-SPEC

## 1. 分析结果结构
### report
- action_type
- total_score
- dimension_scores
- top_issues
- suggestions
- compare_summary
- retest_advice
- created_at
- history（同动作历史样本摘要列表）
- comparison（默认对比上一条同动作样本的复测结果）
- standard_comparison（标准动作参考区）

### error_result
- error_code
- error_message
- retry_suggestion

## 2. 历史记录结构
- record_id / task_id
- action_type
- total_score
- created_at
- summary
- pose_based

## 3. 复测对比结构
### comparison
- previous_task_id
- current_task_id
- previous_score
- current_score
- delta_score
- improved_items
- pending_items
- unchanged_items
- summary_text
- coach_review
  - headline
  - progress_note
  - regression_note（可选）
  - next_focus

## 4. 标准动作对比结构
### standard_comparison
- section_title
- summary_text
- current_frame_label
- standard_frame_label
- standard_reference
  - title
  - cue
  - image_label
- differences

说明：
- MVP 第一版允许先返回“标准参考占位信息 + 差异说明文案”，不强制要求真实标准图片素材已接入
- 后续可再把 `image_label` 升级为真实素材 URL / token / 媒体资源引用

## 5. 对比模式约束
- 默认模式：当前样本自动对比“上一条同动作已完成样本”
- 手动模式：允许用户从同动作历史记录中手动选择任意一条历史样本作为对比基线
- 禁止跨动作类型对比（例如杀球 vs 高远球）
- 标准动作对比与历史复测对比可以同时存在，二者面向的问题不同：
  - 历史复测对比：看“和过去的自己相比有没有进步”
  - 标准动作对比：看“和目标动作模板相比还差在哪里”

## 6. 数据来源约束
- 视频输入必须符合拍摄规范
- 报告输出必须符合报告模板
- 历史记录和复测对比必须基于已完成样本生成，不能读取未完成任务作为对比基线
- 标准动作对比文案必须能落到具体差异点，不能只给抽象评价

## 7. 相关主文档
- `docs/design/REPORT-TEMPLATE.md`
- `docs/data/VIDEO-CAPTURE-SPEC.md`
