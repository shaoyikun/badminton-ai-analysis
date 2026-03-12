---
name: analysis-pipeline
description: Use when the task touches the badminton analysis pipeline across upload, preprocess, pose estimation, scoring, report generation, history, retest comparison, or the frontend analysis flow.
---

# Analysis Pipeline

Use this skill when changes involve the end-to-end badminton analysis flow.

## Current Flow

1. Frontend creates a task and uploads a video
2. Backend stores task state in local JSON/files
3. Preprocess runs `ffprobe` for metadata and `ffmpeg` for sampled frames
4. Backend invokes `analysis-service/app.py`
5. Python returns pose metrics
6. Backend generates a rule-based report and history/comparison payload
7. Frontend polls status and renders report/history/retest views

## Main Files

- Backend API: `backend/src/server.ts`
- Task orchestration: `backend/src/services/taskService.ts`
- Preprocess: `backend/src/services/preprocessService.ts`
- Pose bridge: `backend/src/services/poseService.ts`
- Report scoring: `backend/src/services/reportScoringService.ts`
- Frontend flow: `frontend/src/hooks/useAnalysisTask.ts`
- Result UI: `frontend/src/components/result-views/`
- Python entry: `analysis-service/app.py`
- Python pose logic: `analysis-service/services/pose_estimator.py`

## Working Rules

- Preserve the current PoC architecture unless the task explicitly requires bigger changes.
- Trace data end-to-end before editing: API payload, stored task shape, generated result shape, and frontend consumer.
- If a change affects report shape or task state, verify both backend and frontend usage.
- When behavior changes materially, update README or docs for the affected workflow.
