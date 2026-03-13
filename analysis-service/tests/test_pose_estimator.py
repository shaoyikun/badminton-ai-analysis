import copy
import hashlib
import json
import shutil
import sys
import tempfile
import types
import unittest
from pathlib import Path
from typing import Optional
from unittest import mock

try:
    import cv2
except ModuleNotFoundError:  # pragma: no cover - optional dependency in local env
    cv2 = None

import services.pose_estimator as pose_estimator
from services.pose_estimator import (
    _build_frame_payload,
    _build_overall_summary,
    _compute_frame_metrics,
    _ema_smooth_keypoint_sequence,
    _ensure_pose_landmarker_model,
    _frame_timestamp_ms,
    _get_point_map,
    _infer_frame_racket_side,
    _infer_frame_view_profile,
    _variance,
)


def make_point(name: str, x: float, y: float, z: float = 0.0, visibility: float = 0.95):
    return {
        "name": name,
        "x": x,
        "y": y,
        "z": z,
        "visibility": visibility,
    }


def make_keypoints(
    view: str = "rear_left_oblique",
    racket_side: str = "right",
    wrist_jitter: float = 0.0,
    arm_extension: float = 0.0,
    elbow_raise: float = 0.0,
    wrist_raise: float = 0.0,
    hide_non_racket_arm: bool = False,
):
    if view == "front":
        left_shoulder = make_point("left_shoulder", 0.34, 0.32, 0.02)
        right_shoulder = make_point("right_shoulder", 0.66, 0.32, -0.02)
        left_hip = make_point("left_hip", 0.41, 0.58, 0.02)
        right_hip = make_point("right_hip", 0.59, 0.58, -0.02)
        face_visibility = 0.92
    elif view == "right_side":
        left_shoulder = make_point("left_shoulder", 0.46, 0.32, 0.25)
        right_shoulder = make_point("right_shoulder", 0.54, 0.32, -0.28)
        left_hip = make_point("left_hip", 0.47, 0.58, 0.19)
        right_hip = make_point("right_hip", 0.53, 0.58, -0.22)
        face_visibility = 0.78
    else:
        left_shoulder = make_point("left_shoulder", 0.38, 0.32, -0.16)
        right_shoulder = make_point("right_shoulder", 0.57, 0.32, 0.12)
        left_hip = make_point("left_hip", 0.42, 0.58, -0.12)
        right_hip = make_point("right_hip", 0.56, 0.58, 0.11)
        face_visibility = 0.44

    left_elbow = make_point("left_elbow", 0.31, 0.42, 0.06)
    right_elbow = make_point("right_elbow", 0.69, 0.30 if racket_side == "right" else 0.42, -0.08)
    left_wrist = make_point("left_wrist", 0.26, 0.47 if racket_side == "right" else 0.16, 0.08)
    right_wrist = make_point("right_wrist", 0.74, (0.16 if racket_side == "right" else 0.47) + wrist_jitter, -0.12)

    if racket_side == "right":
        right_elbow = make_point("right_elbow", 0.69 + arm_extension, max(0.12, right_elbow["y"] - elbow_raise), -0.08)
        right_wrist = make_point("right_wrist", 0.74 + arm_extension, max(0.06, right_wrist["y"] - wrist_raise) + wrist_jitter, -0.12)
        if hide_non_racket_arm:
            left_elbow = make_point("left_elbow", left_elbow["x"], left_elbow["y"], left_elbow["z"], visibility=0.1)
            left_wrist = make_point("left_wrist", left_wrist["x"], left_wrist["y"], left_wrist["z"], visibility=0.1)
    else:
        left_elbow = make_point("left_elbow", 0.31 - arm_extension, max(0.12, left_elbow["y"] - elbow_raise), 0.06)
        left_wrist = make_point("left_wrist", 0.26 - arm_extension, max(0.06, left_wrist["y"] - wrist_raise), 0.08)
        if hide_non_racket_arm:
            right_elbow = make_point("right_elbow", right_elbow["x"], right_elbow["y"], right_elbow["z"], visibility=0.1)
            right_wrist = make_point("right_wrist", right_wrist["x"], right_wrist["y"], right_wrist["z"], visibility=0.1)

    return [
        make_point("nose", 0.5, 0.18, 0.0, face_visibility),
        make_point("left_eye", 0.46, 0.16, 0.0, face_visibility),
        make_point("right_eye", 0.54, 0.16, 0.0, face_visibility),
        make_point("left_ear", 0.41, 0.18, 0.02, face_visibility),
        make_point("right_ear", 0.59, 0.18, -0.02, face_visibility),
        left_shoulder,
        right_shoulder,
        left_elbow,
        right_elbow,
        left_wrist,
        right_wrist,
        make_point("left_hip", left_hip["x"], left_hip["y"], left_hip["z"], left_hip["visibility"]),
        make_point("right_hip", right_hip["x"], right_hip["y"], right_hip["z"], right_hip["visibility"]),
        make_point("left_knee", 0.43, 0.77, -0.04),
        make_point("right_knee", 0.57, 0.77, 0.04),
        make_point("left_ankle", 0.43, 0.93, -0.03),
        make_point("right_ankle", 0.57, 0.93, 0.03),
    ]


