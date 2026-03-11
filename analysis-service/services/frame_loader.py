from pathlib import Path
from typing import List


def list_frame_paths(task_dir: str) -> List[Path]:
    base = Path(task_dir)
    if not base.exists():
        return []
    return sorted(base.glob('frame-*.jpg'))
