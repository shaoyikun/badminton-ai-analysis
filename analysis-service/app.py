from __future__ import annotations

import json
import sys
from pathlib import Path

from services.frame_loader import list_frame_paths
from services.pose_estimator import estimate_pose_for_frames


def main() -> int:
    if len(sys.argv) < 2:
        print('Usage: python3 app.py <preprocess-task-dir>')
        return 1

    task_dir = Path(sys.argv[1]).resolve()
    frame_paths = list_frame_paths(str(task_dir))
    result = estimate_pose_for_frames(frame_paths)
    print(json.dumps({
        'taskDir': str(task_dir),
        'frameFiles': [path.name for path in frame_paths],
        'result': result,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
