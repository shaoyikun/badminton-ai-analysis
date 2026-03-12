import shutil
import tempfile
import unittest
from pathlib import Path

from services.frame_loader import list_frame_paths


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


if __name__ == "__main__":
    unittest.main()
