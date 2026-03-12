from __future__ import annotations

from pathlib import Path
from statistics import mean, median, pvariance
from typing import Any, Dict, List, Optional
from urllib.request import urlretrieve

import cv2
import mediapipe as mp


POSE_LANDMARK_NAMES = [
    'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer',
    'left_ear', 'right_ear', 'mouth_left', 'mouth_right', 'left_shoulder', 'right_shoulder', 'left_elbow',
    'right_elbow', 'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky', 'left_index', 'right_index',
    'left_thumb', 'right_thumb', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle',
    'right_ankle', 'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index'
]

POSE_LANDMARKER_MODEL_URL = (
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/'
    'pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'
)

USABLE_STABILITY_THRESHOLD = 0.6
LOW_STABILITY_THRESHOLD = 0.45
SUBJECT_SCALE_THRESHOLD = 0.12
MIN_USABLE_FRAME_COUNT = 6
MIN_COVERAGE_RATIO = 0.6
INVALID_CAMERA_TURN_THRESHOLD = 0.18
MAX_SCORE_VARIANCE = 0.04


def _extract_keypoints_from_legacy(results: Any) -> List[Dict[str, Any]]:
    if not results.pose_landmarks:
        return []

    keypoints: List[Dict[str, Any]] = []
    for index, landmark in enumerate(results.pose_landmarks.landmark):
        keypoints.append({
            'name': POSE_LANDMARK_NAMES[index] if index < len(POSE_LANDMARK_NAMES) else f'landmark_{index}',
            'x': round(float(landmark.x), 4),
            'y': round(float(landmark.y), 4),
            'z': round(float(landmark.z), 4),
            'visibility': round(float(getattr(landmark, 'visibility', 0.0)), 4),
        })
    return keypoints


def _extract_keypoints_from_tasks(result: Any) -> List[Dict[str, Any]]:
    pose_landmarks_list = getattr(result, 'pose_landmarks', None) or []
    if not pose_landmarks_list:
        return []

    landmarks = pose_landmarks_list[0]
    keypoints: List[Dict[str, Any]] = []
    for index, landmark in enumerate(landmarks):
        keypoints.append({
            'name': POSE_LANDMARK_NAMES[index] if index < len(POSE_LANDMARK_NAMES) else f'landmark_{index}',
            'x': round(float(landmark.x), 4),
            'y': round(float(landmark.y), 4),
            'z': round(float(landmark.z), 4),
            'visibility': round(float(getattr(landmark, 'visibility', getattr(landmark, 'presence', 0.0))), 4),
        })
    return keypoints


