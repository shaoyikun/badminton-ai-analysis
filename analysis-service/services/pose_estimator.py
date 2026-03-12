from __future__ import annotations

from pathlib import Path
from statistics import mean, median, pvariance
from typing import Any, Dict, List, Optional, Tuple
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

POSE_CONNECTIONS = [
    ('left_shoulder', 'right_shoulder'),
    ('left_shoulder', 'left_elbow'),
    ('left_elbow', 'left_wrist'),
    ('right_shoulder', 'right_elbow'),
    ('right_elbow', 'right_wrist'),
    ('left_shoulder', 'left_hip'),
    ('right_shoulder', 'right_hip'),
    ('left_hip', 'right_hip'),
    ('left_hip', 'left_knee'),
    ('left_knee', 'left_ankle'),
    ('right_hip', 'right_knee'),
    ('right_knee', 'right_ankle'),
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
MAX_SCORE_VARIANCE = 0.04

VIEW_PROFILE_LABELS = {
    'rear': '后方',
    'rear_left_oblique': '左后斜',
    'rear_right_oblique': '右后斜',
    'left_side': '左侧面',
    'right_side': '右侧面',
    'front_left_oblique': '左前斜',
    'front_right_oblique': '右前斜',
    'front': '正面',
    'unknown': '未确定',
}

RACKET_SIDE_LABELS = {
    'left': '左手挥拍侧',
    'right': '右手挥拍侧',
    'unknown': '挥拍侧未确定',
}


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


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _safe_mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _median(values: List[float]) -> float:
    if not values:
        return 0.0
    return _round(median(values))


def _variance(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    return _round(pvariance(values))


def _backend_root_from_task_dir(task_dir: Path) -> Path:
    resolved = task_dir.resolve()
    for candidate in [resolved, *resolved.parents]:
        if candidate.name == 'backend':
            return candidate

    if len(resolved.parents) >= 4:
        return resolved.parents[3]
    return resolved.parent


def _artifact_relative_path(task_dir: Path, target_path: Path) -> str:
    backend_root = _backend_root_from_task_dir(task_dir)
    try:
        return target_path.resolve().relative_to(backend_root).as_posix()
    except ValueError:
        return target_path.name


def _overlay_output_paths(task_dir: Path, frame_name: str) -> Tuple[Path, str]:
    task_root = task_dir.resolve().parent
    overlay_dir = task_root / 'pose' / 'overlays'
    overlay_dir.mkdir(parents=True, exist_ok=True)
    overlay_path = overlay_dir / frame_name.replace('.jpg', '-overlay.jpg')
    return overlay_path, _artifact_relative_path(task_dir, overlay_path)


def _point_visibility(point: Optional[Dict[str, Any]]) -> float:
    if not point:
        return 0.0
    return float(point.get('visibility', 0.0))


def _arm_lift_value(
    wrist: Optional[Dict[str, Any]],
    shoulder: Optional[Dict[str, Any]],
    elbow: Optional[Dict[str, Any]] = None,
) -> float:
    if not wrist or not shoulder:
        return 0.0

    lift_delta = shoulder['y'] - wrist['y']
    visibility = _safe_mean([
        _point_visibility(shoulder),
        _point_visibility(wrist),
        _point_visibility(elbow),
    ])
    return _clamp(max(0.0, lift_delta + 0.35) * visibility * 1.4)


def _infer_frame_racket_side(
    points: Dict[str, Dict[str, Any]],
) -> Tuple[str, float, float, float]:
    left_score = _arm_lift_value(
        _safe_get(points, 'left_wrist'),
        _safe_get(points, 'left_shoulder'),
        _safe_get(points, 'left_elbow'),
    )
    right_score = _arm_lift_value(
        _safe_get(points, 'right_wrist'),
        _safe_get(points, 'right_shoulder'),
        _safe_get(points, 'right_elbow'),
    )

    total = left_score + right_score
    if total < 0.08:
        return 'unknown', 0.0, left_score, right_score

    confidence = _clamp(abs(left_score - right_score) / max(total, 0.001))
    if confidence < 0.12:
        return 'unknown', confidence, left_score, right_score

    return ('left' if left_score > right_score else 'right'), confidence, left_score, right_score


def _infer_frame_view_profile(
    points: Dict[str, Dict[str, Any]],
) -> Tuple[str, float]:
    left_shoulder = _safe_get(points, 'left_shoulder')
    right_shoulder = _safe_get(points, 'right_shoulder')
    left_hip = _safe_get(points, 'left_hip')
    right_hip = _safe_get(points, 'right_hip')
    nose = _safe_get(points, 'nose')

    if not all([left_shoulder, right_shoulder, left_hip, right_hip, nose]):
        return 'unknown', 0.0

    body_visibility = _safe_mean([
        _point_visibility(left_shoulder),
        _point_visibility(right_shoulder),
        _point_visibility(left_hip),
        _point_visibility(right_hip),
        _point_visibility(nose),
    ])
    if body_visibility < 0.28:
        return 'unknown', _round(body_visibility)

    shoulder_span = abs(left_shoulder['x'] - right_shoulder['x'])
    shoulder_depth_gap = abs(left_shoulder['z'] - right_shoulder['z'])
    hip_depth_gap = abs(left_hip['z'] - right_hip['z'])
    face_visibility = _safe_mean([
        _point_visibility(nose),
        _point_visibility(_safe_get(points, 'left_eye')),
        _point_visibility(_safe_get(points, 'right_eye')),
        _point_visibility(_safe_get(points, 'left_ear')),
        _point_visibility(_safe_get(points, 'right_ear')),
    ])

    left_side_closer = (
        ((left_shoulder['z'] + left_hip['z']) / 2)
        < ((right_shoulder['z'] + right_hip['z']) / 2)
    )
    side_prefix = 'left' if left_side_closer else 'right'

    if shoulder_span < 0.11:
        confidence = _clamp((0.14 - shoulder_span) / 0.08 + max(shoulder_depth_gap, hip_depth_gap))
        return f'{side_prefix}_side', _round(confidence)

    if shoulder_span < 0.26:
        confidence = _clamp(
            ((0.28 - shoulder_span) / 0.18) * 0.55
            + max(shoulder_depth_gap, hip_depth_gap) * 1.8
            + body_visibility * 0.25
        )
        if face_visibility >= 0.6:
            return f'front_{side_prefix}_oblique', _round(confidence)
        return f'rear_{side_prefix}_oblique', _round(confidence)

    confidence = _clamp(body_visibility * 0.5 + shoulder_span * 0.6 + max(0.0, 0.7 - max(shoulder_depth_gap, hip_depth_gap)))
    if face_visibility >= 0.6:
        return 'front', _round(confidence)
    return 'rear', _round(confidence)


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
    frame_racket_side, _, left_lift_score, right_lift_score = _infer_frame_racket_side(points)
    racket_arm_lift_score = _round(max(left_lift_score, right_lift_score))

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

    body_text = '转体展开较明显' if body_turn_score >= 0.45 else '身体仍较多正对镜头'
    if frame_racket_side == 'unknown':
        arm_text = '挥拍侧还不够稳定'
    else:
        arm_text = f'{RACKET_SIDE_LABELS[frame_racket_side]}上举较明显' if racket_arm_lift_score >= 0.45 else f'{RACKET_SIDE_LABELS[frame_racket_side]}上举还不够明显'

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
    score_variance: float,
    too_small_count: int,
    low_stability_count: int,
    unknown_view_count: int,
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
        if score_variance > MAX_SCORE_VARIANCE:
            reasons.append('insufficient_action_evidence')
        if unknown_view_count >= max(4, usable_frame_count - 1):
            reasons.append('invalid_camera_angle')

    deduped: List[str] = []
    for reason in reasons:
        if reason not in deduped:
            deduped.append(reason)
    return deduped


def _summarize_view_profile(profiles: List[str]) -> Tuple[str, float]:
    if not profiles:
        return 'unknown', 0.0

    counts: Dict[str, int] = {}
    for profile in profiles:
        counts[profile] = counts.get(profile, 0) + 1

    best_profile, best_count = max(counts.items(), key=lambda item: item[1])
    return best_profile, _round(best_count / len(profiles))


def _summarize_racket_side(frames: List[Dict[str, Any]]) -> Tuple[str, float]:
    weighted_scores = {'left': 0.0, 'right': 0.0}
    for frame in frames:
        points = _get_point_map(frame['keypoints'])
        side, confidence, left_score, right_score = _infer_frame_racket_side(points)
        weighted_scores['left'] += left_score
        weighted_scores['right'] += right_score
        if side in weighted_scores:
            weighted_scores[side] += confidence * 0.2

    total = weighted_scores['left'] + weighted_scores['right']
    if total < 0.12:
        return 'unknown', 0.0

    if abs(weighted_scores['left'] - weighted_scores['right']) < 0.05:
        return 'unknown', _round(abs(weighted_scores['left'] - weighted_scores['right']) / max(total, 0.001))

    side = 'left' if weighted_scores['left'] > weighted_scores['right'] else 'right'
    confidence = _round(abs(weighted_scores['left'] - weighted_scores['right']) / max(total, 0.001))
    return side, confidence


def _build_human_summary(
    frame_count: int,
    usable_frame_count: int,
    median_body_turn_score: float,
    median_racket_arm_lift_score: float,
    rejection_reasons: List[str],
    view_profile: str,
    dominant_racket_side: str,
) -> str:
    evidence_prefix = f'本次基于 {usable_frame_count}/{frame_count} 帧稳定识别结果'
    view_text = VIEW_PROFILE_LABELS.get(view_profile, '当前视角')
    side_text = RACKET_SIDE_LABELS.get(dominant_racket_side, '挥拍侧未确定')

    if rejection_reasons:
        first_reason = rejection_reasons[0]
        if first_reason == 'body_not_detected':
            return '当前样本还没有稳定识别到人体关键点，暂时无法生成可信报告。'
        if first_reason == 'subject_too_small_or_cropped':
            return f'{evidence_prefix}判断主体过小或入镜不完整，建议调整距离并保证全身完整入镜。'
        if first_reason == 'poor_lighting_or_occlusion':
            return f'{evidence_prefix}判断画面可见性不足，建议改善光线、遮挡和清晰度后重拍。'
        if first_reason == 'invalid_camera_angle':
            return f'{evidence_prefix}里视角变化过大，系统仍无法稳定确认拍摄方向，建议尽量保持单一机位。'
        return f'{evidence_prefix}仍不足以支撑正式报告，建议补齐动作过程并重拍。'

    if median_body_turn_score >= 0.45 and median_racket_arm_lift_score >= 0.45:
        return f'{evidence_prefix}生成：当前识别为{view_text}，以{side_text}为主，已经能看到较稳定的转体展开和挥拍臂准备。'
    if median_body_turn_score >= 0.45:
        return f'{evidence_prefix}生成：当前识别为{view_text}，以{side_text}为主，转体展开相对稳定，但挥拍臂准备还不够充分。'
    if median_racket_arm_lift_score >= 0.45:
        return f'{evidence_prefix}生成：当前识别为{view_text}，以{side_text}为主，挥拍臂准备能看出来，但转体展开还不够稳定。'
    return f'{evidence_prefix}生成：当前识别为{view_text}，以{side_text}为主，主体可见，但转体展开和挥拍臂准备都还偏弱。'


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
            'viewProfile': 'unknown',
            'viewConfidence': 0.0,
            'viewStability': 0.0,
            'dominantRacketSide': 'unknown',
            'racketSideConfidence': 0.0,
            'bestFrameOverlayRelativePath': None,
            'overlayFrameCount': 0,
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
    usable_profiles = [frame.get('viewProfile', 'unknown') for frame in usable_frames]
    view_profile, view_stability = _summarize_view_profile(usable_profiles)
    view_confidences = [
        float(frame.get('viewConfidence', 0.0))
        for frame in usable_frames
        if frame.get('viewProfile') == view_profile
    ]
    view_confidence = _median(view_confidences) if view_confidences else 0.0
    dominant_racket_side, racket_side_confidence = _summarize_racket_side(usable_frames or detected_frames)
    unknown_view_count = sum(1 for profile in usable_profiles if profile == 'unknown')
    rejection_reasons = _build_rejection_reasons(
        frame_count=len(frames),
        detected_count=detected_count,
        usable_frame_count=usable_frame_count,
        coverage_ratio=coverage_ratio,
        median_stability_score=median_stability_score,
        score_variance=score_variance,
        too_small_count=too_small_count,
        low_stability_count=low_stability_count,
        unknown_view_count=unknown_view_count,
    )

    best_frame_candidates = usable_frames or detected_frames
    best_frame = max(best_frame_candidates, key=lambda frame: frame['metrics']['compositeScore'])
    overlay_frame_count = sum(1 for frame in frames if frame.get('overlayRelativePath'))

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
            view_profile=view_profile,
            dominant_racket_side=dominant_racket_side,
        ),
        'viewProfile': view_profile,
        'viewConfidence': view_confidence,
        'viewStability': view_stability,
        'dominantRacketSide': dominant_racket_side,
        'racketSideConfidence': racket_side_confidence,
        'bestFrameOverlayRelativePath': best_frame.get('overlayRelativePath'),
        'overlayFrameCount': overlay_frame_count,
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


def _point_to_pixel(point: Dict[str, Any], image_shape: Tuple[int, int, int]) -> Tuple[int, int]:
    height, width = image_shape[:2]
    x = int(_clamp(point['x']) * (width - 1))
    y = int(_clamp(point['y']) * (height - 1))
    return x, y


def _draw_overlay(
    image: Any,
    keypoints: List[Dict[str, Any]],
    labels: List[str],
) -> Any:
    canvas = image.copy()
    points = _get_point_map(keypoints)

    for start_name, end_name in POSE_CONNECTIONS:
        start = _safe_get(points, start_name)
        end = _safe_get(points, end_name)
        if not start or not end:
            continue
        if min(_point_visibility(start), _point_visibility(end)) < 0.2:
            continue
        cv2.line(canvas, _point_to_pixel(start, canvas.shape), _point_to_pixel(end, canvas.shape), (62, 120, 255), 2)

    for point in keypoints:
        if _point_visibility(point) < 0.2:
            continue
        color = (32, 186, 118) if point['name'] in {'left_wrist', 'right_wrist'} else (255, 208, 90)
        cv2.circle(canvas, _point_to_pixel(point, canvas.shape), 4, color, -1)

    box_height = 28 + (len(labels) * 18)
    overlay = canvas.copy()
    cv2.rectangle(overlay, (12, 12), (328, box_height), (14, 24, 48), -1)
    canvas = cv2.addWeighted(overlay, 0.72, canvas, 0.28, 0.0)

    y = 32
    for line in labels:
        cv2.putText(canvas, line, (24, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (242, 247, 255), 1, cv2.LINE_AA)
        y += 18

    return canvas


def _build_frame_payload(
    task_dir: Path,
    frame_path: Path,
    index: int,
    image: Any,
    keypoints: List[Dict[str, Any]],
) -> Dict[str, Any]:
    metrics = _compute_frame_metrics(keypoints) if keypoints else None
    status = _frame_status(metrics) if keypoints else 'not_detected'
    points = _get_point_map(keypoints)
    frame_view_profile, view_confidence = _infer_frame_view_profile(points) if keypoints else ('unknown', 0.0)
    frame_racket_side, racket_side_confidence, _, _ = _infer_frame_racket_side(points) if keypoints else ('unknown', 0.0, 0.0, 0.0)
    overlay_relative_path = None

    if image is not None and keypoints:
        overlay_path, overlay_relative_path = _overlay_output_paths(task_dir, frame_path.name)
        overlay_image = _draw_overlay(image, keypoints, [
            f'Frame {index:02d}',
            f'View: {VIEW_PROFILE_LABELS.get(frame_view_profile, frame_view_profile)}',
            f'Racket: {RACKET_SIDE_LABELS.get(frame_racket_side, frame_racket_side)}',
            f'Status: {status}',
        ])
        cv2.imwrite(str(overlay_path), overlay_image)

    return {
        'frameIndex': index,
        'fileName': frame_path.name,
        'status': status,
        'keypoints': keypoints,
        'metrics': metrics,
        'overlayRelativePath': overlay_relative_path,
        'viewProfile': frame_view_profile,
        'viewConfidence': view_confidence,
        'dominantRacketSide': frame_racket_side,
        'racketSideConfidence': racket_side_confidence,
    }


def _estimate_with_legacy_solutions(frame_paths: List[Path]) -> Dict[str, Any]:
    frames = []
    detected_count = 0
    task_dir = frame_paths[0].resolve().parent if frame_paths else Path.cwd()

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
                    'overlayRelativePath': None,
                    'viewProfile': 'unknown',
                    'viewConfidence': 0.0,
                    'dominantRacketSide': 'unknown',
                    'racketSideConfidence': 0.0,
                })
                continue

            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = pose.process(rgb)
            keypoints = _extract_keypoints_from_legacy(results)
            if keypoints:
                detected_count += 1

            frames.append(_build_frame_payload(task_dir, frame_path, index, image, keypoints))

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
    task_dir = frame_paths[0].resolve().parent if frame_paths else Path.cwd()

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
                    'overlayRelativePath': None,
                    'viewProfile': 'unknown',
                    'viewConfidence': 0.0,
                    'dominantRacketSide': 'unknown',
                    'racketSideConfidence': 0.0,
                })
                continue

            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = detector.detect(mp_image)
            keypoints = _extract_keypoints_from_tasks(result)
            if keypoints:
                detected_count += 1

            frames.append(_build_frame_payload(task_dir, frame_path, index, image, keypoints))

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
