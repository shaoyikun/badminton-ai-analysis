import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { extractFrames, probeVideo, setSwingSegmentDetectorForTests } from './services/preprocessService';

const execFileAsync = promisify(execFile);

async function withTempWorkspace(run: (workspace: string) => Promise<void>) {
  const originalCwd = process.cwd();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-preprocess-test-'));

  process.chdir(workspace);
  fs.mkdirSync(path.join(workspace, 'data'), { recursive: true });

  try {
    await run(workspace);
  } finally {
    setSwingSegmentDetectorForTests();
    process.chdir(originalCwd);
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

async function createFixtureVideo(targetPath: string, durationSeconds: number) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=320x240:d=${durationSeconds}`,
    '-pix_fmt',
    'yuv420p',
    targetPath,
  ], {
    encoding: 'utf8',
  });
}

async function hasFfmpeg() {
  try {
    await execFileAsync('ffmpeg', ['-version'], { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

test('extractFrames samples inside the recommended segment window while keeping absolute timestamps', async (t) => {
  if (!await hasFfmpeg()) {
    t.skip('ffmpeg is unavailable in the current test environment');
    return;
  }

  await withTempWorkspace(async (workspace) => {
    const sourcePath = path.join(workspace, 'clip.mp4');
    await createFixtureVideo(sourcePath, 3);
    const metadata = await probeVideo(sourcePath, {
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
    });

    setSwingSegmentDetectorForTests(async () => ({
      segmentDetectionVersion: 'coarse_motion_scan_v2',
      segmentSelectionMode: 'auto_recommended',
      recommendedSegmentId: 'segment-02',
      swingSegments: [
        {
          segmentId: 'segment-01',
          startTimeMs: 120,
          endTimeMs: 860,
          startFrame: 2,
          endFrame: 8,
          durationMs: 740,
          motionScore: 0.32,
          confidence: 0.55,
          rankingScore: 0.44,
          coarseQualityFlags: ['too_short'],
          detectionSource: 'coarse_motion_scan_v2',
        },
        {
          segmentId: 'segment-02',
          startTimeMs: 1380,
          endTimeMs: 2460,
          startFrame: 15,
          endFrame: 27,
          durationMs: 1080,
          motionScore: 0.68,
          confidence: 0.82,
          rankingScore: 0.79,
          coarseQualityFlags: [],
          detectionSource: 'coarse_motion_scan_v2',
        },
      ],
    }));

    const artifacts = await extractFrames('task_preprocess_segment', sourcePath, metadata);

    assert.equal(artifacts.segmentDetectionVersion, 'coarse_motion_scan_v2');
    assert.equal(artifacts.recommendedSegmentId, 'segment-02');
    assert.equal(artifacts.selectedSegmentId, 'segment-02');
    assert.equal(artifacts.segmentSelectionMode, 'auto_recommended');
    assert.deepEqual(artifacts.selectedSegmentWindow, {
      startTimeMs: 1380,
      endTimeMs: 2460,
      startFrame: 15,
      endFrame: 27,
    });
    assert.deepEqual(artifacts.framePlan.sourceWindow, {
      startTimeMs: 1380,
      endTimeMs: 2460,
      startFrame: 15,
      endFrame: 27,
    });
    assert.equal(artifacts.swingSegments?.length, 2);
    assert.ok((artifacts.sampledFrames[0]?.timestampSeconds ?? 0) > 1.38);
    assert.ok((artifacts.sampledFrames[artifacts.sampledFrames.length - 1]?.timestampSeconds ?? 0) < 2.46);
    assert.ok(artifacts.sampledFrames.every((frame) => frame.timestampSeconds > 1));
  });
});

test('extractFrames respects selected segment window override from the scan summary', async (t) => {
  if (!await hasFfmpeg()) {
    t.skip('ffmpeg is unavailable in the current test environment');
    return;
  }

  await withTempWorkspace(async (workspace) => {
    const sourcePath = path.join(workspace, 'clip.mp4');
    await createFixtureVideo(sourcePath, 3);
    const metadata = await probeVideo(sourcePath, {
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
    });

    const artifacts = await extractFrames('task_preprocess_override', sourcePath, metadata, {
      status: 'completed',
      segmentDetectionVersion: 'coarse_motion_scan_v2',
      recommendedSegmentId: 'segment-01',
      selectedSegmentId: 'segment-01',
      selectedSegmentWindow: {
        startTimeMs: 200,
        endTimeMs: 2900,
      },
      segmentSelectionMode: 'auto_recommended',
      swingSegments: [{
        segmentId: 'segment-01',
        startTimeMs: 500,
        endTimeMs: 1700,
        startFrame: 5,
        endFrame: 17,
        durationMs: 1200,
        motionScore: 0.51,
        confidence: 0.72,
        rankingScore: 0.66,
        coarseQualityFlags: [],
        detectionSource: 'coarse_motion_scan_v2',
      }],
    });

    assert.deepEqual(artifacts.selectedSegmentWindow, {
      startTimeMs: 200,
      endTimeMs: 2900,
      startFrame: 5,
      endFrame: 17,
    });
    assert.deepEqual(artifacts.framePlan.sourceWindow, artifacts.selectedSegmentWindow);
    assert.ok((artifacts.sampledFrames[0]?.timestampSeconds ?? 0) > 0.2);
    assert.ok((artifacts.sampledFrames[artifacts.sampledFrames.length - 1]?.timestampSeconds ?? 0) < 2.9);
  });
});

test('extractFrames falls back to full video selection when detector fails', async (t) => {
  if (!await hasFfmpeg()) {
    t.skip('ffmpeg is unavailable in the current test environment');
    return;
  }

  await withTempWorkspace(async (workspace) => {
    const sourcePath = path.join(workspace, 'clip.mp4');
    await createFixtureVideo(sourcePath, 2);
    const metadata = await probeVideo(sourcePath, {
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
    });

    setSwingSegmentDetectorForTests(async () => {
      throw new Error('synthetic detector failure');
    });

    const artifacts = await extractFrames('task_preprocess_fallback', sourcePath, metadata);

    assert.equal(artifacts.segmentSelectionMode, 'full_video_fallback');
    assert.equal(artifacts.selectedSegmentId, 'segment-01');
    assert.equal(artifacts.recommendedSegmentId, 'segment-01');
    assert.equal(artifacts.swingSegments?.length, 1);
    assert.equal(artifacts.framePlan.sourceWindow?.startTimeMs, 0);
    assert.ok((artifacts.framePlan.sourceWindow?.endTimeMs ?? 0) >= 1900);
    assert.ok(artifacts.sampledFrames.length >= 6);
  });
});
