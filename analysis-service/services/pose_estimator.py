from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

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
                })
                continue

            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = pose.process(rgb)
            keypoints = _extract_keypoints(results)
            if keypoints:
                detected_count += 1

            frames.append({
                'frameIndex': index,
                'fileName': frame_path.name,
                'status': 'detected' if keypoints else 'not_detected',
                'keypoints': keypoints,
            })

    return {
        'engine': 'mediapipe-pose',
        'frameCount': len(frame_paths),
        'detectedFrameCount': detected_count,
        'frames': frames,
    }
