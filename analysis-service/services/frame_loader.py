from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List


def list_frame_paths(task_dir: str) -> List[Path]:
    base = Path(task_dir)
    if not base.exists():
        return []
    return sorted(base.glob('frame-*.jpg'))


def load_frame_timestamps_ms(task_dir: str) -> Dict[str, int]:
    manifest_path = Path(task_dir) / 'manifest.json'
    if not manifest_path.exists():
        return {}

    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {}

    sampled_frames = manifest.get('sampledFrames')
    if not isinstance(sampled_frames, list):
        return {}

    timestamps: Dict[str, int] = {}
    for index, frame in enumerate(sampled_frames, start=1):
        if not isinstance(frame, dict):
            continue

        file_name = frame.get('fileName')
        timestamp_seconds = frame.get('timestampSeconds')
        if not isinstance(file_name, str) or not isinstance(timestamp_seconds, (int, float)):
            continue

        timestamps[file_name] = int(round(float(timestamp_seconds) * 1000))

    return timestamps
