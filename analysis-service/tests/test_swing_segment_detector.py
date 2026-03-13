import unittest

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
        self.assertEqual(len(result["swingSegments"]), 1)
        self.assertGreater(result["swingSegments"][0]["motionScore"], 0.05)

    def test_detects_multiple_segments_and_prefers_later_clearer_window(self) -> None:
        result = detect_swing_segments_from_motion_series(
            [0.0, 0.01, 0.12, 0.15, 0.11, 0.02, 0.0, 0.0, 0.01, 0.03, 0.14, 0.17, 0.15, 0.05, 0.01, 0.0],
            timestamps_ms=[index * 120 for index in range(16)],
            motion_boxes=[0.04] * 16,
            duration_ms=1920,
        )

        self.assertEqual(len(result["swingSegments"]), 2)
        self.assertEqual(result["recommendedSegmentId"], "segment-02")
        self.assertGreater(
            result["swingSegments"][1]["rankingScore"],
            result["swingSegments"][0]["rankingScore"],
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
