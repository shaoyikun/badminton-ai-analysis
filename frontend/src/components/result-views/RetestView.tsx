import type { PoseResult, ReportResult, RetestComparison } from '../../hooks/useAnalysisTask'
import { buildAssetUrl, ComparisonCard } from './shared'

export function RetestView({ report, poseResult, comparison }: { report: ReportResult; poseResult: PoseResult | null; comparison: RetestComparison | null }) {
  return (
    <>
      <ComparisonCard comparison={comparison} />
      {report.preprocess?.artifacts?.framePlan ? (
        <div className="result-card">
          <h3>抽帧计划</h3>
          <ul>
            <li><span>策略</span><strong>{report.preprocess.artifacts.framePlan.strategy}</strong></li>
            <li><span>目标帧数</span><strong>{report.preprocess.artifacts.framePlan.targetFrameCount}</strong></li>
            <li><span>实际帧清单</span><strong>{report.preprocess.artifacts.sampledFrames?.length ?? 0} 个</strong></li>
          </ul>
        </div>
      ) : null}
      {report.preprocess?.artifacts?.sampledFrames?.length ? (
        <div className="result-card">
          <h3>关键帧调试视图</h3>
          <div className="frame-grid">
            {report.preprocess.artifacts.sampledFrames.map((frame) => {
              const poseFrame = poseResult?.frames.find((item) => item.frameIndex === frame.index)
              return (
                <div key={frame.fileName} className="frame-card">
                  <img src={buildAssetUrl(frame.relativePath)} alt={`关键帧 ${frame.index}`} />
                  <div className="frame-meta"><strong>帧 {frame.index}</strong><span>{frame.timestampSeconds}s</span></div>
                  {poseFrame?.metrics ? <div className="frame-metrics"><span>{poseFrame.metrics.summaryText}</span></div> : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </>
  )
}
