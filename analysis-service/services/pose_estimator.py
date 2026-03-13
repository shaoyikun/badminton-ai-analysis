from __future__ import annotations

import copy
import hashlib
import json
import os
from math import acos, atan2, degrees, sqrt
from pathlib import Path
from statistics import mean, median, pvariance
from typing import Any, Dict, List, Optional, Tuple
from urllib.request import urlretrieve

try:  # pragma: no cover - import availability depends on local runtime
    import cv2
except ModuleNotFoundError:  # pragma: no cover - import availability depends on local runtime
    cv2 = None

try:  # pragma: no cover - import availability depends on local runtime
    import mediapipe as mp
except ModuleNotFoundError:  # pragma: no cover - import availability depends on local runtime
    mp = None

from services.frame_loader import load_frame_timestamps_ms


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

DEFAULT_POSE_LANDMARKER_MODEL_URL = (
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/'
    'pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
)

USABLE_STABILITY_THRESHOLD = 0.6
LOW_STABILITY_THRESHOLD = 0.45
SUBJECT_SCALE_THRESHOLD = 0.12
MIN_USABLE_FRAME_COUNT = 6
MIN_COVERAGE_RATIO = 0.6
MAX_SCORE_VARIANCE = 0.04
EMA_COORDINATE_ALPHA = 0.35
EMA_VISIBILITY_ALPHA = 0.5
MOTION_CONTINUITY_SCALE = 0.2
MOTION_CONTINUITY_REJECTION_THRESHOLD = 0.55
LARGE_MOTION_JUMP_THRESHOLD = 0.18
MIN_STABLE_VIEW_CONFIDENCE = 0.45
MIN_VIEW_TRANSITIONS_FOR_UNKNOWN = 2
SPECIALIZED_VISIBILITY_THRESHOLD = 0.45
SPECIALIZED_MIN_TORSO_SCALE = 0.08
SPECIALIZED_MIN_DEPTH_EVIDENCE = 0.035
TORSO_YAW_TARGET_DEGREES = 55.0
ROTATION_DIFFERENCE_TARGET_DEGREES = 30.0
CHEST_OPENING_TARGET = 1.1
ELBOW_EXTENSION_MIN_DEGREES = 100.0
ELBOW_EXTENSION_MAX_DEGREES = 165.0
ELBOW_HEIGHT_TARGET = 0.42
WRIST_ABOVE_SHOULDER_TARGET = 0.65
HEAD_CENTER_OFFSET_TARGET = 0.38
HEAD_TILT_TARGET = 0.22
NON_RACKET_ELBOW_HEIGHT_TARGET = 0.28
NON_RACKET_ARM_SPREAD_TARGET = 0.75
PREPARATION_WINDOW_PEAK_RATIO = 0.75
PREPARATION_WINDOW_MIN_SCORE = 0.45

SPECIALIZED_FEATURE_NAMES = (
    'shoulderHipRotationScore',
    'trunkCoilScore',
    'sideOnReadinessScore',
    'chestOpeningScore',
    'elbowExtensionScore',
    'hittingArmPreparationScore',
    'racketSideElbowHeightScore',
    'wristAboveShoulderConfidence',
    'headStabilityScore',
    'contactPreparationScore',
    'nonRacketArmBalanceScore',
)

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


class TasksModeError(RuntimeError):
    pass


def _extract_keypoints_from_legacy(results: Any) -> List[Dict[str, Any]]:
    if not getattr(results, 'pose_landmarks', None):
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


