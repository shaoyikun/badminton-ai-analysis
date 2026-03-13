import unittest
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from services.swing_segment_detector import detect_swing_segments_from_motion_series


class SwingSegmentDetectorTests(unittest.TestCase):
    def test_detects_single_segment_and_recommends_it(self) -> None:
        result = detect_swing_segments_from_motion_series(
            [0.0, 0.01, 0.03, 0.08, 0.12, 0.09, 0.04, 0.01],
            timestamps_ms=[index * 100 for index in range(8)],
            motion_boxes=[0.05] * 8,
            duration_ms=800,
        )

        self.assertEqual(result["recommendedSegmentId"], "segment-01")
        self.assertEqual(result["segmentSelectionMode"], "auto_recommended")
        self.assertEqual(result["segmentDetectionVersion"], "coarse_motion_scan_v2")
        self.assertEqual(len(result["swingSegments"]), 1)
        self.assertGreater(result["swingSegments"][0]["motionScore"], 0.05)

    def test_slow_preparation_expands_segment_start_earlier(self) -> None:
        result = detect_swing_segments_from_motion_series(
            [0.0, 0.012, 0.02, 0.03, 0.045, 0.07, 0.11, 0.14, 0.12, 0.08, 0.04, 0.02],
            timestamps_ms=[index * 120 for index in range(12)],
            motion_boxes=[0.05] * 12,
            duration_ms=1440,
        )

        segment = result["swingSegments"][0]
        self.assertLessEqual(segment["startFrame"], 4)
        self.assertGreaterEqual(segment["durationMs"], 800)

    def test_flags_preparation_clip_when_motion_reaches_scan_start(self) -> None:
        result = detect_swing_segments_from_motion_series(
            [0.08, 0.1, 0.13, 0.11, 0.09, 0.05, 0.02],
            timestamps_ms=[index * 110 for index in range(7)],
            motion_boxes=[0.05] * 7,
            duration_ms=770,
        )

        segment = result["swingSegments"][0]
        self.assertIn("preparation_maybe_clipped", segment["coarseQualityFlags"])
        self.assertNotIn("motion_too_weak", segment["coarseQualityFlags"])

    def test_prefers_more_complete_segment_over_later_shorter_peak(self) -> None:
        result = detect_swing_segments_from_motion_series(
            [
                0.0, 0.012, 0.02, 0.03, 0.05, 0.075, 0.09, 0.1, 0.08, 0.05, 0.02, 0.0,
                0.0, 0.0, 0.0, 0.0, 0.02, 0.14, 0.18, 0.11, 0.03, 0.0,
            ],
            timestamps_ms=[index * 120 for index in range(22)],
            motion_boxes=[0.04] * 22,
            duration_ms=2280,
        )

        self.assertEqual(len(result["swingSegments"]), 2)
        self.assertEqual(result["recommendedSegmentId"], "segment-01")
        self.assertGreater(
            result["swingSegments"][0]["durationMs"],
            result["swingSegments"][1]["durationMs"],
        )

    def test_falls_back_to_single_window_when_motion_is_weak(self) -> None:
        result = detect_swing_segments_from_motion_series(
            [0.0, 0.001, 0.002, 0.0015, 0.001],
            timestamps_ms=[index * 200 for index in range(5)],
            motion_boxes=[0.01] * 5,
            duration_ms=1000,
        )

        self.assertEqual(len(result["swingSegments"]), 1)
        self.assertEqual(result["recommendedSegmentId"], "segment-01")
        self.assertIn(result["segmentSelectionMode"], ("auto_recommended", "full_video_fallback"))


if __name__ == "__main__":
    unittest.main()
