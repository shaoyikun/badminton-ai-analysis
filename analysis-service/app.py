from __future__ import annotations

import json
import sys
from pathlib import Path

from services.frame_loader import list_frame_paths
from services.pose_estimator import estimate_pose_for_frames
from services.swing_segment_detector import detect_swing_segments_for_video


def main() -> int:
    if len(sys.argv) < 2:
        print('Usage: python3 app.py <preprocess-task-dir> | detect-segments <video-path>')
        return 1

    if sys.argv[1] == 'detect-segments':
        if len(sys.argv) < 3:
            print('Usage: python3 app.py detect-segments <video-path>')
            return 1

        video_path = Path(sys.argv[2]).resolve()
        result = detect_swing_segments_for_video(str(video_path))
        print(json.dumps({
            'videoPath': str(video_path),
            'result': result,
        }, ensure_ascii=False, indent=2))
        return 0

    task_dir = Path(sys.argv[1]).resolve()
    frame_paths = list_frame_paths(str(task_dir))
    result = estimate_pose_for_frames(frame_paths, task_dir=task_dir)
    print(json.dumps({
        'taskDir': str(task_dir),
        'frameFiles': [path.name for path in frame_paths],
        'result': result,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