def _mean_abs_delta(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    deltas = [abs(current - previous) for previous, current in zip(values, values[1:])]
    return _round(_safe_mean(deltas))


def _round_nested(value: Any) -> Any:
    if isinstance(value, float):
        return _round(value)
    if isinstance(value, dict):
        return {key: _round_nested(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_round_nested(item) for item in value]
    return value


def _midpoint(first: Dict[str, Any], second: Dict[str, Any], *, name: str = 'midpoint') -> Dict[str, Any]:
    return {
        'name': name,
        'x': (float(first['x']) + float(second['x'])) / 2,
        'y': (float(first['y']) + float(second['y'])) / 2,
        'z': (float(first['z']) + float(second['z'])) / 2,
        'visibility': _safe_mean([
            _point_visibility(first),
            _point_visibility(second),
        ]),
    }


def _distance_2d(first: Dict[str, Any], second: Dict[str, Any]) -> float:
    return sqrt(((float(first['x']) - float(second['x'])) ** 2) + ((float(first['y']) - float(second['y'])) ** 2))


def _angle_degrees(first: Dict[str, Any], vertex: Dict[str, Any], second: Dict[str, Any]) -> Optional[float]:
    first_vector = (
        float(first['x']) - float(vertex['x']),
        float(first['y']) - float(vertex['y']),
        float(first['z']) - float(vertex['z']),
    )
    second_vector = (
        float(second['x']) - float(vertex['x']),
        float(second['y']) - float(vertex['y']),
        float(second['z']) - float(vertex['z']),
    )
    first_length = sqrt(sum(component * component for component in first_vector))
    second_length = sqrt(sum(component * component for component in second_vector))
    if first_length <= 0.0 or second_length <= 0.0:
        return None

    cosine = sum(left * right for left, right in zip(first_vector, second_vector)) / (first_length * second_length)
    return degrees(acos(_clamp(cosine, -1.0, 1.0)))


def _yaw_degrees(left_point: Dict[str, Any], right_point: Dict[str, Any]) -> float:
    x_gap = abs(float(left_point['x']) - float(right_point['x']))
    z_gap = abs(float(left_point['z']) - float(right_point['z']))
    return degrees(atan2(z_gap, max(x_gap, 1e-6)))


def _normalize_range(value: float, minimum: float, maximum: float) -> float:
    if maximum <= minimum:
        return 0.0
    return _clamp((value - minimum) / (maximum - minimum))


def _feature_values_with_defaults(feature_values: Optional[Dict[str, Optional[float]]] = None) -> Dict[str, Optional[float]]:
    values = {name: None for name in SPECIALIZED_FEATURE_NAMES}
    if feature_values:
        values.update(feature_values)
    return values


def _empty_specialized_debug(selected_racket_side: str = 'unknown', selected_source: str = 'unavailable') -> Dict[str, Any]:
    return {
        'selectedRacketSide': selected_racket_side,
        'selectedRacketSideSource': selected_source,
        'observability': {
            feature_name: {
                'observable': False,
                'reasons': ['insufficient_keypoints'],
            }
            for feature_name in SPECIALIZED_FEATURE_NAMES
        },
        'components': {},
    }


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


def _side_specific_points(points: Dict[str, Dict[str, Any]], side: str) -> Dict[str, Optional[Dict[str, Any]]]:
    return {
        'shoulder': _safe_get(points, f'{side}_shoulder'),
        'elbow': _safe_get(points, f'{side}_elbow'),
        'wrist': _safe_get(points, f'{side}_wrist'),
        'oppositeShoulder': _safe_get(points, f'{"left" if side == "right" else "right"}_shoulder'),
    }


def _compute_side_arm_preparation(
    points: Dict[str, Dict[str, Any]],
    side: str,
    shoulder_center: Dict[str, Any],
    shoulder_span: float,
    torso_height: float,
) -> Dict[str, Any]:
    side_points = _side_specific_points(points, side)
    shoulder = side_points['shoulder']
    elbow = side_points['elbow']
    wrist = side_points['wrist']
    opposite_shoulder = side_points['oppositeShoulder']
    reasons: List[str] = []
    components: Dict[str, Any] = {}
    feature_values = {
        'chestOpeningScore': None,
        'elbowExtensionScore': None,
        'racketSideElbowHeightScore': None,
        'wristAboveShoulderConfidence': None,
        'hittingArmPreparationScore': None,
    }

    required_points = {
        'shoulder': shoulder,
        'elbow': elbow,
        'wrist': wrist,
        'oppositeShoulder': opposite_shoulder,
    }
    for name, point in required_points.items():
        if point is None:
            reasons.append(f'missing_{name}')
        elif _point_visibility(point) < SPECIALIZED_VISIBILITY_THRESHOLD:
            reasons.append(f'low_visibility_{name}')

    if shoulder_span < 0.02 or torso_height < 0.02:
        reasons.append('torso_reference_too_small')

    if reasons:
        return {
            'side': side,
            'observable': False,
            'reasons': sorted(set(reasons)),
            'featureValues': feature_values,
            'components': components,
            'chainScore': 0.0,
        }

    elbow_angle = _angle_degrees(shoulder, elbow, wrist)
    if elbow_angle is not None:
        elbow_extension = _normalize_range(
            elbow_angle,
            ELBOW_EXTENSION_MIN_DEGREES,
            ELBOW_EXTENSION_MAX_DEGREES,
        ) * _safe_mean([_point_visibility(shoulder), _point_visibility(elbow), _point_visibility(wrist)])
        feature_values['elbowExtensionScore'] = _round(elbow_extension)
        components['elbowExtensionScore'] = {
            'elbowAngleDegrees': elbow_angle,
            'normalized': elbow_extension,
        }

    shoulder_line_y = (float(shoulder['y']) + float(opposite_shoulder['y'])) / 2
    elbow_height_ratio = (shoulder_line_y - float(elbow['y'])) / max(torso_height, 1e-6)
    elbow_height_score = _clamp(elbow_height_ratio / ELBOW_HEIGHT_TARGET) * _safe_mean([
        _point_visibility(shoulder),
        _point_visibility(elbow),
    ])
    feature_values['racketSideElbowHeightScore'] = _round(elbow_height_score)
    components['racketSideElbowHeightScore'] = {
        'shoulderLineY': shoulder_line_y,
        'elbowHeightRatio': elbow_height_ratio,
        'normalized': elbow_height_score,
    }

    wrist_height_ratio = (float(shoulder['y']) - float(wrist['y'])) / max(torso_height, 1e-6)
    wrist_above_score = _clamp(wrist_height_ratio / WRIST_ABOVE_SHOULDER_TARGET) * _safe_mean([
        _point_visibility(shoulder),
        _point_visibility(wrist),
    ])
    feature_values['wristAboveShoulderConfidence'] = _round(wrist_above_score)
    components['wristAboveShoulderConfidence'] = {
        'wristHeightRatio': wrist_height_ratio,
        'normalized': wrist_above_score,
    }

    direction = 1 if side == 'right' else -1
    elbow_outward = max(0.0, direction * (float(elbow['x']) - float(shoulder_center['x']))) / max(shoulder_span, 1e-6)
    wrist_outward = max(0.0, direction * (float(wrist['x']) - float(shoulder_center['x']))) / max(shoulder_span, 1e-6)
    chest_opening = _clamp(((elbow_outward * 0.45) + (wrist_outward * 0.55)) / CHEST_OPENING_TARGET) * _safe_mean([
        _point_visibility(shoulder),
        _point_visibility(elbow),
        _point_visibility(wrist),
        _point_visibility(opposite_shoulder),
    ])
    feature_values['chestOpeningScore'] = _round(chest_opening)
    components['chestOpeningScore'] = {
        'elbowOutward': elbow_outward,
        'wristOutward': wrist_outward,
        'normalized': chest_opening,
    }

    weighted_inputs = {
        'elbowExtensionScore': (feature_values['elbowExtensionScore'], 0.35),
        'racketSideElbowHeightScore': (feature_values['racketSideElbowHeightScore'], 0.3),
        'wristAboveShoulderConfidence': (feature_values['wristAboveShoulderConfidence'], 0.2),
        'chestOpeningScore': (feature_values['chestOpeningScore'], 0.15),
    }
    total_weight = sum(weight for value, weight in weighted_inputs.values() if value is not None)
    if total_weight > 0.0:
        chain_score = sum(float(value) * weight for value, weight in weighted_inputs.values() if value is not None) / total_weight
        feature_values['hittingArmPreparationScore'] = _round(chain_score)
    else:
        chain_score = 0.0

    components['hittingArmPreparationScore'] = {
        'weightsUsed': _round(total_weight),
        'normalized': _round(chain_score),
    }

    return {
        'side': side,
        'observable': True,
        'reasons': [],
        'featureValues': feature_values,
        'components': components,
        'chainScore': _round(chain_score),
    }


def _compute_head_stability(
    points: Dict[str, Dict[str, Any]],
    shoulder_center: Dict[str, Any],
    shoulder_span: float,
) -> Tuple[Optional[float], Dict[str, Any], List[str]]:
    nose = _safe_get(points, 'nose')
    left_ear = _safe_get(points, 'left_ear')
    right_ear = _safe_get(points, 'right_ear')
    left_eye = _safe_get(points, 'left_eye')
    right_eye = _safe_get(points, 'right_eye')

    head_pair_left = left_ear or left_eye
    head_pair_right = right_ear or right_eye
    reasons: List[str] = []
    if nose is None:
        reasons.append('missing_nose')
    if head_pair_left is None or head_pair_right is None:
        reasons.append('missing_head_pair')
    if nose is not None and _point_visibility(nose) < SPECIALIZED_VISIBILITY_THRESHOLD:
        reasons.append('low_visibility_nose')
    if head_pair_left is not None and _point_visibility(head_pair_left) < SPECIALIZED_VISIBILITY_THRESHOLD:
        reasons.append('low_visibility_head_pair_left')
    if head_pair_right is not None and _point_visibility(head_pair_right) < SPECIALIZED_VISIBILITY_THRESHOLD:
        reasons.append('low_visibility_head_pair_right')
    if shoulder_span < 0.02:
        reasons.append('shoulder_span_too_small')

    if reasons:
        return None, {}, sorted(set(reasons))

    head_center = _midpoint(head_pair_left, head_pair_right, name='head_center')
    center_offset = abs(float(head_center['x']) - float(shoulder_center['x'])) / max(shoulder_span, 1e-6)
    tilt_ratio = abs(float(head_pair_left['y']) - float(head_pair_right['y'])) / max(shoulder_span, 1e-6)
    center_score = _clamp(1 - (center_offset / HEAD_CENTER_OFFSET_TARGET))
    tilt_score = _clamp(1 - (tilt_ratio / HEAD_TILT_TARGET))
    head_score = _safe_mean([
        center_score,
        tilt_score,
        _safe_mean([
            _point_visibility(nose),
            _point_visibility(head_pair_left),
            _point_visibility(head_pair_right),
        ]),
    ])
    return _round(head_score), {
        'centerOffsetRatio': center_offset,
        'tiltRatio': tilt_ratio,
        'normalized': head_score,
    }, []


def _compute_non_racket_arm_balance(
    points: Dict[str, Dict[str, Any]],
    non_racket_side: str,
    shoulder_center: Dict[str, Any],
    shoulder_span: float,
    torso_height: float,
) -> Tuple[Optional[float], Dict[str, Any], List[str]]:
    side_points = _side_specific_points(points, non_racket_side)
    shoulder = side_points['shoulder']
    elbow = side_points['elbow']
    wrist = side_points['wrist']
    opposite_shoulder = side_points['oppositeShoulder']
    reasons: List[str] = []

    for name, point in {
        'shoulder': shoulder,
        'elbow': elbow,
        'wrist': wrist,
        'oppositeShoulder': opposite_shoulder,
    }.items():
        if point is None:
            reasons.append(f'missing_{name}')
        elif _point_visibility(point) < SPECIALIZED_VISIBILITY_THRESHOLD:
            reasons.append(f'low_visibility_{name}')

    if shoulder_span < 0.02 or torso_height < 0.02:
        reasons.append('torso_reference_too_small')

    if reasons:
        return None, {}, sorted(set(reasons))

    shoulder_line_y = (float(shoulder['y']) + float(opposite_shoulder['y'])) / 2
    elbow_height_ratio = (shoulder_line_y - float(elbow['y'])) / max(torso_height, 1e-6)
    elbow_height_score = _clamp(elbow_height_ratio / NON_RACKET_ELBOW_HEIGHT_TARGET)
    wrist_spread_ratio = abs(float(wrist['x']) - float(shoulder_center['x'])) / max(shoulder_span, 1e-6)
    wrist_spread_score = _clamp(wrist_spread_ratio / NON_RACKET_ARM_SPREAD_TARGET)
    balance_score = _safe_mean([
        elbow_height_score,
        wrist_spread_score,
        _safe_mean([
            _point_visibility(shoulder),
            _point_visibility(elbow),
            _point_visibility(wrist),
        ]),
    ])
    return _round(balance_score), {
        'elbowHeightRatio': elbow_height_ratio,
        'wristSpreadRatio': wrist_spread_ratio,
        'normalized': balance_score,
    }, []


def _compute_specialized_metrics(
    points: Dict[str, Dict[str, Any]],
    subject_scale: float,
    torso_height: float,
    inferred_racket_side: str,
) -> Tuple[Dict[str, Optional[float]], Dict[str, Any]]:
    values = _feature_values_with_defaults()
    debug_payload = _empty_specialized_debug()
    components = debug_payload['components']
    observability = debug_payload['observability']

    left_shoulder = _safe_get(points, 'left_shoulder')
    right_shoulder = _safe_get(points, 'right_shoulder')
    left_hip = _safe_get(points, 'left_hip')
    right_hip = _safe_get(points, 'right_hip')

    torso_reasons: List[str] = []
    for name, point in {
        'left_shoulder': left_shoulder,
        'right_shoulder': right_shoulder,
        'left_hip': left_hip,
        'right_hip': right_hip,
    }.items():
        if point is None:
            torso_reasons.append(f'missing_{name}')
        elif _point_visibility(point) < SPECIALIZED_VISIBILITY_THRESHOLD:
            torso_reasons.append(f'low_visibility_{name}')
    if subject_scale < SPECIALIZED_MIN_TORSO_SCALE:
        torso_reasons.append('subject_scale_too_small')

    shoulder_center = _midpoint(left_shoulder, right_shoulder, name='shoulder_center') if left_shoulder and right_shoulder else None
    hip_center = _midpoint(left_hip, right_hip, name='hip_center') if left_hip and right_hip else None
    shoulder_span = abs(float(left_shoulder['x']) - float(right_shoulder['x'])) if left_shoulder and right_shoulder else 0.0

    if not torso_reasons and shoulder_center and hip_center:
        shoulder_yaw = _yaw_degrees(left_shoulder, right_shoulder)
        hip_yaw = _yaw_degrees(left_hip, right_hip)
        depth_evidence = max(
            abs(float(left_shoulder['z']) - float(right_shoulder['z'])),
            abs(float(left_hip['z']) - float(right_hip['z'])),
        )
        alignment_penalty = _clamp(1 - (abs(float(shoulder_center['x']) - float(hip_center['x'])) / max(shoulder_span * 1.1, 1e-6)))
        if depth_evidence < SPECIALIZED_MIN_DEPTH_EVIDENCE and max(shoulder_yaw, hip_yaw) < 8.0:
            torso_reasons.append('weak_depth_evidence')
        else:
            shoulder_hip_rotation = _clamp(abs(shoulder_yaw - hip_yaw) / ROTATION_DIFFERENCE_TARGET_DEGREES)
            side_on_readiness = _clamp((((shoulder_yaw + hip_yaw) / 2) / TORSO_YAW_TARGET_DEGREES) * alignment_penalty)
            trunk_coil = _clamp((shoulder_hip_rotation * 0.6) + (side_on_readiness * 0.4))
            values['shoulderHipRotationScore'] = _round(shoulder_hip_rotation)
            values['sideOnReadinessScore'] = _round(side_on_readiness)
            values['trunkCoilScore'] = _round(trunk_coil)
            components['shoulderHipRotationScore'] = {
                'shoulderYawDegrees': shoulder_yaw,
                'hipYawDegrees': hip_yaw,
                'depthEvidence': depth_evidence,
                'normalized': shoulder_hip_rotation,
            }
            components['sideOnReadinessScore'] = {
                'shoulderYawDegrees': shoulder_yaw,
                'hipYawDegrees': hip_yaw,
                'alignmentPenalty': alignment_penalty,
                'normalized': side_on_readiness,
            }
            components['trunkCoilScore'] = {
                'shoulderHipRotationScore': shoulder_hip_rotation,
                'sideOnReadinessScore': side_on_readiness,
                'normalized': trunk_coil,
            }

    for torso_feature in ('shoulderHipRotationScore', 'sideOnReadinessScore', 'trunkCoilScore'):
        observability[torso_feature] = {
            'observable': values[torso_feature] is not None,
            'reasons': [] if values[torso_feature] is not None else sorted(set(torso_reasons or ['insufficient_torso_evidence'])),
        }

    if shoulder_center is None or shoulder_span <= 0.0 or torso_height <= 0.0:
        arm_candidates = {
            'left': {
                'side': 'left',
                'observable': False,
                'reasons': ['insufficient_torso_reference'],
                'featureValues': {},
                'components': {},
                'chainScore': 0.0,
            },
            'right': {
                'side': 'right',
                'observable': False,
                'reasons': ['insufficient_torso_reference'],
                'featureValues': {},
                'components': {},
                'chainScore': 0.0,
            },
        }
    else:
        arm_candidates = {
            'left': _compute_side_arm_preparation(points, 'left', shoulder_center, shoulder_span, torso_height),
            'right': _compute_side_arm_preparation(points, 'right', shoulder_center, shoulder_span, torso_height),
        }

    selected_side = inferred_racket_side if inferred_racket_side in {'left', 'right'} else 'unknown'
    selected_source = 'frame_inference' if selected_side != 'unknown' else 'unavailable'
    if selected_side == 'unknown':
        best_candidate = max(arm_candidates.values(), key=lambda item: item['chainScore'])
        if best_candidate['observable'] and best_candidate['chainScore'] > 0.0:
            selected_side = str(best_candidate['side'])
            selected_source = 'fallback_arm_chain'

    debug_payload['selectedRacketSide'] = selected_side
    debug_payload['selectedRacketSideSource'] = selected_source
    components['armSideCandidates'] = {
        side: {
            'observable': candidate['observable'],
            'reasons': candidate['reasons'],
            'chainScore': candidate['chainScore'],
        }
        for side, candidate in arm_candidates.items()
    }

    selected_candidate = arm_candidates.get(selected_side) if selected_side in arm_candidates else None
    for feature_name in (
        'chestOpeningScore',
        'elbowExtensionScore',
        'racketSideElbowHeightScore',
        'wristAboveShoulderConfidence',
        'hittingArmPreparationScore',
    ):
        if selected_candidate and selected_candidate['featureValues'].get(feature_name) is not None:
            values[feature_name] = selected_candidate['featureValues'][feature_name]
            components[feature_name] = selected_candidate['components'].get(feature_name, {})
            observability[feature_name] = {
                'observable': True,
                'reasons': [],
            }
        else:
            fallback_reasons = selected_candidate['reasons'] if selected_candidate else ['racket_side_unknown']
            observability[feature_name] = {
                'observable': False,
                'reasons': sorted(set(fallback_reasons or ['racket_side_unknown'])),
            }

    if shoulder_center is not None:
        head_stability, head_components, head_reasons = _compute_head_stability(points, shoulder_center, shoulder_span)
    else:
        head_stability, head_components, head_reasons = None, {}, ['insufficient_torso_reference']
    values['headStabilityScore'] = head_stability
    components['headStabilityScore'] = head_components
    observability['headStabilityScore'] = {
        'observable': head_stability is not None,
        'reasons': head_reasons,
    }

    if selected_side in {'left', 'right'} and shoulder_center is not None:
        non_racket_side = 'left' if selected_side == 'right' else 'right'
        non_racket_balance, balance_components, balance_reasons = _compute_non_racket_arm_balance(
            points,
            non_racket_side,
            shoulder_center,
            shoulder_span,
            torso_height,
        )
    else:
        non_racket_balance, balance_components, balance_reasons = None, {}, ['racket_side_unknown']
    values['nonRacketArmBalanceScore'] = non_racket_balance
    components['nonRacketArmBalanceScore'] = balance_components
    observability['nonRacketArmBalanceScore'] = {
        'observable': non_racket_balance is not None,
        'reasons': balance_reasons,
    }

    preparation_inputs = [
        values['trunkCoilScore'],
        values['hittingArmPreparationScore'],
        values['chestOpeningScore'],
        values['headStabilityScore'],
    ]
    if values['nonRacketArmBalanceScore'] is not None:
        preparation_inputs.append(values['nonRacketArmBalanceScore'])

    if preparation_inputs and all(value is not None for value in preparation_inputs):
        contact_preparation = _safe_mean([float(value) for value in preparation_inputs if value is not None])
        values['contactPreparationScore'] = _round(contact_preparation)
        components['contactPreparationScore'] = {
            'inputsUsed': [value for value in preparation_inputs if value is not None],
            'normalized': contact_preparation,
        }
        observability['contactPreparationScore'] = {
            'observable': True,
            'reasons': [],
        }
    else:
        missing_preparation_reasons: List[str] = []
        for feature_name in ('trunkCoilScore', 'hittingArmPreparationScore', 'chestOpeningScore', 'headStabilityScore'):
            if values[feature_name] is None:
                missing_preparation_reasons.extend(observability[feature_name]['reasons'])
        observability['contactPreparationScore'] = {
            'observable': False,
            'reasons': sorted(set(missing_preparation_reasons or ['insufficient_preparation_evidence'])),
        }

    debug_payload['components'] = _round_nested(components)
    return values, debug_payload


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
            'specialized': _feature_values_with_defaults(),
            'subjectScale': None,
            'compositeScore': 0.0,
            'debug': {
                'torsoHeight': None,
                'shoulderDepthGap': None,
                'hipDepthGap': None,
                'leftArmLiftScore': None,
                'rightArmLiftScore': None,
                'visibilities': {},
                'subjectScaleSource': {
                    'dominantMetric': 'unknown',
                    'values': {
                        'shoulderSpan': None,
                        'hipSpan': None,
                        'torsoHeight': None,
                    },
                },
                'specialized': _empty_specialized_debug(),
                'statusReasons': ['incomplete_keypoints'],
            },
            'summaryText': '关键点不完整，暂时无法计算姿态摘要。',
        }

    shoulder_span = abs(left_shoulder['x'] - right_shoulder['x'])
    hip_span = abs(left_hip['x'] - right_hip['x'])
    torso_height = abs(((left_shoulder['y'] + right_shoulder['y']) / 2) - ((left_hip['y'] + right_hip['y']) / 2))
    subject_scale = max(shoulder_span, hip_span, torso_height)
    shoulder_depth_gap = abs(left_shoulder['z'] - right_shoulder['z'])
    hip_depth_gap = abs(left_hip['z'] - right_hip['z'])
    body_turn_score = _round(max(0.0, min(1.0, 1 - shoulder_span)))
    frame_racket_side, _, left_lift_score, right_lift_score = _infer_frame_racket_side(points)
    racket_arm_lift_score = _round(max(left_lift_score, right_lift_score))
    specialized_values, specialized_debug = _compute_specialized_metrics(
        points,
        subject_scale=subject_scale,
        torso_height=torso_height,
        inferred_racket_side=frame_racket_side,
    )

    visibility_map = {
        'leftShoulder': _round(left_shoulder['visibility']),
        'rightShoulder': _round(right_shoulder['visibility']),
        'leftHip': _round(left_hip['visibility']),
        'rightHip': _round(right_hip['visibility']),
        'leftWrist': _round(left_wrist['visibility']),
        'rightWrist': _round(right_wrist['visibility']),
        'nose': _round(nose['visibility']),
    }
    visibilities = list(visibility_map.values())
    stability_score = _round(mean(visibilities))
    composite_score = _round((stability_score * 0.45) + (body_turn_score * 0.3) + (racket_arm_lift_score * 0.25))
    subject_scale_candidates = {
        'shoulderSpan': _round(shoulder_span),
        'hipSpan': _round(hip_span),
        'torsoHeight': _round(torso_height),
    }
    dominant_subject_scale_metric = max(subject_scale_candidates.items(), key=lambda item: item[1])[0]

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
        'specialized': specialized_values,
        'subjectScale': _round(subject_scale),
        'compositeScore': composite_score,
        'debug': {
            'torsoHeight': _round(torso_height),
            'shoulderDepthGap': _round(shoulder_depth_gap),
            'hipDepthGap': _round(hip_depth_gap),
            'leftArmLiftScore': _round(left_lift_score),
            'rightArmLiftScore': _round(right_lift_score),
            'visibilities': visibility_map,
            'subjectScaleSource': {
                'dominantMetric': dominant_subject_scale_metric,
                'values': subject_scale_candidates,
            },
            'specialized': specialized_debug,
        },
        'summaryText': f'{body_text}，{arm_text}。',
    }


