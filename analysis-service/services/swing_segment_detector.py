from __future__ import annotations

from pathlib import Path
from statistics import median
from typing import Any, Dict, List, Optional, Sequence

try:  # pragma: no cover - import availability depends on local runtime
    import cv2
except ModuleNotFoundError:  # pragma: no cover - import availability depends on local runtime
    cv2 = None


SCAN_VERSION = "coarse_motion_scan_v1"
TARGET_SCAN_FPS = 12.0
TARGET_SCAN_WIDTH = 192
SMOOTHING_RADIUS = 1
MIN_SEGMENT_MS = 320
MAX_SEGMENT_MS = 2200
IDEAL_SEGMENT_MS = 1100
SEGMENT_PADDING_MS = 180
MAX_MERGE_GAP_MS = 220
MIN_PEAK_SCORE = 0.02


def _round_unit(value: float) -> float:
    return round(max(0.0, min(1.0, float(value))), 4)


def _median(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return float(median(values))


def _percentile(values: Sequence[float], percentile: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(float(value) for value in values)
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = max(0.0, min(1.0, percentile)) * (len(sorted_values) - 1)
    lower = int(rank)
    upper = min(lower + 1, len(sorted_values) - 1)
    fraction = rank - lower
    return sorted_values[lower] * (1 - fraction) + sorted_values[upper] * fraction


def _moving_average(values: Sequence[float], radius: int) -> List[float]:
    if not values:
        return []
    smoothed: List[float] = []
    for index in range(len(values)):
        start = max(0, index - radius)
        end = min(len(values), index + radius + 1)
        window = values[start:end]
        smoothed.append(sum(window) / len(window))
    return smoothed


def _detect_subject_small(motion_boxes: Sequence[Optional[float]]) -> bool:
    visible = [value for value in motion_boxes if value is not None]
    if not visible:
        return False
    return _median(visible) < 0.035


def _detect_occlusion_risk(motion_boxes: Sequence[Optional[float]], motion_scores: Sequence[float]) -> bool:
    visible = [value for value in motion_boxes if value is not None]
    if not visible:
        return False
    compact = _percentile(visible, 0.5) < 0.02
    bursty = len(motion_scores) >= 4 and _percentile(motion_scores, 0.9) > max(_percentile(motion_scores, 0.5) * 3.2, 0.06)
    return compact and bursty


def _duration_fitness(duration_ms: int) -> float:
    deviation = abs(duration_ms - IDEAL_SEGMENT_MS)
    return _round_unit(1.0 - (deviation / max(IDEAL_SEGMENT_MS, 1)))


def _segment_penalty(flags: Sequence[str]) -> float:
    penalties = {
        "motion_too_weak": 0.12,
        "too_short": 0.1,
        "too_long": 0.08,
        "edge_clipped_start": 0.06,
        "edge_clipped_end": 0.06,
        "subject_maybe_small": 0.06,
        "motion_maybe_occluded": 0.08,
    }
    return sum(penalties.get(flag, 0.0) for flag in flags)


def _build_segment(
    start_index: int,
    end_index: int,
    smoothed_scores: Sequence[float],
    timestamps_ms: Sequence[int],
    motion_boxes: Sequence[Optional[float]],
    *,
    segment_number: int,
    threshold: float,
) -> Dict[str, Any]:
    start_time_ms = int(max(0, timestamps_ms[start_index] - SEGMENT_PADDING_MS))
    end_time_ms = int(timestamps_ms[end_index] + SEGMENT_PADDING_MS)
    duration_ms = max(1, end_time_ms - start_time_ms)
    window_scores = [float(value) for value in smoothed_scores[start_index:end_index + 1]]
    peak_score = max(window_scores) if window_scores else 0.0
    mean_score = sum(window_scores) / len(window_scores) if window_scores else 0.0
    box_values = [value for value in motion_boxes[start_index:end_index + 1] if value is not None]
    flags: List[str] = []

    if peak_score < max(threshold * 1.05, MIN_PEAK_SCORE * 1.15):
        flags.append("motion_too_weak")
    if duration_ms < MIN_SEGMENT_MS:
        flags.append("too_short")
    if duration_ms > MAX_SEGMENT_MS:
        flags.append("too_long")
    if start_index == 0:
        flags.append("edge_clipped_start")
    if end_index == len(smoothed_scores) - 1:
        flags.append("edge_clipped_end")
    if box_values and _median(box_values) < 0.035:
        flags.append("subject_maybe_small")
    if box_values and _percentile(box_values, 0.5) < 0.02 and peak_score > max(mean_score * 1.8, 0.05):
        flags.append("motion_maybe_occluded")

    motion_component = _round_unit(peak_score / max(threshold * 1.6, 0.04))
    density_component = _round_unit(mean_score / max(peak_score, 1e-6))
    duration_component = _duration_fitness(duration_ms)
    quality_bonus = 0.08 if not flags else 0.0
    ranking_score = _round_unit(
        motion_component * 0.45
        + density_component * 0.25
        + duration_component * 0.22
        + quality_bonus
        - _segment_penalty(flags)
    )
    confidence = _round_unit(
        motion_component * 0.55
        + density_component * 0.2
        + duration_component * 0.15
        + (0.1 if "motion_too_weak" not in flags else 0.0)
        - min(0.25, _segment_penalty(flags))
    )

    return {
        "segmentId": f"segment-{segment_number:02d}",
        "startTimeMs": start_time_ms,
        "endTimeMs": end_time_ms,
        "startFrame": start_index + 1,
        "endFrame": end_index + 1,
        "durationMs": duration_ms,
        "motionScore": round(peak_score, 4),
        "confidence": confidence,
        "rankingScore": ranking_score,
        "coarseQualityFlags": flags,
        "detectionSource": SCAN_VERSION,
    }


def _pick_recommended_segment(segments: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not segments:
        return None
    return sorted(
        segments,
        key=lambda segment: (
            float(segment.get("rankingScore", 0.0)),
            -len(segment.get("coarseQualityFlags", [])),
            int(segment.get("endTimeMs", 0)),
            int(segment.get("durationMs", 0)),
        ),
        reverse=True,
    )[0]


def _build_full_video_fallback(duration_ms: int) -> Dict[str, Any]:
    return {
        "segmentId": "segment-01",
        "startTimeMs": 0,
        "endTimeMs": max(duration_ms, 1),
        "startFrame": 1,
        "endFrame": 1,
        "durationMs": max(duration_ms, 1),
        "motionScore": 0.0,
        "confidence": 0.2,
        "rankingScore": 0.2,
        "coarseQualityFlags": ["motion_too_weak"],
        "detectionSource": SCAN_VERSION,
    }


def detect_swing_segments_from_motion_series(
    motion_scores: Sequence[float],
    *,
    timestamps_ms: Optional[Sequence[int]] = None,
    motion_boxes: Optional[Sequence[Optional[float]]] = None,
    duration_ms: Optional[int] = None,
) -> Dict[str, Any]:
    scores = [max(0.0, float(value)) for value in motion_scores]
    if not scores:
        fallback_duration = max(int(duration_ms or 1000), 1)
        fallback_segment = _build_full_video_fallback(fallback_duration)
        return {
            "segmentDetectionVersion": SCAN_VERSION,
            "segmentSelectionMode": "full_video_fallback",
            "recommendedSegmentId": fallback_segment["segmentId"],
            "swingSegments": [fallback_segment],
        }

    times = [int(value) for value in (timestamps_ms or [int(round(index * (1000 / TARGET_SCAN_FPS))) for index in range(len(scores))])]
    if len(times) != len(scores):
        raise ValueError("timestamps_ms must have the same length as motion_scores")
    boxes = list(motion_boxes or [None] * len(scores))
    if len(boxes) != len(scores):
        raise ValueError("motion_boxes must have the same length as motion_scores")

    smoothed_scores = _moving_average(scores, SMOOTHING_RADIUS)
    median_score = _median(smoothed_scores)
    mad = _median([abs(value - median_score) for value in smoothed_scores])
    percentile_65 = _percentile(smoothed_scores, 0.65)
    threshold = max(percentile_65, median_score + (mad * 1.3), MIN_PEAK_SCORE)
    min_gap_ms = MAX_MERGE_GAP_MS

    active_indices = [index for index, value in enumerate(smoothed_scores) if value >= threshold]
    windows: List[List[int]] = []
    if active_indices:
        current = [active_indices[0], active_indices[0]]
        for index in active_indices[1:]:
            gap_ms = times[index] - times[current[1]]
            if gap_ms <= min_gap_ms:
                current[1] = index
            else:
                windows.append(current)
                current = [index, index]
        windows.append(current)

    segments = [
        _build_segment(start, end, smoothed_scores, times, boxes, segment_number=segment_number + 1, threshold=threshold)
        for segment_number, (start, end) in enumerate(windows)
    ]
    segments = [
        segment for segment in segments
        if not (
            segment["durationMs"] < MIN_SEGMENT_MS * 0.75
            and segment["motionScore"] < max(MIN_PEAK_SCORE * 1.4, threshold * 1.05)
        )
    ]

    if not segments:
        peak_index = max(range(len(smoothed_scores)), key=lambda index: smoothed_scores[index])
        if smoothed_scores[peak_index] >= MIN_PEAK_SCORE:
            frame_interval_ms = max(1, int(round(_median([
                current - previous for previous, current in zip(times, times[1:])
            ]) or (1000 / TARGET_SCAN_FPS))))
            side_frames = max(2, int(round(700 / frame_interval_ms)))
            fallback = _build_segment(
                max(0, peak_index - side_frames),
                min(len(smoothed_scores) - 1, peak_index + side_frames),
                smoothed_scores,
                times,
                boxes,
                segment_number=1,
                threshold=max(threshold * 0.8, MIN_PEAK_SCORE),
            )
            segments = [fallback]

    recommended = _pick_recommended_segment(segments)
    if recommended is None:
        fallback_duration = max(int(duration_ms or times[-1] if times else 1000), 1)
        fallback_segment = _build_full_video_fallback(fallback_duration)
        return {
            "segmentDetectionVersion": SCAN_VERSION,
            "segmentSelectionMode": "full_video_fallback",
            "recommendedSegmentId": fallback_segment["segmentId"],
            "swingSegments": [fallback_segment],
        }

    return {
        "segmentDetectionVersion": SCAN_VERSION,
        "segmentSelectionMode": "auto_recommended",
        "recommendedSegmentId": recommended["segmentId"],
        "swingSegments": segments,
        "debug": {
            "threshold": round(threshold, 6),
            "medianMotionScore": round(median_score, 6),
            "mad": round(mad, 6),
            "subjectMaybeSmall": _detect_subject_small(boxes),
            "motionMaybeOccluded": _detect_occlusion_risk(boxes, smoothed_scores),
        },
    }


def detect_swing_segments_for_video(video_path: str) -> Dict[str, Any]:
    target = Path(video_path)
    if cv2 is None or not target.exists():
        fallback_duration = 1000
        fallback_segment = _build_full_video_fallback(fallback_duration)
        return {
            "segmentDetectionVersion": SCAN_VERSION,
            "segmentSelectionMode": "full_video_fallback",
            "recommendedSegmentId": fallback_segment["segmentId"],
            "swingSegments": [fallback_segment],
        }

    capture = cv2.VideoCapture(str(target))
    if not capture.isOpened():
        fallback_segment = _build_full_video_fallback(1000)
        return {
            "segmentDetectionVersion": SCAN_VERSION,
            "segmentSelectionMode": "full_video_fallback",
            "recommendedSegmentId": fallback_segment["segmentId"],
            "swingSegments": [fallback_segment],
        }

    native_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
    frame_step = max(1, int(round(native_fps / TARGET_SCAN_FPS))) if native_fps > 0 else 2
    motion_scores: List[float] = []
    timestamps_ms: List[int] = []
    motion_boxes: List[Optional[float]] = []
    frame_index = 0
    previous_gray = None
    duration_ms = 0

    try:
        while True:
            success, frame = capture.read()
            if not success:
                break

            timestamp_ms = int(capture.get(cv2.CAP_PROP_POS_MSEC) or 0)
            duration_ms = max(duration_ms, timestamp_ms)
            if frame_index % frame_step != 0:
                frame_index += 1
                continue

            height, width = frame.shape[:2]
            scaled_height = max(1, int(round(height * (TARGET_SCAN_WIDTH / max(width, 1)))))
            resized = cv2.resize(frame, (TARGET_SCAN_WIDTH, scaled_height))
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

            if previous_gray is None:
                motion_scores.append(0.0)
                motion_boxes.append(None)
            else:
                diff = cv2.absdiff(gray, previous_gray)
                motion_scores.append(float(diff.mean()) / 255.0)
                _, binary = cv2.threshold(diff, 20, 255, cv2.THRESH_BINARY)
                active_pixels = int(cv2.countNonZero(binary))
                motion_boxes.append(active_pixels / float(binary.shape[0] * binary.shape[1]))

            timestamps_ms.append(timestamp_ms)
            previous_gray = gray
            frame_index += 1
    finally:
        capture.release()

    if len(timestamps_ms) >= 2 and duration_ms <= 0:
        duration_ms = timestamps_ms[-1]

    result = detect_swing_segments_from_motion_series(
        motion_scores,
        timestamps_ms=timestamps_ms,
        motion_boxes=motion_boxes,
        duration_ms=max(duration_ms, 1),
    )
    return {
        "videoPath": str(target),
        "scanFps": round(TARGET_SCAN_FPS, 2),
        **result,
    }
