import shutil
import tempfile
import unittest
import json
from pathlib import Path

from services.frame_loader import list_frame_paths, load_frame_timestamps_ms


class FrameLoaderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.mkdtemp(prefix="badminton-frame-loader-")

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_returns_sorted_frame_files_only(self) -> None:
        base = Path(self.temp_dir)
        (base / "frame-02.jpg").write_text("b", encoding="utf-8")
        (base / "frame-01.jpg").write_text("a", encoding="utf-8")
        (base / "manifest.json").write_text("{}", encoding="utf-8")

        result = list_frame_paths(self.temp_dir)

        self.assertEqual([path.name for path in result], ["frame-01.jpg", "frame-02.jpg"])

    def test_loads_manifest_timestamps_in_milliseconds(self) -> None:
        base = Path(self.temp_dir)
        (base / "manifest.json").write_text(json.dumps({
            "sampledFrames": [
                {"fileName": "frame-01.jpg", "timestampSeconds": 1.11},
                {"fileName": "frame-02.jpg", "timestampSeconds": 2.22},
            ],
        }), encoding="utf-8")

        result = load_frame_timestamps_ms(self.temp_dir)

        self.assertEqual(result, {
            "frame-01.jpg": 1110,
            "frame-02.jpg": 2220,
        })


if __name__ == "__main__":
    unittest.main()
