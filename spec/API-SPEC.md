# API-SPEC

## 1. 目标
定义 MVP 阶段后端最小接口集合，支撑移动端上传、异步分析、结果查询和历史记录。

## 2. 最小接口集合
### 2.1 创建分析任务
- 用途：创建一次动作分析任务
- 输入：action_type
- 输出：task_id, upload_url 或任务状态

### 2.2 上传视频
- 用途：上传原始视频文件
- 输入：task_id + video file
- 输出：upload_success / upload_failed

### 2.3 查询任务状态
- 用途：轮询任务进度
- 输出：pending / processing / completed / failed

### 2.4 获取分析结果
- 输出字段：
  - action_type
  - total_score
  - dimension_scores
  - issues
  - suggestions
  - compare_summary
  - retest_advice

### 2.5 获取历史记录
- 输出：历史报告列表

### 2.6 获取复测对比
- 输出：上次 vs 本次结果差异

## 3. 错误返回
至少支持以下错误类型：
- upload_failed
- invalid_duration
- multi_person_detected
- body_not_detected
- poor_lighting_or_occlusion
- invalid_camera_angle

## 4. 相关主文档
- `docs/tech/TECH-SOLUTION.md`
- `docs/data/VIDEO-CAPTURE-SPEC.md`
