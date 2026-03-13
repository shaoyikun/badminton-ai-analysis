import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { PoseAnalysisResult, PreprocessArtifacts } from './types/task';
import {
  buildAlgorithmBaselineDebugSnapshot,
  loadDebugArtifactsContext,
  renderAlgorithmBaselineMarkdown,
} from './dev/debugAlgorithmBaseline';

function withTempDir(run: (workspace: string) => void) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-debug-baseline-test-'));
  try {
    run(workspace);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

function buildPoseResult(): PoseAnalysisResult {
  return {
    engine: 'mediapipe-pose',
    frameCount: 2,
    detectedFrameCount: 2,
    summary: {
      bestFrameIndex: 1,
      usableFrameCount: 2,
      coverageRatio: 1,
      medianStabilityScore: 0.84,
      medianBodyTurnScore: 0.58,
      medianRacketArmLiftScore: 0.52,
      scoreVariance: 0.012,
      rejectionReasons: [],
      rejectionReasonDetails: [],
      humanSummary: 'debug summary',
      viewProfile: 'rear_left_oblique',
      viewConfidence: 0.86,
      viewStability: 1,
      dominantRacketSide: 'right',
      racketSideConfidence: 0.73,
      bestFrameOverlayRelativePath: 'artifacts/tasks/task_debug/pose/overlays/frame-01-overlay.jpg',
      overlayFrameCount: 2,
      debugCounts: {
        tooSmallCount: 0,
        lowStabilityCount: 0,
        unknownViewCount: 0,
        usableFrameCount: 2,
        detectedFrameCount: 2,
      },
    },
    frames: [
      {
        frameIndex: 1,
        fileName: 'frame-01.jpg',
        status: 'usable',
        keypoints: [],
        metrics: {
          stabilityScore: 0.84,
          shoulderSpan: 0.18,
          hipSpan: 0.14,
          bodyTurnScore: 0.58,
          racketArmLiftScore: 0.52,
          subjectScale: 0.24,
          compositeScore: 0.67,
          debug: {
            statusReasons: ['all_thresholds_passed'],
          },
          summaryText: 'usable',
        },
        overlayRelativePath: 'artifacts/tasks/task_debug/pose/overlays/frame-01-overlay.jpg',
        viewProfile: 'rear_left_oblique',
        viewConfidence: 0.86,
        dominantRacketSide: 'right',
        racketSideConfidence: 0.73,
      },
      {
        frameIndex: 2,
        fileName: 'frame-02.jpg',
        status: 'usable',
        keypoints: [],
        metrics: {
          stabilityScore: 0.82,
          shoulderSpan: 0.19,
          hipSpan: 0.15,
          bodyTurnScore: 0.56,
          racketArmLiftScore: 0.5,
          subjectScale: 0.25,
          compositeScore: 0.65,
          debug: {
            statusReasons: ['all_thresholds_passed'],
          },
          summaryText: 'usable',
        },
        overlayRelativePath: 'artifacts/tasks/task_debug/pose/overlays/frame-02-overlay.jpg',
        viewProfile: 'rear_left_oblique',
        viewConfidence: 0.82,
        dominantRacketSide: 'right',
        racketSideConfidence: 0.71,
      },
    ],
  };
}

test('loadDebugArtifactsContext uses manifest when it exists', () => {
  withTempDir((workspace) => {
    const preprocessDir = path.join(workspace, 'artifacts', 'tasks', 'task_debug', 'preprocess');
    fs.mkdirSync(preprocessDir, { recursive: true });
    const manifest: PreprocessArtifacts = {
      normalizedFileName: 'clip.mp4',
      metadataExtractedAt: '2026-03-13T10:00:00.000Z',
      artifactsDir: 'artifacts/tasks/task_debug/preprocess',
      manifestPath: 'artifacts/tasks/task_debug/preprocess/manifest.json',
      framePlan: {
        strategy: 'uniform-sampling-ffmpeg-v1',
        targetFrameCount: 2,
        sampleTimestamps: [1.2, 2.4],
      },
      sampledFrames: [
        {
          index: 1,
          timestampSeconds: 1.2,
          fileName: 'frame-01.jpg',
          relativePath: 'artifacts/tasks/task_debug/preprocess/frame-01.jpg',
        },
        {
          index: 2,
          timestampSeconds: 2.4,
          fileName: 'frame-02.jpg',
          relativePath: 'artifacts/tasks/task_debug/preprocess/frame-02.jpg',
        },
      ],
    };
    fs.writeFileSync(path.join(preprocessDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const context = loadDebugArtifactsContext(preprocessDir);
    const snapshot = buildAlgorithmBaselineDebugSnapshot(context, buildPoseResult());
    const markdown = renderAlgorithmBaselineMarkdown(snapshot);

    assert.equal(context.manifestFound, true);
    assert.equal(context.artifacts.framePlan.strategy, 'uniform-sampling-ffmpeg-v1');
    assert.equal(snapshot.report.visualEvidence?.overlayFrames.length, 2);
    assert.match(markdown, /## Pose Summary/);
    assert.match(markdown, /## Scoring Evidence/);
  });
});

test('loadDebugArtifactsContext reconstructs sampled frames when manifest is missing', () => {
  withTempDir((workspace) => {
    const preprocessDir = path.join(workspace, 'artifacts', 'tasks', 'task_debug', 'preprocess');
    fs.mkdirSync(preprocessDir, { recursive: true });
    fs.writeFileSync(path.join(preprocessDir, 'frame-01.jpg'), 'frame-01');
    fs.writeFileSync(path.join(preprocessDir, 'frame-02.jpg'), 'frame-02');

    const context = loadDebugArtifactsContext(preprocessDir);
    const snapshot = buildAlgorithmBaselineDebugSnapshot(context, buildPoseResult());
    const markdown = renderAlgorithmBaselineMarkdown(snapshot);

    assert.equal(context.manifestFound, false);
    assert.equal(context.artifacts.framePlan.strategy, 'debug-frame-scan-fallback');
    assert.equal(context.artifacts.sampledFrames.length, 2);
    assert.match(context.assumptions.join(' '), /manifest\.json is missing/);
    assert.equal(snapshot.report.visualEvidence?.overlayFrames[0]?.index, 1);
    assert.match(markdown, /\| 1 \| usable \| rear_left_oblique \| right \|/);
  });
});
