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

## 4. 对比模式约束
- 默认模式：当前样本自动对比“上一条同动作已完成样本”
- 手动模式：允许用户从同动作历史记录中手动选择任意一条历史样本作为对比基线
- 禁止跨动作类型对比（例如杀球 vs 高远球）

## 5. 数据来源约束
- 视频输入必须符合拍摄规范
- 报告输出必须符合报告模板
- 历史记录和复测对比必须基于已完成样本生成，不能读取未完成任务作为对比基线

## 6. 相关主文档
- `docs/design/REPORT-TEMPLATE.md`
- `docs/data/VIDEO-CAPTURE-SPEC.md`
