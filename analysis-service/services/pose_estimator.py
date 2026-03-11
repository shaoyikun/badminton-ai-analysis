from __future__ import annotations

from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional

import cv2
import mediapipe as mp


POSE_LANDMARK_NAMES = [
    'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer',
    'left_ear', 'right_ear', 'mouth_left', 'mouth_right', 'left_shoulder', 'right_shoulder', 'left_elbow',
    'right_elbow', 'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky', 'left_index', 'right_index',
    'left_thumb', 'right_thumb', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle',
    'right_ankle', 'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index'
]


def _extract_keypoints(results: Any) -> List[Dict[str, Any]]:
    if not results.pose_landmarks:
        return []

    keypoints: List[Dict[str, Any]] = []
    for index, landmark in enumerate(results.pose_landmarks.landmark):
        keypoints.append({
            'name': POSE_LANDMARK_NAMES[index] if index < len(POSE_LANDMARK_NAMES) else f'landmark_{index}',
            'x': round(float(landmark.x), 4),
            'y': round(float(landmark.y), 4),
            'z': round(float(landmark.z), 4),
            'visibility': round(float(landmark.visibility), 4),
        })
    return keypoints


def _get_point_map(keypoints: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {point['name']: point for point in keypoints}


def _safe_get(points: Dict[str, Dict[str, Any]], name: str) -> Optional[Dict[str, Any]]:
    return points.get(name)


def _compute_frame_metrics(keypoints: List[Dict[str, Any]]) -> Dict[str, Any]:
    points = _get_point_map(keypoints)
    left_shoulder = _safe_get(points, 'left_shoulder')
    right_shoulder = _safe_get(points, 'right_shoulder')
    left_hip = _safe_get(points, 'left_hip')
    right_hip = _safe_get(points, 'right_hip')
    left_wrist = _safe_get(points, 'left_wrist')
    right_wrist = _safe_get(points, 'right_wrist')
    nose = _safe_get(points, 'nose')

    if not all([left_shoulder, right_shoulder, left_hip, right_hip, left_wrist, right_wrist, nose]):
        return {
            'stabilityScore': 0,
            'shoulderSpan': None,
            'hipSpan': None,
            'bodyTurnScore': None,
            'racketArmLiftScore': None,
            'summaryText': '关键点不完整，暂时无法计算姿态摘要。',
        }

    shoulder_span = abs(left_shoulder['x'] - right_shoulder['x'])
    hip_span = abs(left_hip['x'] - right_hip['x'])
    body_turn_score = round(max(0.0, min(1.0, 1 - shoulder_span)), 4)
    racket_wrist = left_wrist if left_wrist['y'] < right_wrist['y'] else right_wrist
    racket_shoulder = left_shoulder if left_wrist['y'] < right_wrist['y'] else right_shoulder
    racket_arm_lift_score = round(max(0.0, min(1.0, racket_shoulder['y'] - racket_wrist['y'] + 0.5)), 4)

    visibilities = [
        left_shoulder['visibility'], right_shoulder['visibility'], left_hip['visibility'], right_hip['visibility'],
        left_wrist['visibility'], right_wrist['visibility'], nose['visibility']
    ]
    stability_score = round(mean(visibilities), 4)

    body_text = '侧身展开较明显' if body_turn_score >= 0.45 else '身体正对镜头较多'
    arm_text = '挥拍臂抬举较充分' if racket_arm_lift_score >= 0.45 else '挥拍臂抬举还不够明显'

    return {
        'stabilityScore': stability_score,
        'shoulderSpan': round(shoulder_span, 4),
        'hipSpan': round(hip_span, 4),
        'bodyTurnScore': body_turn_score,
        'racketArmLiftScore': racket_arm_lift_score,
        'summaryText': f'{body_text}，{arm_text}。',
    }


def _build_overall_summary(frames: List[Dict[str, Any]], detected_count: int) -> Dict[str, Any]:
    detected_frames = [frame for frame in frames if frame['status'] == 'detected']
    if not detected_frames:
        return {
            'bestFrameIndex': None,
            'stableFrameCount': 0,
            'avgStabilityScore': 0,
            'avgBodyTurnScore': 0,
            'avgRacketArmLiftScore': 0,
            'humanSummary': '当前样本里还没有稳定识别到人体关键点。',
        }

    best_frame = max(detected_frames, key=lambda frame: frame['metrics']['stabilityScore'])
    avg_stability = round(mean(frame['metrics']['stabilityScore'] for frame in detected_frames), 4)
    avg_turn = round(mean(frame['metrics']['bodyTurnScore'] for frame in detected_frames if frame['metrics']['bodyTurnScore'] is not None), 4)
    avg_lift = round(mean(frame['metrics']['racketArmLiftScore'] for frame in detected_frames if frame['metrics']['racketArmLiftScore'] is not None), 4)

    if avg_turn >= 0.45 and avg_lift >= 0.45:
        human_summary = '这段样本里已经能看到比较明显的侧身展开和挥拍臂抬举。'
    elif avg_turn >= 0.45:
        human_summary = '这段样本里侧身展开还可以，但挥拍臂抬举不算特别充分。'
    elif avg_lift >= 0.45:
        human_summary = '这段样本里挥拍臂抬举较明显，但身体侧身展开还不够稳定。'
    else:
        human_summary = '这段样本里能识别到人体，但姿态特征还不够稳定，可能和机位或动作阶段有关。'

    return {
        'bestFrameIndex': best_frame['frameIndex'],
        'stableFrameCount': detected_count,
        'avgStabilityScore': avg_stability,
        'avgBodyTurnScore': avg_turn,
        'avgRacketArmLiftScore': avg_lift,
        'humanSummary': human_summary,
    }


def estimate_pose_for_frames(frame_paths: List[Path]) -> Dict[str, Any]:
    frames = []
    detected_count = 0

    with mp.solutions.pose.Pose(
        static_image_mode=True,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=0.5,
    ) as pose:
        for index, frame_path in enumerate(frame_paths, start=1):
            image = cv2.imread(str(frame_path))
            if image is None:
                frames.append({
                    'frameIndex': index,
                    'fileName': frame_path.name,
                    'status': 'read_failed',
                    'keypoints': [],
                    'metrics': None,
                })
                continue

            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = pose.process(rgb)
            keypoints = _extract_keypoints(results)
            metrics = _compute_frame_metrics(keypoints) if keypoints else None
            if keypoints:
                detected_count += 1

            frames.append({
                'frameIndex': index,
                'fileName': frame_path.name,
                'status': 'detected' if keypoints else 'not_detected',
                'keypoints': keypoints,
                'metrics': metrics,
            })

    return {
        'engine': 'mediapipe-pose',
        'frameCount': len(frame_paths),
        'detectedFrameCount': detected_count,
        'summary': _build_overall_summary(frames, detected_count),
        'frames': frames,
    }