def _compute_elbow_support(points: Dict[str, Dict[str, Any]], racket_side: str) -> float:
    if racket_side not in {'left', 'right'}:
        return 0.55

    shoulder = _safe_get(points, f'{racket_side}_shoulder')
    elbow = _safe_get(points, f'{racket_side}_elbow')
    wrist = _safe_get(points, f'{racket_side}_wrist')
    if not all([shoulder, elbow, wrist]):
        return 0.55

    elbow_height_support = _clamp((shoulder['y'] - elbow['y'] + 0.18) / 0.35)
    elbow_visibility = _safe_mean([
        _point_visibility(shoulder),
        _point_visibility(elbow),
        _point_visibility(wrist),
    ])
    wrist_alignment_support = _clamp(1 - (abs(elbow['x'] - wrist['x']) / 0.35))
    return _round(_safe_mean([elbow_height_support, elbow_visibility, wrist_alignment_support]))


def _build_final_metrics(metrics: Optional[Dict[str, Any]], keypoints: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not metrics:
        return None

    final_metrics = copy.deepcopy(metrics)
    points = _get_point_map(keypoints)
    debug_payload = final_metrics.setdefault('debug', {})

    torso_visibility = _safe_mean([
        _point_visibility(_safe_get(points, 'left_shoulder')),
        _point_visibility(_safe_get(points, 'right_shoulder')),
        _point_visibility(_safe_get(points, 'left_hip')),
        _point_visibility(_safe_get(points, 'right_hip')),
    ])
    shoulder_depth_gap = float(debug_payload.get('shoulderDepthGap') or 0.0)
    hip_depth_gap = float(debug_payload.get('hipDepthGap') or 0.0)
    depth_evidence = max(shoulder_depth_gap, hip_depth_gap)

    original_turn = float(final_metrics.get('bodyTurnScore') or 0.0)
    turn_cap_without_depth = _clamp(0.48 + (torso_visibility * 0.18) + (depth_evidence * 0.9), 0.48, 0.72)
    if depth_evidence < 0.08:
        final_turn = _round(min(original_turn, turn_cap_without_depth))
    else:
        depth_support = _clamp(depth_evidence * 2.6)
        final_turn = _round((original_turn * 0.8) + (depth_support * 0.2))

    racket_side, _, _, _ = _infer_frame_racket_side(points)
    elbow_support = _compute_elbow_support(points, racket_side)
    original_lift = float(final_metrics.get('racketArmLiftScore') or 0.0)
    lift_gate = 0.9 if racket_side == 'unknown' else (0.7 + (elbow_support * 0.3))
    final_lift = _round(original_lift * lift_gate)

    final_metrics['bodyTurnScore'] = final_turn
    final_metrics['racketArmLiftScore'] = final_lift
    final_metrics['compositeScore'] = _round(
        (float(final_metrics.get('stabilityScore') or 0.0) * 0.45)
        + (final_turn * 0.3)
        + (final_lift * 0.25)
    )
    debug_payload['finalAdjustments'] = {
        'bodyTurnDepthEvidence': _round(depth_evidence),
        'bodyTurnCapWithoutDepth': _round(turn_cap_without_depth),
        'bodyTurnOriginal': _round(original_turn),
        'bodyTurnFinal': final_turn,
        'racketSideForLiftGate': racket_side,
        'elbowSupport': _round(elbow_support),
        'racketArmLiftOriginal': _round(original_lift),
        'racketArmLiftGate': _round(lift_gate),
        'racketArmLiftFinal': final_lift,
    }
    specialized_debug = debug_payload.setdefault('specialized', _empty_specialized_debug(racket_side, 'frame_inference'))
    if specialized_debug.get('selectedRacketSide') in {None, 'unknown'} and racket_side in {'left', 'right'}:
        specialized_debug['selectedRacketSide'] = racket_side
        specialized_debug['selectedRacketSideSource'] = 'frame_inference'
    return final_metrics


def _build_rejection_reason_details(
    frame_count: int,
    detected_count: int,
    usable_frame_count: int,
    coverage_ratio: float,
    median_stability_score: float,
    score_variance: float,
    temporal_consistency: float,
    motion_continuity: float,
    too_small_count: int,
    low_stability_count: int,
    unknown_view_count: int,
) -> List[Dict[str, Any]]:
    too_small_threshold = max(3, frame_count // 3)
    low_stability_threshold = max(3, frame_count // 3)
    unknown_view_threshold = max(4, usable_frame_count - 1)
    coverage_triggered = (
        usable_frame_count < MIN_USABLE_FRAME_COUNT
        or coverage_ratio < MIN_COVERAGE_RATIO
        or (
            usable_frame_count >= MIN_USABLE_FRAME_COUNT
            and coverage_ratio >= MIN_COVERAGE_RATIO
            and median_stability_score < USABLE_STABILITY_THRESHOLD
        )
    )
    coverage_explanation = (
        '稳定识别帧数、覆盖率或稳定度中位数未达到正式报告门槛。'
        if coverage_triggered
        else '当前稳定识别帧数、覆盖率和稳定度中位数均满足正式报告门槛。'
    )
    action_evidence_triggered = (
        usable_frame_count >= MIN_USABLE_FRAME_COUNT
        and coverage_ratio >= MIN_COVERAGE_RATIO
        and score_variance > MAX_SCORE_VARIANCE
        and motion_continuity < MOTION_CONTINUITY_REJECTION_THRESHOLD
    )

    return [
        {
            'code': 'body_not_detected',
            'triggered': detected_count == 0,
            'observed': detected_count,
            'threshold': 0,
            'comparator': '==',
            'explanation': '完全没有检测到人体关键点时，系统直接拒绝生成正式报告。',
        },
        {
            'code': 'subject_too_small_or_cropped',
            'triggered': too_small_count >= too_small_threshold,
            'observed': too_small_count,
            'threshold': too_small_threshold,
            'comparator': '>=',
            'explanation': '主体尺寸过小或入镜不完整的帧过多时，系统认为样本不适合正式分析。',
        },
        {
            'code': 'poor_lighting_or_occlusion',
            'triggered': low_stability_count >= low_stability_threshold,
            'observed': low_stability_count,
            'threshold': low_stability_threshold,
            'comparator': '>=',
            'explanation': '低稳定度帧过多通常意味着光照、模糊或遮挡影响了关键点质量。',
        },
        {
            'code': 'insufficient_pose_coverage',
            'triggered': coverage_triggered,
            'observed': {
                'usableFrameCount': usable_frame_count,
                'coverageRatio': coverage_ratio,
                'medianStabilityScore': median_stability_score,
            },
            'threshold': {
                'minUsableFrameCount': MIN_USABLE_FRAME_COUNT,
                'minCoverageRatio': MIN_COVERAGE_RATIO,
                'minMedianStabilityScore': USABLE_STABILITY_THRESHOLD,
            },
            'comparator': '< or < or <',
            'explanation': coverage_explanation,
        },
        {
            'code': 'insufficient_action_evidence',
            'triggered': action_evidence_triggered,
            'observed': {
                'scoreVariance': score_variance,
                'temporalConsistency': temporal_consistency,
                'motionContinuity': motion_continuity,
            },
            'threshold': {
                'maxScoreVariance': MAX_SCORE_VARIANCE,
                'minMotionContinuity': MOTION_CONTINUITY_REJECTION_THRESHOLD,
            },
            'comparator': '> and <',
            'explanation': '稳定帧之间的综合分波动过大且时序连续性不足时，系统会认为动作证据不够稳定。',
        },
        {
            'code': 'invalid_camera_angle',
            'triggered': (
                usable_frame_count >= MIN_USABLE_FRAME_COUNT
                and coverage_ratio >= MIN_COVERAGE_RATIO
                and unknown_view_count >= unknown_view_threshold
            ),
            'observed': unknown_view_count,
            'threshold': unknown_view_threshold,
            'comparator': '>=',
            'explanation': '多数稳定帧仍无法确认视角时，系统会认为机位不利于当前规则判断。',
        },
    ]


def _collect_triggered_rejection_reasons(details: List[Dict[str, Any]]) -> List[str]:
    triggered_codes: List[str] = []
    for detail in details:
        if detail['triggered'] and detail['code'] not in triggered_codes:
            triggered_codes.append(detail['code'])
    return triggered_codes


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
        side = frame.get('dominantRacketSide', 'unknown')
        confidence = float(frame.get('racketSideConfidence', 0.0))
        lift_score = float(((frame.get('finalMetrics') or {}).get('racketArmLiftScore')) or 0.0)
        if side in weighted_scores:
            weighted_scores[side] += max(lift_score, 0.08) + (confidence * 0.2)

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


def _stable_view_profile_sequence(usable_frames: List[Dict[str, Any]]) -> Tuple[List[str], int]:
    stable_profiles: List[str] = []
    previous_profile = 'unknown'
    transition_count = 0

    for frame in usable_frames:
        profile = frame.get('viewProfile', 'unknown')
        confidence = float(frame.get('viewConfidence', 0.0))
        if confidence < MIN_STABLE_VIEW_CONFIDENCE:
            stable_profiles.append('unknown')
            previous_profile = 'unknown'
            continue

        if previous_profile not in {'unknown', profile}:
            transition_count += 1
            stable_profiles.append('unknown')
            previous_profile = 'unknown'
            continue

        stable_profiles.append(profile)
        previous_profile = profile

    if transition_count >= max(MIN_VIEW_TRANSITIONS_FOR_UNKNOWN, len(usable_frames) // 3):
        stable_profiles = ['unknown' if profile != 'unknown' else profile for profile in stable_profiles]

    return stable_profiles, transition_count


def _summarize_specialized_features(usable_frames: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    summary: Dict[str, Dict[str, Any]] = {}

    for feature_name in SPECIALIZED_FEATURE_NAMES:
        observed_entries = []
        for frame in usable_frames:
            feature_values = (frame.get('finalMetrics') or {}).get('specialized') or {}
            feature_value = feature_values.get(feature_name)
            if feature_value is None:
                continue
            observed_entries.append((frame['frameIndex'], float(feature_value)))

        if not observed_entries:
            summary[feature_name] = {
                'median': None,
                'peak': None,
                'observableFrameCount': 0,
                'observableCoverage': 0.0,
                'peakFrameIndex': None,
            }
            continue

        values = [value for _, value in observed_entries]
        peak_frame_index, peak_value = max(observed_entries, key=lambda item: item[1])
        summary[feature_name] = {
            'median': _median(values),
            'peak': _round(peak_value),
            'observableFrameCount': len(observed_entries),
            'observableCoverage': _round(len(observed_entries) / max(len(usable_frames), 1)),
            'peakFrameIndex': peak_frame_index,
        }

    return summary


def _missing_phase_candidate(source_metric: str, missing_reason: str) -> Dict[str, Any]:
    return {
        'anchorFrameIndex': None,
        'windowStartFrameIndex': None,
        'windowEndFrameIndex': None,
        'score': None,
        'sourceMetric': source_metric,
        'detectionStatus': 'missing',
        'missingReason': missing_reason,
    }


def _detected_phase_candidate(
    source_metric: str,
    anchor_frame_index: int,
    *,
    window_start_frame_index: Optional[int] = None,
    window_end_frame_index: Optional[int] = None,
    score: Optional[float] = None,
) -> Dict[str, Any]:
    return {
        'anchorFrameIndex': anchor_frame_index,
        'windowStartFrameIndex': window_start_frame_index if window_start_frame_index is not None else anchor_frame_index,
        'windowEndFrameIndex': window_end_frame_index if window_end_frame_index is not None else anchor_frame_index,
        'score': _round(score) if score is not None else None,
        'sourceMetric': source_metric,
        'detectionStatus': 'detected',
    }


def _frame_specialized_score(frame: Dict[str, Any], feature_name: str) -> Optional[float]:
    feature_values = (frame.get('finalMetrics') or {}).get('specialized') or {}
    feature_value = feature_values.get(feature_name)
    if feature_value is None:
        return None
    return float(feature_value)


def _frame_metric_score(frame: Dict[str, Any], metric_name: str) -> Optional[float]:
    final_metrics = frame.get('finalMetrics') or {}
    metric_value = final_metrics.get(metric_name)
    if metric_value is None:
        return None
    return float(metric_value)


def _best_frame_fallback_candidate(usable_frames: List[Dict[str, Any]], best_frame_index: Optional[int]) -> Optional[Dict[str, Any]]:
    if best_frame_index is None:
        return None

    fallback_frame = next((frame for frame in usable_frames if frame['frameIndex'] == best_frame_index), None)
    fallback_score = _frame_metric_score(fallback_frame, 'compositeScore') if fallback_frame else None
    return _detected_phase_candidate(
        'bestFrameIndex',
        best_frame_index,
        score=fallback_score,
    )


def _build_preparation_candidate(usable_frames: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not usable_frames:
        return _missing_phase_candidate('contactPreparationScore', 'no_usable_frames')

    observed_entries = []
    for position, frame in enumerate(usable_frames):
        score = _frame_specialized_score(frame, 'contactPreparationScore')
        if score is None:
            continue
        observed_entries.append((position, frame, score))

    if not observed_entries:
        return _missing_phase_candidate('contactPreparationScore', 'insufficient_preparation_evidence')

    anchor_position, anchor_frame, peak_score = max(observed_entries, key=lambda item: item[2])
    threshold = max(peak_score * PREPARATION_WINDOW_PEAK_RATIO, PREPARATION_WINDOW_MIN_SCORE)
    left = anchor_position
    right = anchor_position

    while left > 0:
        previous_score = _frame_specialized_score(usable_frames[left - 1], 'contactPreparationScore')
        if previous_score is None or previous_score < threshold:
            break
        left -= 1

    while right < len(usable_frames) - 1:
        next_score = _frame_specialized_score(usable_frames[right + 1], 'contactPreparationScore')
        if next_score is None or next_score < threshold:
            break
        right += 1

    return _detected_phase_candidate(
        'contactPreparationScore',
        anchor_frame['frameIndex'],
        window_start_frame_index=usable_frames[left]['frameIndex'],
        window_end_frame_index=usable_frames[right]['frameIndex'],
        score=peak_score,
    )


def _build_contact_candidate(
    usable_frames: List[Dict[str, Any]],
    preparation_candidate: Dict[str, Any],
    best_frame_index: Optional[int],
) -> Dict[str, Any]:
    if not usable_frames:
        return _missing_phase_candidate('compositeScore', 'no_usable_frames')

    if preparation_candidate.get('detectionStatus') != 'detected' or preparation_candidate.get('anchorFrameIndex') is None:
        return _best_frame_fallback_candidate(usable_frames, best_frame_index) or _missing_phase_candidate('bestFrameIndex', 'contact_not_separable')

    anchor_frame_index = int(preparation_candidate['anchorFrameIndex'])
    candidate_frames = [frame for frame in usable_frames if frame['frameIndex'] >= anchor_frame_index]
    observed_entries = []
    for frame in candidate_frames:
        score = _frame_metric_score(frame, 'compositeScore')
        if score is None:
            continue
        observed_entries.append((frame, score))

    if not observed_entries:
        return _best_frame_fallback_candidate(usable_frames, best_frame_index) or _missing_phase_candidate('bestFrameIndex', 'contact_not_separable')

    anchor_frame, anchor_score = max(observed_entries, key=lambda item: item[1])
    return _detected_phase_candidate(
        'compositeScore',
        anchor_frame['frameIndex'],
        score=anchor_score,
    )


def _build_backswing_candidate(
    usable_frames: List[Dict[str, Any]],
    preparation_candidate: Dict[str, Any],
    contact_candidate: Dict[str, Any],
) -> Dict[str, Any]:
    if not usable_frames:
        return _missing_phase_candidate('hittingArmPreparationScore', 'no_usable_frames')

    preparation_window_start = preparation_candidate.get('windowStartFrameIndex')
    contact_anchor = contact_candidate.get('anchorFrameIndex')

    if preparation_candidate.get('detectionStatus') != 'detected' or preparation_window_start is None:
        return _missing_phase_candidate('hittingArmPreparationScore', 'insufficient_preparation_evidence')

    if contact_candidate.get('detectionStatus') != 'detected' or contact_anchor is None:
        return _missing_phase_candidate('hittingArmPreparationScore', 'contact_not_separable')

    if int(preparation_window_start) > int(contact_anchor):
        return _missing_phase_candidate('hittingArmPreparationScore', 'no_pre_contact_frames')

    candidate_frames = [
        frame for frame in usable_frames
        if int(preparation_window_start) <= frame['frameIndex'] <= int(contact_anchor)
    ]
    observed_entries = []
    for frame in candidate_frames:
        score = _frame_specialized_score(frame, 'hittingArmPreparationScore')
        if score is None:
            continue
        observed_entries.append((frame, score))

    if not observed_entries:
        return _missing_phase_candidate('hittingArmPreparationScore', 'no_pre_contact_frames')

    anchor_frame, anchor_score = max(observed_entries, key=lambda item: item[1])
    return _detected_phase_candidate(
        'hittingArmPreparationScore',
        anchor_frame['frameIndex'],
        window_start_frame_index=int(preparation_window_start),
        window_end_frame_index=int(contact_anchor),
        score=anchor_score,
    )


def _post_contact_motion_score(previous_frame: Dict[str, Any], current_frame: Dict[str, Any]) -> Optional[float]:
    deltas = []
    for metric_name in ['compositeScore', 'bodyTurnScore', 'racketArmLiftScore']:
        previous_value = _frame_metric_score(previous_frame, metric_name)
        current_value = _frame_metric_score(current_frame, metric_name)
        if previous_value is None or current_value is None:
            continue
        deltas.append(abs(current_value - previous_value))

    if not deltas:
        return None

    return _round(sum(deltas))


def _build_follow_through_candidate(usable_frames: List[Dict[str, Any]], contact_candidate: Dict[str, Any]) -> Dict[str, Any]:
    if not usable_frames:
        return _missing_phase_candidate('postContactMotionScore', 'no_usable_frames')

    contact_anchor = contact_candidate.get('anchorFrameIndex')
    if contact_candidate.get('detectionStatus') != 'detected' or contact_anchor is None:
        return _missing_phase_candidate('postContactMotionScore', 'contact_not_separable')

    post_contact_frames = [frame for frame in usable_frames if frame['frameIndex'] > int(contact_anchor)]
    if not post_contact_frames:
        return _missing_phase_candidate('postContactMotionScore', 'no_post_contact_frames')

    observed_entries = []
    previous_frame: Optional[Dict[str, Any]] = None
    for frame in usable_frames:
        if previous_frame is None:
            previous_frame = frame
            continue
        if frame['frameIndex'] <= int(contact_anchor):
            previous_frame = frame
            continue

        score = _post_contact_motion_score(previous_frame, frame)
        if score is not None:
            observed_entries.append((frame, score))
        previous_frame = frame

    if not observed_entries:
        return _missing_phase_candidate('postContactMotionScore', 'contact_not_separable')

    anchor_frame, anchor_score = max(observed_entries, key=lambda item: item[1])
    return _detected_phase_candidate(
        'postContactMotionScore',
        anchor_frame['frameIndex'],
        window_start_frame_index=post_contact_frames[0]['frameIndex'],
        window_end_frame_index=post_contact_frames[-1]['frameIndex'],
        score=anchor_score,
    )


def _build_phase_candidates(usable_frames: List[Dict[str, Any]], best_frame_index: Optional[int]) -> Dict[str, Dict[str, Any]]:
    preparation_candidate = _build_preparation_candidate(usable_frames)
    contact_candidate = _build_contact_candidate(usable_frames, preparation_candidate, best_frame_index)
    backswing_candidate = _build_backswing_candidate(usable_frames, preparation_candidate, contact_candidate)
    follow_through_candidate = _build_follow_through_candidate(usable_frames, contact_candidate)
    return {
        'preparation': preparation_candidate,
        'backswing': backswing_candidate,
        'contactCandidate': contact_candidate,
        'followThrough': follow_through_candidate,
    }


def _build_overall_summary(frames: List[Dict[str, Any]], detected_count: int) -> Dict[str, Any]:
    detected_frames = [frame for frame in frames if frame['status'] in {'detected', 'usable'} and frame.get('finalMetrics')]
    if not detected_frames:
        rejection_reason_details = _build_rejection_reason_details(
            frame_count=len(frames),
            detected_count=detected_count,
            usable_frame_count=0,
            coverage_ratio=0.0,
            median_stability_score=0.0,
            score_variance=0.0,
            temporal_consistency=0.0,
            motion_continuity=0.0,
            too_small_count=0,
            low_stability_count=0,
            unknown_view_count=0,
        )
        return {
            'bestFrameIndex': None,
            'bestPreparationFrameIndex': None,
            'phaseCandidates': _build_phase_candidates([], None),
            'usableFrameCount': 0,
            'coverageRatio': 0.0,
            'medianStabilityScore': 0.0,
            'medianBodyTurnScore': 0.0,
            'medianRacketArmLiftScore': 0.0,
            'scoreVariance': 0.0,
            'rawScoreVariance': 0.0,
            'temporalConsistency': 0.0,
            'motionContinuity': 0.0,
            'metricSource': 'finalMetrics',
            'rejectionReasons': ['body_not_detected'],
            'rejectionReasonDetails': rejection_reason_details,
            'humanSummary': '当前样本还没有稳定识别到人体关键点。',
            'viewProfile': 'unknown',
            'viewConfidence': 0.0,
            'viewStability': 0.0,
            'dominantRacketSide': 'unknown',
            'racketSideConfidence': 0.0,
            'specializedFeatureSummary': _summarize_specialized_features([]),
            'bestFrameOverlayRelativePath': None,
            'overlayFrameCount': 0,
            'debugCounts': {
                'tooSmallCount': 0,
                'lowStabilityCount': 0,
                'unknownViewCount': 0,
                'usableFrameCount': 0,
                'detectedFrameCount': detected_count,
                'viewTransitionCount': 0,
                'largeMotionJumpCount': 0,
            },
        }

    usable_frames = [frame for frame in detected_frames if frame['status'] == 'usable']
    usable_frame_count = len(usable_frames)
    coverage_ratio = _round(usable_frame_count / len(frames)) if frames else 0.0
    median_stability_score = _median([frame['finalMetrics']['stabilityScore'] for frame in usable_frames])
    median_body_turn_score = _median([frame['finalMetrics']['bodyTurnScore'] for frame in usable_frames])
    median_racket_arm_lift_score = _median([frame['finalMetrics']['racketArmLiftScore'] for frame in usable_frames])
    raw_score_variance = _variance([frame['rawMetrics']['compositeScore'] for frame in usable_frames if frame.get('rawMetrics')])
    composite_scores = [frame['finalMetrics']['compositeScore'] for frame in usable_frames]
    score_variance = _variance(composite_scores)
    temporal_consistency = _round(_clamp(1 - (score_variance / MAX_SCORE_VARIANCE)))
    mean_abs_delta = _mean_abs_delta(composite_scores)
    motion_continuity = _round(_clamp(1 - (mean_abs_delta / MOTION_CONTINUITY_SCALE)))
    large_motion_jump_count = sum(
        1 for previous, current in zip(composite_scores, composite_scores[1:])
        if abs(current - previous) > LARGE_MOTION_JUMP_THRESHOLD
    )

    too_small_count = sum(1 for frame in detected_frames if (frame['finalMetrics']['subjectScale'] or 0.0) < SUBJECT_SCALE_THRESHOLD)
    low_stability_count = sum(1 for frame in detected_frames if (frame['finalMetrics']['stabilityScore'] or 0.0) < LOW_STABILITY_THRESHOLD)
    stable_profiles, view_transition_count = _stable_view_profile_sequence(usable_frames)
    view_profile, view_stability = _summarize_view_profile(stable_profiles)
    view_confidences = [
        float(frame.get('viewConfidence', 0.0))
        for frame, stable_profile in zip(usable_frames, stable_profiles)
        if stable_profile == view_profile
    ]
    view_confidence = _median(view_confidences) if view_confidences else 0.0
    dominant_racket_side, racket_side_confidence = _summarize_racket_side(usable_frames or detected_frames)
    unknown_view_count = sum(1 for profile in stable_profiles if profile == 'unknown')
    specialized_feature_summary = _summarize_specialized_features(usable_frames)
    rejection_reason_details = _build_rejection_reason_details(
        frame_count=len(frames),
        detected_count=detected_count,
        usable_frame_count=usable_frame_count,
        coverage_ratio=coverage_ratio,
        median_stability_score=median_stability_score,
        score_variance=score_variance,
        temporal_consistency=temporal_consistency,
        motion_continuity=motion_continuity,
        too_small_count=too_small_count,
        low_stability_count=low_stability_count,
        unknown_view_count=unknown_view_count,
    )
    rejection_reasons = _collect_triggered_rejection_reasons(rejection_reason_details)

    best_frame_candidates = usable_frames or detected_frames
    best_frame = max(best_frame_candidates, key=lambda frame: frame['finalMetrics']['compositeScore'])
    phase_candidates = _build_phase_candidates(usable_frames, best_frame['frameIndex'] if best_frame else None)
    best_preparation_frame_index = phase_candidates['preparation']['anchorFrameIndex']
    overlay_frame_count = sum(1 for frame in frames if frame.get('overlayRelativePath'))

    return {
        'bestFrameIndex': best_frame['frameIndex'],
        'bestPreparationFrameIndex': best_preparation_frame_index,
        'phaseCandidates': phase_candidates,
        'usableFrameCount': usable_frame_count,
        'coverageRatio': coverage_ratio,
        'medianStabilityScore': median_stability_score,
        'medianBodyTurnScore': median_body_turn_score,
        'medianRacketArmLiftScore': median_racket_arm_lift_score,
        'scoreVariance': score_variance,
        'rawScoreVariance': raw_score_variance,
        'temporalConsistency': temporal_consistency,
        'motionContinuity': motion_continuity,
        'metricSource': 'finalMetrics',
        'rejectionReasons': rejection_reasons,
        'rejectionReasonDetails': rejection_reason_details,
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
        'specializedFeatureSummary': specialized_feature_summary,
        'bestFrameOverlayRelativePath': best_frame.get('overlayRelativePath'),
        'overlayFrameCount': overlay_frame_count,
        'debugCounts': {
            'tooSmallCount': too_small_count,
            'lowStabilityCount': low_stability_count,
            'unknownViewCount': unknown_view_count,
            'usableFrameCount': usable_frame_count,
            'detectedFrameCount': detected_count,
            'viewTransitionCount': view_transition_count,
            'largeMotionJumpCount': large_motion_jump_count,
        },
    }


def _load_model_lock_info(lock_path: Path) -> Dict[str, Any]:
    if not lock_path.exists():
        raise FileNotFoundError(f'pose model lock file not found: {lock_path}')

    lock_data = json.loads(lock_path.read_text(encoding='utf-8'))
    required_keys = {'version', 'fileName', 'url', 'sha256'}
    missing_keys = required_keys - set(lock_data.keys())
    if missing_keys:
        raise ValueError(f'pose model lock file is missing keys: {sorted(missing_keys)}')
    return lock_data


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        while True:
            chunk = handle.read(65536)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _verify_model_sha(path: Path, expected_sha: str) -> str:
    actual_sha = _file_sha256(path)
    if actual_sha != expected_sha:
        raise ValueError(f'pose landmarker checksum mismatch for {path}: expected {expected_sha}, got {actual_sha}')
    return actual_sha


def _model_lock_path() -> Path:
    return Path(__file__).resolve().parent.parent / 'models' / 'pose_landmarker_lite.lock.json'


def _default_model_cache_dir() -> Path:
    return Path(__file__).resolve().parent.parent / 'models'


def _ensure_pose_landmarker_model() -> Tuple[Path, Dict[str, Any]]:
    explicit_model_path = os.getenv('POSE_LANDMARKER_MODEL_PATH')
    if explicit_model_path:
        model_path = Path(explicit_model_path).expanduser().resolve()
        if not model_path.exists():
            raise FileNotFoundError(f'POSE_LANDMARKER_MODEL_PATH does not exist: {model_path}')
        return model_path, {
            'source': 'explicit_path',
            'path': str(model_path),
            'version': 'external',
            'sha256': _file_sha256(model_path),
        }

    lock_info = _load_model_lock_info(_model_lock_path())
    model_dir = Path(os.getenv('POSE_LANDMARKER_MODEL_CACHE_DIR', str(_default_model_cache_dir()))).expanduser().resolve()
    model_dir.mkdir(parents=True, exist_ok=True)
    model_path = model_dir / str(lock_info['fileName'])

    if model_path.exists():
        actual_sha = _verify_model_sha(model_path, str(lock_info['sha256']))
        return model_path, {
            'source': 'cache',
            'path': str(model_path),
            'version': str(lock_info['version']),
            'sha256': actual_sha,
            'url': str(lock_info['url']),
        }

    urlretrieve(str(lock_info['url']), model_path)
    actual_sha = _verify_model_sha(model_path, str(lock_info['sha256']))
    return model_path, {
        'source': 'download',
        'path': str(model_path),
        'version': str(lock_info['version']),
        'sha256': actual_sha,
        'url': str(lock_info['url']),
    }


def _frame_status_details(metrics: Optional[Dict[str, Any]]) -> Tuple[str, List[str]]:
    if not metrics:
        return 'not_detected', ['keypoints_not_detected']

    reasons: List[str] = []
    if (metrics['subjectScale'] or 0.0) < SUBJECT_SCALE_THRESHOLD:
        reasons.append('subject_scale_below_threshold')
    if (metrics['stabilityScore'] or 0.0) < USABLE_STABILITY_THRESHOLD:
        reasons.append('stability_below_threshold')
    if reasons:
        return 'detected', reasons
    return 'usable', ['all_thresholds_passed']


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
    if cv2 is None:  # pragma: no cover - depends on optional runtime dependency
        raise ModuleNotFoundError('opencv-python is required to render overlays')

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


def _ema_smooth_keypoint_sequence(sequence: List[List[Dict[str, Any]]]) -> List[List[Dict[str, Any]]]:
    smoothed_sequence: List[List[Dict[str, Any]]] = []
    previous_state: Optional[Dict[str, Dict[str, Any]]] = None

    for keypoints in sequence:
        if not keypoints:
            smoothed_sequence.append([])
            previous_state = None
            continue

        current_names = {point['name'] for point in keypoints}
        if previous_state is not None and current_names != set(previous_state.keys()):
            previous_state = None

        smoothed_keypoints: List[Dict[str, Any]] = []
        current_state: Dict[str, Dict[str, Any]] = {}
        for point in keypoints:
            previous_point = previous_state.get(point['name']) if previous_state else None
            if previous_point is None:
                smoothed_point = dict(point)
            else:
                smoothed_point = {
                    'name': point['name'],
                    'x': _round((float(point['x']) * EMA_COORDINATE_ALPHA) + (float(previous_point['x']) * (1 - EMA_COORDINATE_ALPHA))),
                    'y': _round((float(point['y']) * EMA_COORDINATE_ALPHA) + (float(previous_point['y']) * (1 - EMA_COORDINATE_ALPHA))),
                    'z': _round((float(point['z']) * EMA_COORDINATE_ALPHA) + (float(previous_point['z']) * (1 - EMA_COORDINATE_ALPHA))),
                    'visibility': _round((float(point['visibility']) * EMA_VISIBILITY_ALPHA) + (float(previous_point['visibility']) * (1 - EMA_VISIBILITY_ALPHA))),
                }
            smoothed_keypoints.append(smoothed_point)
            current_state[point['name']] = smoothed_point

        smoothed_sequence.append(smoothed_keypoints)
        previous_state = current_state

    return smoothed_sequence


def _build_frame_payload(
    task_dir: Path,
    frame_path: Path,
    index: int,
    image: Any,
    keypoints: List[Dict[str, Any]],
    smoothed_keypoints: List[Dict[str, Any]],
) -> Dict[str, Any]:
    raw_metrics = _compute_frame_metrics(keypoints) if keypoints else None
    smoothed_metrics = _compute_frame_metrics(smoothed_keypoints) if smoothed_keypoints else None
    final_metrics = _build_final_metrics(smoothed_metrics, smoothed_keypoints) if smoothed_metrics else None
    status, status_reasons = _frame_status_details(final_metrics) if final_metrics else ('not_detected', ['keypoints_not_detected'])

    raw_points = _get_point_map(keypoints)
    smoothed_points = _get_point_map(smoothed_keypoints)
    raw_view_profile, raw_view_confidence = _infer_frame_view_profile(raw_points) if keypoints else ('unknown', 0.0)
    frame_view_profile, view_confidence = _infer_frame_view_profile(smoothed_points) if smoothed_keypoints else ('unknown', 0.0)
    raw_racket_side, raw_racket_side_confidence, _, _ = _infer_frame_racket_side(raw_points) if keypoints else ('unknown', 0.0, 0.0, 0.0)
    frame_racket_side, racket_side_confidence, _, _ = _infer_frame_racket_side(smoothed_points) if smoothed_keypoints else ('unknown', 0.0, 0.0, 0.0)
    overlay_relative_path = None

    for metrics_payload in [raw_metrics, smoothed_metrics, final_metrics]:
        if metrics_payload:
            metrics_payload.setdefault('debug', {})
            metrics_payload['debug']['statusReasons'] = status_reasons

    if final_metrics:
        final_metrics['debug']['frameInference'] = {
            'viewProfile': frame_view_profile,
            'viewConfidence': view_confidence,
            'dominantRacketSide': frame_racket_side,
            'racketSideConfidence': racket_side_confidence,
        }
        final_metrics['debug']['rawFrameInference'] = {
            'viewProfile': raw_view_profile,
            'viewConfidence': raw_view_confidence,
            'dominantRacketSide': raw_racket_side,
            'racketSideConfidence': raw_racket_side_confidence,
        }

    overlay_keypoints = smoothed_keypoints or keypoints
    if image is not None and overlay_keypoints:
        overlay_path, overlay_relative_path = _overlay_output_paths(task_dir, frame_path.name)
        overlay_image = _draw_overlay(image, overlay_keypoints, [
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
        'smoothedKeypoints': smoothed_keypoints,
        'rawMetrics': raw_metrics,
        'smoothedMetrics': smoothed_metrics,
        'finalMetrics': final_metrics,
        'metrics': final_metrics,
        'overlayRelativePath': overlay_relative_path,
        'viewProfile': frame_view_profile,
        'viewConfidence': view_confidence,
        'dominantRacketSide': frame_racket_side,
        'racketSideConfidence': racket_side_confidence,
    }


def _read_frame_image(frame_path: Path) -> Any:
    if cv2 is None:  # pragma: no cover - depends on optional runtime dependency
        raise ModuleNotFoundError('opencv-python is required to load pose frames')
    return cv2.imread(str(frame_path))


def _frame_timestamp_ms(frame_path: Path, index: int, task_dir: Path, cached_timestamps: Optional[Dict[str, int]] = None) -> int:
    timestamps = cached_timestamps if cached_timestamps is not None else load_frame_timestamps_ms(str(task_dir))
    return int(timestamps.get(frame_path.name, index * 1000))


def _build_pose_result(
    task_dir: Path,
    samples: List[Dict[str, Any]],
    *,
    engine: str,
    diagnostics: Dict[str, Any],
) -> Dict[str, Any]:
    smoothed_sequences = _ema_smooth_keypoint_sequence([sample['keypoints'] for sample in samples])
    frames = []
    detected_count = 0

    for sample, smoothed_keypoints in zip(samples, smoothed_sequences):
        if sample['keypoints']:
            detected_count += 1

        if sample['image'] is None:
            frames.append({
                'frameIndex': sample['index'],
                'fileName': sample['framePath'].name,
                'status': 'read_failed',
                'keypoints': [],
                'smoothedKeypoints': [],
                'rawMetrics': None,
                'smoothedMetrics': None,
                'finalMetrics': None,
                'metrics': None,
                'overlayRelativePath': None,
                'viewProfile': 'unknown',
                'viewConfidence': 0.0,
                'dominantRacketSide': 'unknown',
                'racketSideConfidence': 0.0,
            })
            continue

        frames.append(_build_frame_payload(
            task_dir,
            sample['framePath'],
            sample['index'],
            sample['image'],
            sample['keypoints'],
            smoothed_keypoints,
        ))

    return {
        'engine': engine,
        'frameCount': len(samples),
        'detectedFrameCount': detected_count,
        'summary': _build_overall_summary(frames, detected_count),
        'frames': frames,
        'diagnostics': diagnostics,
    }


def _estimate_with_legacy_solutions(frame_paths: List[Path], task_dir: Optional[Path] = None, fallback_reason: Optional[str] = None) -> Dict[str, Any]:
    if mp is None or not hasattr(mp, 'solutions'):  # pragma: no cover - depends on optional runtime dependency
        raise ModuleNotFoundError('mediapipe.solutions is required for legacy pose estimation')

    task_dir = (task_dir or (frame_paths[0].resolve().parent if frame_paths else Path.cwd())).resolve()
    samples = []

    with mp.solutions.pose.Pose(
        static_image_mode=True,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=0.5,
    ) as pose:
        for index, frame_path in enumerate(frame_paths, start=1):
            image = _read_frame_image(frame_path)
            if image is None:
                samples.append({'index': index, 'framePath': frame_path, 'image': None, 'keypoints': []})
                continue

            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = pose.process(rgb)
            samples.append({
                'index': index,
                'framePath': frame_path,
                'image': image,
                'keypoints': _extract_keypoints_from_legacy(results),
            })

    return _build_pose_result(
        task_dir,
        samples,
        engine='mediapipe-pose',
        diagnostics={
            'runningMode': 'LEGACY',
            'fallbackApplied': fallback_reason is not None,
            'fallbackReason': fallback_reason,
            'model': None,
        },
    )


def _estimate_with_tasks_mode(
    frame_paths: List[Path],
    task_dir: Path,
    *,
    running_mode_name: str,
    model_path: Path,
    model_info: Dict[str, Any],
) -> Dict[str, Any]:
    if mp is None:  # pragma: no cover - depends on optional runtime dependency
        raise ModuleNotFoundError('mediapipe is required for MediaPipe Tasks pose estimation')

    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    running_mode = getattr(vision.RunningMode, running_mode_name)
    options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=running_mode,
        num_poses=1,
    )
    timestamps_ms = load_frame_timestamps_ms(str(task_dir))
    samples = []

    try:
        detector = vision.PoseLandmarker.create_from_options(options)
    except Exception as error:  # pragma: no cover - depends on runtime Tasks availability
        raise TasksModeError(f'failed to initialize {running_mode_name} landmarker: {error}') from error

    with detector:
        for index, frame_path in enumerate(frame_paths, start=1):
            image = _read_frame_image(frame_path)
            if image is None:
                samples.append({'index': index, 'framePath': frame_path, 'image': None, 'keypoints': []})
                continue

            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            try:
                if running_mode_name == 'VIDEO':
                    timestamp_ms = _frame_timestamp_ms(frame_path, index, task_dir, timestamps_ms)
                    result = detector.detect_for_video(mp_image, timestamp_ms)
                else:
                    result = detector.detect(mp_image)
            except Exception as error:  # pragma: no cover - depends on runtime Tasks availability
                raise TasksModeError(f'{running_mode_name} detection failed on {frame_path.name}: {error}') from error

            samples.append({
                'index': index,
                'framePath': frame_path,
                'image': image,
                'keypoints': _extract_keypoints_from_tasks(result),
            })

    return _build_pose_result(
        task_dir,
        samples,
        engine='mediapipe-tasks-pose-landmarker',
        diagnostics={
            'runningMode': running_mode_name,
            'fallbackApplied': False,
            'fallbackReason': None,
            'model': model_info,
        },
    )


def _estimate_with_tasks_api(frame_paths: List[Path], task_dir: Optional[Path] = None) -> Dict[str, Any]:
    if mp is None:  # pragma: no cover - depends on optional runtime dependency
        raise ModuleNotFoundError('mediapipe is required for MediaPipe Tasks pose estimation')

    task_dir = (task_dir or (frame_paths[0].resolve().parent if frame_paths else Path.cwd())).resolve()
    model_path, model_info = _ensure_pose_landmarker_model()

    try:
        return _estimate_with_tasks_mode(
            frame_paths,
            task_dir,
            running_mode_name='VIDEO',
            model_path=model_path,
            model_info=model_info,
        )
    except TasksModeError as video_error:
        image_result = _estimate_with_tasks_mode(
            frame_paths,
            task_dir,
            running_mode_name='IMAGE',
            model_path=model_path,
            model_info=model_info,
        )
        diagnostics = image_result.get('diagnostics', {})
        diagnostics['fallbackApplied'] = True
        diagnostics['fallbackReason'] = str(video_error)
        image_result['diagnostics'] = diagnostics
        return image_result


def estimate_pose_for_frames(frame_paths: List[Path], task_dir: Optional[Path] = None) -> Dict[str, Any]:
    task_dir = (task_dir or (frame_paths[0].resolve().parent if frame_paths else Path.cwd())).resolve()

    if mp is not None:
        try:
            from mediapipe.tasks import python as _  # noqa: F401
            return _estimate_with_tasks_api(frame_paths, task_dir=task_dir)
        except (ModuleNotFoundError, ImportError):
            pass
        except Exception as tasks_error:
            if mp is not None and hasattr(mp, 'solutions'):
                return _estimate_with_legacy_solutions(frame_paths, task_dir=task_dir, fallback_reason=str(tasks_error))
            raise

    if mp is not None and hasattr(mp, 'solutions'):
        return _estimate_with_legacy_solutions(frame_paths, task_dir=task_dir)

    raise ModuleNotFoundError('mediapipe is required to estimate pose for frames')