def make_test_image(target_path: Path):
    if cv2 is None:
        raise AssertionError("opencv-python is unavailable")
    target_path.write_text(
        "\n".join([
            "P3",
            "4 4",
            "255",
            "255 255 255 255 255 255 255 255 255 255 255 255",
            "255 255 255 255 255 255 255 255 255 255 255 255",
            "255 255 255 255 255 255 255 255 255 255 255 255",
            "255 255 255 255 255 255 255 255 255 255 255 255",
        ]),
        encoding="utf-8",
    )
    image = cv2.imread(str(target_path))
    if image is None:
        raise AssertionError("failed to load test image")
    return image


def make_summary_frame(
    frame_index: int,
    *,
    status: str = "usable",
    stability_score: float = 0.82,
    subject_scale: float = 0.2,
    body_turn_score: float = 0.56,
    racket_arm_lift_score: float = 0.58,
    composite_score: float = 0.67,
    view_profile: str = "rear_left_oblique",
    view_confidence: float = 0.88,
    specialized_overrides: Optional[dict] = None,
):
    specialized = {
        "shoulderHipRotationScore": 0.52,
        "trunkCoilScore": 0.58,
        "sideOnReadinessScore": 0.54,
        "chestOpeningScore": 0.56,
        "elbowExtensionScore": 0.61,
        "hittingArmPreparationScore": 0.59,
        "racketSideElbowHeightScore": 0.57,
        "wristAboveShoulderConfidence": 0.55,
        "headStabilityScore": 0.74,
        "contactPreparationScore": 0.63,
        "nonRacketArmBalanceScore": 0.46,
    }
    if specialized_overrides:
        specialized.update(specialized_overrides)
    final_metrics = {
        "stabilityScore": stability_score,
        "shoulderSpan": 0.18,
        "hipSpan": 0.14,
        "bodyTurnScore": body_turn_score,
        "racketArmLiftScore": racket_arm_lift_score,
        "specialized": specialized,
        "subjectScale": subject_scale,
        "compositeScore": composite_score,
        "summaryText": "debug",
        "debug": {
            "specialized": {
                "selectedRacketSide": "right",
                "selectedRacketSideSource": "frame_inference",
                "observability": {
                    name: {
                        "observable": value is not None,
                        "reasons": [] if value is not None else ["synthetic-missing"],
                    }
                    for name, value in specialized.items()
                },
                "components": {
                    "contactPreparationScore": {
                        "normalized": specialized["contactPreparationScore"],
                    },
                },
            },
            "statusReasons": ["synthetic-test-frame"],
        },
    }
    raw_metrics = copy.deepcopy(final_metrics)
    smoothed_metrics = copy.deepcopy(final_metrics)
    return {
        "frameIndex": frame_index,
        "fileName": f"frame-{frame_index:02d}.jpg",
        "status": status,
        "keypoints": [],
        "smoothedKeypoints": [],
        "rawMetrics": raw_metrics,
        "smoothedMetrics": smoothed_metrics,
        "finalMetrics": final_metrics,
        "metrics": final_metrics,
        "overlayRelativePath": f"artifacts/tasks/task_pose_test/pose/overlays/frame-{frame_index:02d}-overlay.jpg",
        "viewProfile": view_profile,
        "viewConfidence": view_confidence,
        "dominantRacketSide": "right",
        "racketSideConfidence": 0.72,
    }


class PoseEstimatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.mkdtemp(prefix="badminton-pose-estimator-")
        self.preprocess_dir = Path(self.temp_dir) / "backend" / "artifacts" / "tasks" / "task_pose_test" / "preprocess"
        self.preprocess_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_infers_reasonable_view_profiles(self) -> None:
        front_profile, _ = _infer_frame_view_profile(_get_point_map(make_keypoints(view="front")))
        side_profile, _ = _infer_frame_view_profile(_get_point_map(make_keypoints(view="right_side")))
        rear_oblique_profile, _ = _infer_frame_view_profile(_get_point_map(make_keypoints(view="rear_left_oblique")))

        self.assertEqual(front_profile, "front")
        self.assertEqual(side_profile, "right_side")
        self.assertEqual(rear_oblique_profile, "rear_left_oblique")

    def test_infers_racket_side_from_arm_lift_signal(self) -> None:
        right_side, right_confidence, _, _ = _infer_frame_racket_side(_get_point_map(make_keypoints(racket_side="right")))
        left_side, left_confidence, _, _ = _infer_frame_racket_side(_get_point_map(make_keypoints(racket_side="left")))

        self.assertEqual(right_side, "right")
        self.assertGreater(right_confidence, 0.2)
        self.assertEqual(left_side, "left")
        self.assertGreater(left_confidence, 0.2)

    def test_generates_overlay_for_detected_frame(self) -> None:
        if cv2 is None:
            self.skipTest("opencv-python is unavailable")

        image = make_test_image(self.preprocess_dir / "frame-01.ppm")
        frame_path = self.preprocess_dir / "frame-01.jpg"
        payload = _build_frame_payload(self.preprocess_dir, frame_path, 1, image, make_keypoints(), make_keypoints())

        overlay_path = Path(self.temp_dir) / "backend" / "artifacts" / "tasks" / "task_pose_test" / "pose" / "overlays" / "frame-01-overlay.jpg"

        self.assertEqual(payload["status"], "usable")
        self.assertTrue(payload["overlayRelativePath"].endswith("artifacts/tasks/task_pose_test/pose/overlays/frame-01-overlay.jpg"))
        self.assertTrue(overlay_path.exists())

    def test_summary_uses_overlay_path_from_best_frame(self) -> None:
        if cv2 is None:
            self.skipTest("opencv-python is unavailable")

        image = make_test_image(self.preprocess_dir / "frame-summary.ppm")
        first = _build_frame_payload(self.preprocess_dir, self.preprocess_dir / "frame-01.jpg", 1, image, make_keypoints(view="rear_left_oblique"), make_keypoints(view="rear_left_oblique"))
        second = _build_frame_payload(self.preprocess_dir, self.preprocess_dir / "frame-02.jpg", 2, image, make_keypoints(view="front"), make_keypoints(view="front"))

        summary = _build_overall_summary([first, second], detected_count=2)

        self.assertEqual(summary["bestFrameIndex"], 1)
        self.assertEqual(summary["viewProfile"], "rear_left_oblique")
        self.assertEqual(summary["dominantRacketSide"], "right")
        self.assertTrue(summary["bestFrameOverlayRelativePath"].endswith("frame-01-overlay.jpg"))
        self.assertEqual(summary["overlayFrameCount"], 2)

    def test_frame_payload_exposes_raw_smoothed_and_final_metrics(self) -> None:
        payload = _build_frame_payload(self.preprocess_dir, self.preprocess_dir / "frame-debug.jpg", 3, None, make_keypoints(), make_keypoints())

        self.assertIsNotNone(payload["rawMetrics"])
        self.assertIsNotNone(payload["smoothedMetrics"])
        self.assertIsNotNone(payload["finalMetrics"])
        self.assertIs(payload["metrics"], payload["finalMetrics"])
        self.assertIn("finalAdjustments", payload["finalMetrics"]["debug"])
        self.assertIn("frameInference", payload["finalMetrics"]["debug"])
        self.assertIn("rawFrameInference", payload["finalMetrics"]["debug"])
        self.assertIn("specialized", payload["finalMetrics"])
        self.assertIn("specialized", payload["finalMetrics"]["debug"])
        self.assertIn("contactPreparationScore", payload["finalMetrics"]["specialized"])
        self.assertIn("observability", payload["finalMetrics"]["debug"]["specialized"])

    def test_summary_exposes_rejection_reason_details_and_debug_counts(self) -> None:
        frames = [
            make_summary_frame(index, status="detected", stability_score=0.3, subject_scale=0.1, composite_score=0.31)
            for index in range(1, 4)
        ] + [
            make_summary_frame(index, status="usable", stability_score=0.83, subject_scale=0.18, composite_score=0.72)
            for index in range(4, 7)
        ]

        summary = _build_overall_summary(frames, detected_count=6)
        detail_map = {item["code"]: item for item in summary["rejectionReasonDetails"]}

        self.assertEqual(summary["debugCounts"]["tooSmallCount"], 3)
        self.assertEqual(summary["debugCounts"]["lowStabilityCount"], 3)
        self.assertEqual(summary["debugCounts"]["usableFrameCount"], 3)
        self.assertEqual(summary["debugCounts"]["detectedFrameCount"], 6)
        self.assertIn("subject_too_small_or_cropped", summary["rejectionReasons"])
        self.assertIn("poor_lighting_or_occlusion", summary["rejectionReasons"])
        self.assertIn("insufficient_pose_coverage", summary["rejectionReasons"])
        self.assertEqual(summary["metricSource"], "finalMetrics")
        self.assertIn("viewTransitionCount", summary["debugCounts"])
        self.assertIn("largeMotionJumpCount", summary["debugCounts"])
        self.assertTrue(detail_map["subject_too_small_or_cropped"]["triggered"])
        self.assertTrue(detail_map["poor_lighting_or_occlusion"]["triggered"])
        self.assertTrue(detail_map["insufficient_pose_coverage"]["triggered"])

    def test_summary_marks_invalid_camera_angle_for_low_confidence_views(self) -> None:
        frames = [
            make_summary_frame(index, status="usable", stability_score=0.84, subject_scale=0.2, composite_score=0.74, view_profile="front", view_confidence=0.2)
            for index in range(1, 7)
        ]

        summary = _build_overall_summary(frames, detected_count=6)
        detail_map = {item["code"]: item for item in summary["rejectionReasonDetails"]}

        self.assertIn("invalid_camera_angle", summary["rejectionReasons"])
        self.assertEqual(summary["debugCounts"]["unknownViewCount"], 6)
        self.assertTrue(detail_map["invalid_camera_angle"]["triggered"])
        self.assertEqual(detail_map["invalid_camera_angle"]["threshold"], 5)

    def test_specialized_torso_scores_rank_side_view_above_front_view(self) -> None:
        front_metrics = _compute_frame_metrics(make_keypoints(view="front"))
        side_metrics = _compute_frame_metrics(make_keypoints(view="right_side"))
        rear_oblique_metrics = _compute_frame_metrics(make_keypoints(view="rear_left_oblique"))

        self.assertLess(front_metrics["specialized"]["sideOnReadinessScore"] or 0.0, rear_oblique_metrics["specialized"]["sideOnReadinessScore"] or 0.0)
        self.assertLess(rear_oblique_metrics["specialized"]["sideOnReadinessScore"] or 0.0, side_metrics["specialized"]["sideOnReadinessScore"] or 0.0)
        self.assertLess(front_metrics["specialized"]["trunkCoilScore"] or 0.0, side_metrics["specialized"]["trunkCoilScore"] or 0.0)

    def test_specialized_arm_scores_increase_with_preparation_geometry(self) -> None:
        baseline_metrics = _compute_frame_metrics(make_keypoints(racket_side="right"))
        loaded_metrics = _compute_frame_metrics(make_keypoints(
            racket_side="right",
            arm_extension=0.08,
            elbow_raise=0.08,
            wrist_raise=0.12,
        ))

        self.assertLess(baseline_metrics["specialized"]["elbowExtensionScore"] or 0.0, loaded_metrics["specialized"]["elbowExtensionScore"] or 0.0)
        self.assertLess(baseline_metrics["specialized"]["racketSideElbowHeightScore"] or 0.0, loaded_metrics["specialized"]["racketSideElbowHeightScore"] or 0.0)
        self.assertLess(baseline_metrics["specialized"]["wristAboveShoulderConfidence"] or 0.0, loaded_metrics["specialized"]["wristAboveShoulderConfidence"] or 0.0)
        self.assertLess(baseline_metrics["specialized"]["hittingArmPreparationScore"] or 0.0, loaded_metrics["specialized"]["hittingArmPreparationScore"] or 0.0)

    def test_specialized_metrics_expose_observability_reasons_when_arm_is_missing(self) -> None:
        metrics = _compute_frame_metrics(make_keypoints(racket_side="right", hide_non_racket_arm=True))

        self.assertIsNone(metrics["specialized"]["nonRacketArmBalanceScore"])
        self.assertFalse(metrics["debug"]["specialized"]["observability"]["nonRacketArmBalanceScore"]["observable"])
        self.assertIn("low_visibility_elbow", metrics["debug"]["specialized"]["observability"]["nonRacketArmBalanceScore"]["reasons"])

    def test_specialized_summary_tracks_peak_frame_and_observable_coverage(self) -> None:
        frames = [
            make_summary_frame(1, specialized_overrides={"contactPreparationScore": 0.41, "nonRacketArmBalanceScore": None}),
            make_summary_frame(2, specialized_overrides={"contactPreparationScore": 0.86}),
            make_summary_frame(3, specialized_overrides={"contactPreparationScore": 0.62}),
        ]

        summary = _build_overall_summary(frames, detected_count=3)
        contact_summary = summary["specializedFeatureSummary"]["contactPreparationScore"]
        non_racket_summary = summary["specializedFeatureSummary"]["nonRacketArmBalanceScore"]

        self.assertEqual(summary["bestPreparationFrameIndex"], 2)
        self.assertEqual(contact_summary["peakFrameIndex"], 2)
        self.assertEqual(contact_summary["peak"], 0.86)
        self.assertEqual(contact_summary["observableFrameCount"], 3)
        self.assertEqual(non_racket_summary["observableFrameCount"], 2)
        self.assertEqual(non_racket_summary["observableCoverage"], 0.6667)
        self.assertEqual(summary["phaseCandidates"]["preparation"]["anchorFrameIndex"], 2)

    def test_phase_candidates_cover_full_sequence_for_stable_sample(self) -> None:
        frames = [
            make_summary_frame(1, composite_score=0.41, body_turn_score=0.5, racket_arm_lift_score=0.48, specialized_overrides={
                "contactPreparationScore": 0.48,
                "hittingArmPreparationScore": 0.52,
            }),
            make_summary_frame(2, composite_score=0.55, body_turn_score=0.54, racket_arm_lift_score=0.58, specialized_overrides={
                "contactPreparationScore": 0.74,
                "hittingArmPreparationScore": 0.7,
            }),
            make_summary_frame(3, composite_score=0.63, body_turn_score=0.58, racket_arm_lift_score=0.64, specialized_overrides={
                "contactPreparationScore": 0.92,
                "hittingArmPreparationScore": 0.73,
            }),
            make_summary_frame(4, composite_score=0.71, body_turn_score=0.64, racket_arm_lift_score=0.69, specialized_overrides={
                "contactPreparationScore": 0.79,
                "hittingArmPreparationScore": 0.88,
            }),
            make_summary_frame(5, composite_score=0.9, body_turn_score=0.67, racket_arm_lift_score=0.74, specialized_overrides={
                "contactPreparationScore": 0.56,
                "hittingArmPreparationScore": 0.61,
            }),
            make_summary_frame(6, composite_score=0.52, body_turn_score=0.31, racket_arm_lift_score=0.29, specialized_overrides={
                "contactPreparationScore": 0.37,
                "hittingArmPreparationScore": 0.34,
            }),
            make_summary_frame(7, composite_score=0.28, body_turn_score=0.18, racket_arm_lift_score=0.16, specialized_overrides={
                "contactPreparationScore": 0.21,
                "hittingArmPreparationScore": 0.2,
            }),
        ]

        summary = _build_overall_summary(frames, detected_count=7)
        phase_candidates = summary["phaseCandidates"]

        self.assertEqual(summary["bestPreparationFrameIndex"], 3)
        self.assertEqual(phase_candidates["preparation"]["detectionStatus"], "detected")
        self.assertEqual(phase_candidates["backswing"]["detectionStatus"], "detected")
        self.assertEqual(phase_candidates["contactCandidate"]["detectionStatus"], "detected")
        self.assertEqual(phase_candidates["followThrough"]["detectionStatus"], "detected")
        self.assertEqual(phase_candidates["preparation"]["windowStartFrameIndex"], 2)
        self.assertEqual(phase_candidates["preparation"]["windowEndFrameIndex"], 4)
        self.assertEqual(phase_candidates["backswing"]["anchorFrameIndex"], 4)
        self.assertEqual(phase_candidates["contactCandidate"]["anchorFrameIndex"], 5)
        self.assertEqual(phase_candidates["followThrough"]["anchorFrameIndex"], 6)
        self.assertLessEqual(phase_candidates["preparation"]["anchorFrameIndex"], phase_candidates["backswing"]["anchorFrameIndex"])
        self.assertLessEqual(phase_candidates["backswing"]["anchorFrameIndex"], phase_candidates["contactCandidate"]["anchorFrameIndex"])
        self.assertLessEqual(phase_candidates["contactCandidate"]["anchorFrameIndex"], phase_candidates["followThrough"]["anchorFrameIndex"])

    def test_phase_candidates_mark_missing_preparation_evidence(self) -> None:
        frames = [
            make_summary_frame(1, composite_score=0.44, specialized_overrides={
                "contactPreparationScore": None,
                "hittingArmPreparationScore": 0.48,
            }),
            make_summary_frame(2, composite_score=0.51, specialized_overrides={
                "contactPreparationScore": None,
                "hittingArmPreparationScore": 0.54,
            }),
            make_summary_frame(3, composite_score=0.62, specialized_overrides={
                "contactPreparationScore": None,
                "hittingArmPreparationScore": 0.59,
            }),
        ]

        summary = _build_overall_summary(frames, detected_count=3)
        phase_candidates = summary["phaseCandidates"]

        self.assertEqual(phase_candidates["preparation"]["detectionStatus"], "missing")
        self.assertEqual(phase_candidates["preparation"]["missingReason"], "insufficient_preparation_evidence")
        self.assertEqual(phase_candidates["backswing"]["detectionStatus"], "missing")
        self.assertEqual(phase_candidates["backswing"]["missingReason"], "insufficient_preparation_evidence")
        self.assertEqual(phase_candidates["contactCandidate"]["detectionStatus"], "detected")
        self.assertEqual(phase_candidates["contactCandidate"]["sourceMetric"], "bestFrameIndex")
        self.assertEqual(phase_candidates["contactCandidate"]["anchorFrameIndex"], summary["bestFrameIndex"])
        self.assertEqual(summary["bestPreparationFrameIndex"], None)

    def test_phase_candidates_allow_missing_follow_through_after_truncated_contact(self) -> None:
        frames = [
            make_summary_frame(1, composite_score=0.45, specialized_overrides={
                "contactPreparationScore": 0.52,
                "hittingArmPreparationScore": 0.5,
            }),
            make_summary_frame(2, composite_score=0.58, specialized_overrides={
                "contactPreparationScore": 0.76,
                "hittingArmPreparationScore": 0.68,
            }),
            make_summary_frame(3, composite_score=0.67, specialized_overrides={
                "contactPreparationScore": 0.89,
                "hittingArmPreparationScore": 0.81,
            }),
            make_summary_frame(4, composite_score=0.93, specialized_overrides={
                "contactPreparationScore": 0.57,
                "hittingArmPreparationScore": 0.62,
            }),
        ]

        summary = _build_overall_summary(frames, detected_count=4)
        phase_candidates = summary["phaseCandidates"]

        self.assertEqual(phase_candidates["preparation"]["detectionStatus"], "detected")
        self.assertEqual(phase_candidates["backswing"]["detectionStatus"], "detected")
        self.assertEqual(phase_candidates["contactCandidate"]["detectionStatus"], "detected")
        self.assertEqual(phase_candidates["followThrough"]["detectionStatus"], "missing")
        self.assertEqual(phase_candidates["followThrough"]["missingReason"], "no_post_contact_frames")

    def test_ema_smoothing_reduces_composite_score_variance(self) -> None:
        raw_sequence = [make_keypoints(wrist_jitter=jitter) for jitter in [0.0, 0.08, -0.07, 0.09, -0.06, 0.07]]
        raw_variance = _variance([_compute_frame_metrics(keypoints)["compositeScore"] for keypoints in raw_sequence])
        smoothed_sequence = _ema_smooth_keypoint_sequence(raw_sequence)
        smoothed_variance = _variance([_compute_frame_metrics(keypoints)["compositeScore"] for keypoints in smoothed_sequence])

        self.assertGreater(raw_variance, 0.0)
        self.assertLess(smoothed_variance, raw_variance)

    def test_summary_does_not_trigger_action_evidence_on_single_frame_spike(self) -> None:
        frames = [
            make_summary_frame(index, composite_score=0.72, body_turn_score=0.56, racket_arm_lift_score=0.58)
            for index in range(1, 7)
        ]
        frames[3]["finalMetrics"]["compositeScore"] = 0.98
        frames[3]["metrics"]["compositeScore"] = 0.98
        frames[3]["rawMetrics"]["compositeScore"] = 0.98

        summary = _build_overall_summary(frames, detected_count=6)
        detail_map = {item["code"]: item for item in summary["rejectionReasonDetails"]}

        self.assertNotIn("insufficient_action_evidence", summary["rejectionReasons"])
        self.assertFalse(detail_map["insufficient_action_evidence"]["triggered"])

    def test_ensure_pose_landmarker_model_prefers_explicit_path(self) -> None:
        explicit_model_path = Path(self.temp_dir) / "explicit.task"
        explicit_model_path.write_bytes(b"explicit-model")
        expected_sha = hashlib.sha256(b"explicit-model").hexdigest()

        with mock.patch.dict("os.environ", {"POSE_LANDMARKER_MODEL_PATH": str(explicit_model_path)}, clear=False):
            model_path, model_info = _ensure_pose_landmarker_model()

        self.assertEqual(model_path, explicit_model_path.resolve())
        self.assertEqual(model_info["source"], "explicit_path")
        self.assertEqual(model_info["sha256"], expected_sha)

    def test_ensure_pose_landmarker_model_uses_verified_cache_without_download(self) -> None:
        cache_dir = Path(self.temp_dir) / "cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        cached_file = cache_dir / "pose_landmarker_lite.task"
        cached_file.write_bytes(b"cached-model")
        cached_sha = hashlib.sha256(b"cached-model").hexdigest()
        lock_path = Path(self.temp_dir) / "pose_landmarker_lite.lock.json"
        lock_path.write_text(json.dumps({
            "version": "test-1",
            "fileName": "pose_landmarker_lite.task",
            "url": pose_estimator.DEFAULT_POSE_LANDMARKER_MODEL_URL,
            "sha256": cached_sha,
        }), encoding="utf-8")

        with mock.patch.object(pose_estimator, "_model_lock_path", return_value=lock_path):
            with mock.patch.object(pose_estimator, "urlretrieve") as mocked_retrieve:
                with mock.patch.dict("os.environ", {"POSE_LANDMARKER_MODEL_CACHE_DIR": str(cache_dir)}, clear=False):
                    model_path, model_info = _ensure_pose_landmarker_model()

        self.assertEqual(model_path, cached_file.resolve())
        self.assertEqual(model_info["source"], "cache")
        mocked_retrieve.assert_not_called()

    def test_ensure_pose_landmarker_model_downloads_and_verifies_when_cache_missing(self) -> None:
        cache_dir = Path(self.temp_dir) / "cache-download"
        fixture_bytes = b"downloaded-model"
        fixture_sha = hashlib.sha256(fixture_bytes).hexdigest()
        lock_path = Path(self.temp_dir) / "pose_landmarker_lite.lock.json"
        lock_path.write_text(json.dumps({
            "version": "test-1",
            "fileName": "pose_landmarker_lite.task",
            "url": "https://example.test/model.task",
            "sha256": fixture_sha,
        }), encoding="utf-8")

        def fake_urlretrieve(url: str, target_path: Path):
            Path(target_path).write_bytes(fixture_bytes)
            return str(target_path), None

        with mock.patch.object(pose_estimator, "_model_lock_path", return_value=lock_path):
            with mock.patch.object(pose_estimator, "urlretrieve", side_effect=fake_urlretrieve):
                with mock.patch.dict("os.environ", {"POSE_LANDMARKER_MODEL_CACHE_DIR": str(cache_dir)}, clear=False):
                    model_path, model_info = _ensure_pose_landmarker_model()

        self.assertTrue(model_path.exists())
        self.assertEqual(model_info["source"], "download")
        self.assertEqual(model_info["sha256"], fixture_sha)

    def test_frame_timestamp_uses_manifest_value_and_falls_back_to_index(self) -> None:
        manifest_path = self.preprocess_dir / "manifest.json"
        manifest_path.write_text(json.dumps({
            "sampledFrames": [
                {"fileName": "frame-01.jpg", "timestampSeconds": 1.11},
            ],
        }), encoding="utf-8")

        timestamp_one = _frame_timestamp_ms(self.preprocess_dir / "frame-01.jpg", 1, self.preprocess_dir)
        timestamp_two = _frame_timestamp_ms(self.preprocess_dir / "frame-02.jpg", 2, self.preprocess_dir)

        self.assertEqual(timestamp_one, 1110)
        self.assertEqual(timestamp_two, 2000)

    def test_tasks_api_uses_video_timestamps_from_manifest(self) -> None:
        frame_paths = [self.preprocess_dir / "frame-01.jpg", self.preprocess_dir / "frame-02.jpg"]
        for frame_path in frame_paths:
            frame_path.write_text("stub", encoding="utf-8")
        (self.preprocess_dir / "manifest.json").write_text(json.dumps({
            "sampledFrames": [
                {"fileName": "frame-01.jpg", "timestampSeconds": 1.11},
                {"fileName": "frame-02.jpg", "timestampSeconds": 2.22},
            ],
        }), encoding="utf-8")

        video_timestamps: list[int] = []

        class FakeDetector:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def detect_for_video(self, image, timestamp_ms):
                video_timestamps.append(timestamp_ms)
                return object()

            def detect(self, image):
                return object()

        class FakePoseLandmarker:
            @staticmethod
            def create_from_options(options):
                return FakeDetector()

        class FakeVisionModule:
            class RunningMode:
                VIDEO = "VIDEO"
                IMAGE = "IMAGE"

            class PoseLandmarkerOptions:
                def __init__(self, **kwargs):
                    self.running_mode = kwargs["running_mode"]

            PoseLandmarker = FakePoseLandmarker

        fake_tasks_python = types.ModuleType("mediapipe.tasks.python")
        fake_tasks_python.BaseOptions = lambda **kwargs: kwargs
        fake_tasks_python.vision = FakeVisionModule
        fake_mp = types.SimpleNamespace(Image=lambda **kwargs: kwargs, ImageFormat=types.SimpleNamespace(SRGB="SRGB"))
        fake_cv2 = types.SimpleNamespace(COLOR_BGR2RGB=1, cvtColor=lambda image, code: image, imwrite=lambda path, image: True)

        with mock.patch.dict(sys.modules, {
            "mediapipe.tasks": types.SimpleNamespace(python=fake_tasks_python),
            "mediapipe.tasks.python": fake_tasks_python,
            "mediapipe.tasks.python.vision": FakeVisionModule,
        }, clear=False):
            with mock.patch.object(pose_estimator, "mp", fake_mp):
                with mock.patch.object(pose_estimator, "cv2", fake_cv2):
                    with mock.patch.object(pose_estimator, "_ensure_pose_landmarker_model", return_value=(Path(self.temp_dir) / "model.task", {"version": "1", "sha256": "abc"})):
                        with mock.patch.object(pose_estimator, "_read_frame_image", return_value=object()):
                            with mock.patch.object(pose_estimator, "_extract_keypoints_from_tasks", return_value=make_keypoints()):
                                with mock.patch.object(pose_estimator, "_draw_overlay", side_effect=lambda image, keypoints, labels: image):
                                    result = pose_estimator._estimate_with_tasks_api(frame_paths, task_dir=self.preprocess_dir)

        self.assertEqual(result["diagnostics"]["runningMode"], "VIDEO")
        self.assertEqual(video_timestamps, [1110, 2220])

    def test_tasks_api_falls_back_to_image_when_video_mode_fails(self) -> None:
        frame_paths = [self.preprocess_dir / "frame-01.jpg", self.preprocess_dir / "frame-02.jpg"]
        for frame_path in frame_paths:
            frame_path.write_text("stub", encoding="utf-8")

        class FakeDetector:
            def __init__(self, running_mode):
                self.running_mode = running_mode

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def detect_for_video(self, image, timestamp_ms):
                raise RuntimeError("video mode unavailable")

            def detect(self, image):
                return object()

        class FakePoseLandmarker:
            @staticmethod
            def create_from_options(options):
                return FakeDetector(options.running_mode)

        class FakeVisionModule:
            class RunningMode:
                VIDEO = "VIDEO"
                IMAGE = "IMAGE"

            class PoseLandmarkerOptions:
                def __init__(self, **kwargs):
                    self.running_mode = kwargs["running_mode"]

            PoseLandmarker = FakePoseLandmarker

        fake_tasks_python = types.ModuleType("mediapipe.tasks.python")
        fake_tasks_python.BaseOptions = lambda **kwargs: kwargs
        fake_tasks_python.vision = FakeVisionModule
        fake_mp = types.SimpleNamespace(Image=lambda **kwargs: kwargs, ImageFormat=types.SimpleNamespace(SRGB="SRGB"))
        fake_cv2 = types.SimpleNamespace(COLOR_BGR2RGB=1, cvtColor=lambda image, code: image, imwrite=lambda path, image: True)

        with mock.patch.dict(sys.modules, {
            "mediapipe.tasks": types.SimpleNamespace(python=fake_tasks_python),
            "mediapipe.tasks.python": fake_tasks_python,
            "mediapipe.tasks.python.vision": FakeVisionModule,
        }, clear=False):
            with mock.patch.object(pose_estimator, "mp", fake_mp):
                with mock.patch.object(pose_estimator, "cv2", fake_cv2):
                    with mock.patch.object(pose_estimator, "_ensure_pose_landmarker_model", return_value=(Path(self.temp_dir) / "model.task", {"version": "1", "sha256": "abc"})):
                        with mock.patch.object(pose_estimator, "_read_frame_image", return_value=object()):
                            with mock.patch.object(pose_estimator, "_extract_keypoints_from_tasks", return_value=make_keypoints()):
                                with mock.patch.object(pose_estimator, "_draw_overlay", side_effect=lambda image, keypoints, labels: image):
                                    result = pose_estimator._estimate_with_tasks_api(frame_paths, task_dir=self.preprocess_dir)

        self.assertEqual(result["diagnostics"]["runningMode"], "IMAGE")
        self.assertTrue(result["diagnostics"]["fallbackApplied"])
        self.assertIn("video mode unavailable", result["diagnostics"]["fallbackReason"])


if __name__ == "__main__":
    unittest.main()