def _get_point_map(keypoints: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {point['name']: point for point in keypoints}


def _safe_get(points: Dict[str, Dict[str, Any]], name: str) -> Optional[Dict[str, Any]]:
    return points.get(name)


def _round(value: float) -> float:
    return round(float(value), 4)


def _median(values: List[float]) -> float:
    if not values:
        return 0.0
    return _round(median(values))


def _variance(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    return _round(pvariance(values))


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
            'stabilityScore': 0.0,
            'shoulderSpan': None,
            'hipSpan': None,
            'bodyTurnScore': None,
            'racketArmLiftScore': None,
            'subjectScale': None,
            'compositeScore': 0.0,
            'summaryText': '关键点不完整，暂时无法计算姿态摘要。',
        }

    shoulder_span = abs(left_shoulder['x'] - right_shoulder['x'])
    hip_span = abs(left_hip['x'] - right_hip['x'])
    torso_height = abs(((left_shoulder['y'] + right_shoulder['y']) / 2) - ((left_hip['y'] + right_hip['y']) / 2))
    subject_scale = max(shoulder_span, hip_span, torso_height)
    body_turn_score = _round(max(0.0, min(1.0, 1 - shoulder_span)))
    racket_wrist = left_wrist if left_wrist['y'] < right_wrist['y'] else right_wrist
    racket_shoulder = left_shoulder if left_wrist['y'] < right_wrist['y'] else right_shoulder
    racket_arm_lift_score = _round(max(0.0, min(1.0, racket_shoulder['y'] - racket_wrist['y'] + 0.5)))

    visibilities = [
        left_shoulder['visibility'],
        right_shoulder['visibility'],
        left_hip['visibility'],
        right_hip['visibility'],
        left_wrist['visibility'],
        right_wrist['visibility'],
        nose['visibility'],
    ]
    stability_score = _round(mean(visibilities))
    composite_score = _round((stability_score * 0.45) + (body_turn_score * 0.3) + (racket_arm_lift_score * 0.25))

    body_text = '侧身展开较明显' if body_turn_score >= 0.45 else '身体正对镜头较多'
    arm_text = '挥拍臂抬举较充分' if racket_arm_lift_score >= 0.45 else '挥拍臂抬举还不够明显'

    return {
        'stabilityScore': stability_score,
        'shoulderSpan': _round(shoulder_span),
        'hipSpan': _round(hip_span),
        'bodyTurnScore': body_turn_score,
        'racketArmLiftScore': racket_arm_lift_score,
        'subjectScale': _round(subject_scale),
        'compositeScore': composite_score,
        'summaryText': f'{body_text}，{arm_text}。',
    }


def _build_rejection_reasons(
    frame_count: int,
    detected_count: int,
    usable_frame_count: int,
    coverage_ratio: float,
    median_stability_score: float,
    median_body_turn_score: float,
    score_variance: float,
    too_small_count: int,
    low_stability_count: int,
) -> List[str]:
    if detected_count == 0:
        return ['body_not_detected']

    reasons: List[str] = []
    if too_small_count >= max(3, frame_count // 3):
        reasons.append('subject_too_small_or_cropped')
    if low_stability_count >= max(3, frame_count // 3):
        reasons.append('poor_lighting_or_occlusion')
    if usable_frame_count < MIN_USABLE_FRAME_COUNT or coverage_ratio < MIN_COVERAGE_RATIO:
        reasons.append('insufficient_pose_coverage')
    if usable_frame_count >= MIN_USABLE_FRAME_COUNT and coverage_ratio >= MIN_COVERAGE_RATIO:
        if median_stability_score < USABLE_STABILITY_THRESHOLD:
            reasons.append('insufficient_pose_coverage')
        if median_body_turn_score < INVALID_CAMERA_TURN_THRESHOLD:
            reasons.append('invalid_camera_angle')
        if score_variance > MAX_SCORE_VARIANCE:
            reasons.append('insufficient_action_evidence')

    deduped: List[str] = []
    for reason in reasons:
        if reason not in deduped:
            deduped.append(reason)
    return deduped


def _build_human_summary(
    frame_count: int,
    usable_frame_count: int,
    median_body_turn_score: float,
    median_racket_arm_lift_score: float,
    rejection_reasons: List[str],
) -> str:
    evidence_prefix = f'本次基于 {usable_frame_count}/{frame_count} 帧稳定识别结果'

    if rejection_reasons:
        first_reason = rejection_reasons[0]
        if first_reason == 'body_not_detected':
            return '当前样本还没有稳定识别到人体关键点，暂时无法生成可信报告。'
        if first_reason == 'subject_too_small_or_cropped':
            return f'{evidence_prefix}判断主体过小或入镜不完整，建议调整距离并保证全身完整入镜。'
        if first_reason == 'poor_lighting_or_occlusion':
            return f'{evidence_prefix}判断画面可见性不足，建议改善光线、遮挡和清晰度后重拍。'
        if first_reason == 'invalid_camera_angle':
            return f'{evidence_prefix}判断机位过正或过偏，建议改用侧后方或正后方机位后再试。'
        return f'{evidence_prefix}仍不足以支撑正式报告，建议补齐动作过程并重拍。'

    if median_body_turn_score >= 0.45 and median_racket_arm_lift_score >= 0.45:
        return f'{evidence_prefix}生成：已经能看到较稳定的侧身展开和挥拍臂上举。'
    if median_body_turn_score >= 0.45:
        return f'{evidence_prefix}生成：侧身展开相对稳定，但挥拍臂上举还不够充分。'
    if median_racket_arm_lift_score >= 0.45:
        return f'{evidence_prefix}生成：挥拍臂上举能看出来，但侧身展开还不够稳定。'
    return f'{evidence_prefix}生成：主体可见，但侧身展开和挥拍臂上举都还偏弱。'


def _build_overall_summary(frames: List[Dict[str, Any]], detected_count: int) -> Dict[str, Any]:
    detected_frames = [frame for frame in frames if frame['status'] in {'detected', 'usable'} and frame['metrics']]
    if not detected_frames:
        return {
            'bestFrameIndex': None,
            'usableFrameCount': 0,
            'coverageRatio': 0.0,
            'medianStabilityScore': 0.0,
            'medianBodyTurnScore': 0.0,
            'medianRacketArmLiftScore': 0.0,
            'scoreVariance': 0.0,
            'rejectionReasons': ['body_not_detected'],
            'humanSummary': '当前样本还没有稳定识别到人体关键点。',
        }

    usable_frames = [frame for frame in detected_frames if frame['status'] == 'usable']
    usable_frame_count = len(usable_frames)
    coverage_ratio = _round(usable_frame_count / len(frames)) if frames else 0.0
    median_stability_score = _median([frame['metrics']['stabilityScore'] for frame in usable_frames])
    median_body_turn_score = _median([frame['metrics']['bodyTurnScore'] for frame in usable_frames])
    median_racket_arm_lift_score = _median([frame['metrics']['racketArmLiftScore'] for frame in usable_frames])
    score_variance = _variance([frame['metrics']['compositeScore'] for frame in usable_frames])

    too_small_count = sum(1 for frame in detected_frames if (frame['metrics']['subjectScale'] or 0.0) < SUBJECT_SCALE_THRESHOLD)
    low_stability_count = sum(1 for frame in detected_frames if (frame['metrics']['stabilityScore'] or 0.0) < LOW_STABILITY_THRESHOLD)
    rejection_reasons = _build_rejection_reasons(
        frame_count=len(frames),
        detected_count=detected_count,
        usable_frame_count=usable_frame_count,
        coverage_ratio=coverage_ratio,
        median_stability_score=median_stability_score,
        median_body_turn_score=median_body_turn_score,
        score_variance=score_variance,
        too_small_count=too_small_count,
        low_stability_count=low_stability_count,
    )

    best_frame_candidates = usable_frames or detected_frames
    best_frame = max(best_frame_candidates, key=lambda frame: frame['metrics']['compositeScore'])

    return {
        'bestFrameIndex': best_frame['frameIndex'],
        'usableFrameCount': usable_frame_count,
        'coverageRatio': coverage_ratio,
        'medianStabilityScore': median_stability_score,
        'medianBodyTurnScore': median_body_turn_score,
        'medianRacketArmLiftScore': median_racket_arm_lift_score,
        'scoreVariance': score_variance,
        'rejectionReasons': rejection_reasons,
        'humanSummary': _build_human_summary(
            frame_count=len(frames),
            usable_frame_count=usable_frame_count,
            median_body_turn_score=median_body_turn_score,
            median_racket_arm_lift_score=median_racket_arm_lift_score,
            rejection_reasons=rejection_reasons,
        ),
    }


def _ensure_pose_landmarker_model() -> Path:
    model_dir = Path(__file__).resolve().parent.parent / 'models'
    model_dir.mkdir(parents=True, exist_ok=True)
    model_path = model_dir / 'pose_landmarker_lite.task'
    if not model_path.exists():
        urlretrieve(POSE_LANDMARKER_MODEL_URL, model_path)
    return model_path


def _frame_status(metrics: Optional[Dict[str, Any]]) -> str:
    if not metrics:
        return 'not_detected'
    if (metrics['subjectScale'] or 0.0) < SUBJECT_SCALE_THRESHOLD:
        return 'detected'
    if (metrics['stabilityScore'] or 0.0) < USABLE_STABILITY_THRESHOLD:
        return 'detected'
    return 'usable'


def _estimate_with_legacy_solutions(frame_paths: List[Path]) -> Dict[str, Any]:
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
            keypoints = _extract_keypoints_from_legacy(results)
            metrics = _compute_frame_metrics(keypoints) if keypoints else None
            if keypoints:
                detected_count += 1

            frames.append({
                'frameIndex': index,
                'fileName': frame_path.name,
                'status': _frame_status(metrics) if keypoints else 'not_detected',
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


def _estimate_with_tasks_api(frame_paths: List[Path]) -> Dict[str, Any]:
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    model_path = _ensure_pose_landmarker_model()
    frames = []
    detected_count = 0

    options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.IMAGE,
        num_poses=1,
    )

    with vision.PoseLandmarker.create_from_options(options) as detector:
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
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = detector.detect(mp_image)
            keypoints = _extract_keypoints_from_tasks(result)
            metrics = _compute_frame_metrics(keypoints) if keypoints else None
            if keypoints:
                detected_count += 1

            frames.append({
                'frameIndex': index,
                'fileName': frame_path.name,
                'status': _frame_status(metrics) if keypoints else 'not_detected',
                'keypoints': keypoints,
                'metrics': metrics,
            })

    return {
        'engine': 'mediapipe-tasks-pose-landmarker',
        'frameCount': len(frame_paths),
        'detectedFrameCount': detected_count,
        'summary': _build_overall_summary(frames, detected_count),
        'frames': frames,
    }


def estimate_pose_for_frames(frame_paths: List[Path]) -> Dict[str, Any]:
    if hasattr(mp, 'solutions'):
        return _estimate_with_legacy_solutions(frame_paths)
    return _estimate_with_tasks_api(frame_paths)
