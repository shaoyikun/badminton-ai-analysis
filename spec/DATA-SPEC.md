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

### error_result
- error_code
- error_message
- retry_suggestion

## 2. 历史记录结构
- record_id
- action_type
- total_score
- created_at
- summary

## 3. 复测对比结构
- previous_score
- current_score
- delta_score
- improved_items
- pending_items
- next_actions

## 4. 数据来源约束
- 视频输入必须符合拍摄规范
- 报告输出必须符合报告模板

## 5. 相关主文档
- `docs/design/REPORT-TEMPLATE.md`
- `docs/data/VIDEO-CAPTURE-SPEC.md`
