import copy
import hashlib
import json
import shutil
import sys
import tempfile
import types
import unittest
from pathlib import Path
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


def make_keypoints(view: str = "rear_left_oblique", racket_side: str = "right", wrist_jitter: float = 0.0):
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
):
    final_metrics = {
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
