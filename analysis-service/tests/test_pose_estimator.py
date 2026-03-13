import shutil
import tempfile
import unittest
from pathlib import Path

try:
    import cv2
    from services.pose_estimator import (
        _build_frame_payload,
        _build_overall_summary,
        _get_point_map,
        _infer_frame_racket_side,
        _infer_frame_view_profile,
    )
    POSE_IMPORT_ERROR = None
except ModuleNotFoundError as error:  # pragma: no cover - depends on local optional deps
    cv2 = None
    POSE_IMPORT_ERROR = error


def make_point(name: str, x: float, y: float, z: float = 0.0, visibility: float = 0.95):
    return {
        "name": name,
        "x": x,
        "y": y,
        "z": z,
        "visibility": visibility,
    }


def make_keypoints(view: str = "rear_left_oblique", racket_side: str = "right"):
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
    right_wrist = make_point("right_wrist", 0.74, 0.16 if racket_side == "right" else 0.47, -0.12)

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
        left_hip,
        right_hip,
        make_point("left_knee", 0.43, 0.77, -0.04),
        make_point("right_knee", 0.57, 0.77, 0.04),
        make_point("left_ankle", 0.43, 0.93, -0.03),
        make_point("right_ankle", 0.57, 0.93, 0.03),
    ]


def make_test_image(target_path: Path):
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
):
    return {
        "frameIndex": frame_index,
        "fileName": f"frame-{frame_index:02d}.jpg",
        "status": status,
        "keypoints": [],
        "metrics": {
            "stabilityScore": stability_score,
            "shoulderSpan": 0.18,
            "hipSpan": 0.14,
            "bodyTurnScore": body_turn_score,
            "racketArmLiftScore": racket_arm_lift_score,
            "subjectScale": subject_scale,
            "compositeScore": composite_score,
            "summaryText": "debug",
            "debug": {
                "statusReasons": ["synthetic-test-frame"],
            },
        },
        "overlayRelativePath": f"artifacts/tasks/task_pose_test/pose/overlays/frame-{frame_index:02d}-overlay.jpg",
        "viewProfile": view_profile,
        "viewConfidence": 0.88,
        "dominantRacketSide": "right",
        "racketSideConfidence": 0.72,
    }


class PoseEstimatorTests(unittest.TestCase):
    def setUp(self) -> None:
        if POSE_IMPORT_ERROR is not None:
            self.skipTest(f"pose estimator optional dependencies unavailable: {POSE_IMPORT_ERROR}")
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
        image = make_test_image(self.preprocess_dir / "frame-01.ppm")
        frame_path = self.preprocess_dir / "frame-01.jpg"
        payload = _build_frame_payload(self.preprocess_dir, frame_path, 1, image, make_keypoints())

        overlay_path = Path(self.temp_dir) / "backend" / "artifacts" / "tasks" / "task_pose_test" / "pose" / "overlays" / "frame-01-overlay.jpg"

        self.assertEqual(payload["status"], "usable")
        self.assertTrue(payload["overlayRelativePath"].endswith("artifacts/tasks/task_pose_test/pose/overlays/frame-01-overlay.jpg"))
        self.assertTrue(overlay_path.exists())

    def test_summary_uses_overlay_path_from_best_frame(self) -> None:
        image = make_test_image(self.preprocess_dir / "frame-summary.ppm")
        first = _build_frame_payload(self.preprocess_dir, self.preprocess_dir / "frame-01.jpg", 1, image, make_keypoints(view="rear_left_oblique"))
        second = _build_frame_payload(self.preprocess_dir, self.preprocess_dir / "frame-02.jpg", 2, image, make_keypoints(view="front"))

        summary = _build_overall_summary([first, second], detected_count=2)

        self.assertEqual(summary["bestFrameIndex"], 1)
        self.assertEqual(summary["viewProfile"], "rear_left_oblique")
        self.assertEqual(summary["dominantRacketSide"], "right")
        self.assertTrue(summary["bestFrameOverlayRelativePath"].endswith("frame-01-overlay.jpg"))
        self.assertEqual(summary["overlayFrameCount"], 2)

    def test_frame_payload_exposes_debug_metrics(self) -> None:
        image = make_test_image(self.preprocess_dir / "frame-debug.ppm")
        payload = _build_frame_payload(self.preprocess_dir, self.preprocess_dir / "frame-debug.jpg", 3, image, make_keypoints())

        metrics = payload["metrics"]
        self.assertIsNotNone(metrics)
        self.assertIn("compositeScore", metrics)
        self.assertIn("debug", metrics)
        self.assertIn("torsoHeight", metrics["debug"])
        self.assertIn("shoulderDepthGap", metrics["debug"])
        self.assertIn("hipDepthGap", metrics["debug"])
        self.assertIn("leftArmLiftScore", metrics["debug"])
        self.assertIn("rightArmLiftScore", metrics["debug"])
        self.assertIn("subjectScaleSource", metrics["debug"])
        self.assertIn("frameInference", metrics["debug"])
        self.assertIn("statusReasons", metrics["debug"])
        self.assertEqual(metrics["debug"]["frameInference"]["viewProfile"], payload["viewProfile"])
        self.assertEqual(metrics["debug"]["frameInference"]["dominantRacketSide"], payload["dominantRacketSide"])
        self.assertGreater(len(metrics["debug"]["statusReasons"]), 0)
        self.assertIn("viewConfidence", payload)
        self.assertIn("racketSideConfidence", payload)

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
        self.assertTrue(detail_map["subject_too_small_or_cropped"]["triggered"])
        self.assertTrue(detail_map["poor_lighting_or_occlusion"]["triggered"])
        self.assertTrue(detail_map["insufficient_pose_coverage"]["triggered"])

    def test_summary_marks_invalid_camera_angle_when_unknown_view_dominates_usable_frames(self) -> None:
        frames = [
            make_summary_frame(index, status="usable", stability_score=0.84, subject_scale=0.2, composite_score=0.74, view_profile="unknown")
            for index in range(1, 7)
        ]

        summary = _build_overall_summary(frames, detected_count=6)
        detail_map = {item["code"]: item for item in summary["rejectionReasonDetails"]}

        self.assertIn("invalid_camera_angle", summary["rejectionReasons"])
        self.assertEqual(summary["debugCounts"]["unknownViewCount"], 6)
        self.assertTrue(detail_map["invalid_camera_angle"]["triggered"])
        self.assertEqual(detail_map["invalid_camera_angle"]["threshold"], 5)


if __name__ == "__main__":
    unittest.main()
