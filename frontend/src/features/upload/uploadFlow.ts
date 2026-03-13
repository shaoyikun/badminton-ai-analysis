import uploadFlowConfigJson from '../../../../shared/upload-flow.json'
import type {
  ActionType,
  FlowActionTarget,
  FlowErrorCatalogItem,
  FlowErrorCode,
  UploadConstraints,
  UploadFlowConfig,
} from '../../../../shared/contracts'

export type UploadReadinessStatus = 'pass' | 'fail' | 'pending'

export type UploadReadinessItem = {
  id: string
  label: string
  status: UploadReadinessStatus
  detail: string
}

export type LocalVideoSummary = {
  fileName: string
  fileSizeBytes: number
  mimeType?: string
  extension: string
  durationSeconds?: number
}

const uploadFlowConfig = uploadFlowConfigJson as UploadFlowConfig

export const UPLOAD_CONSTRAINTS: UploadConstraints = uploadFlowConfig.constraints
export const FLOW_ERROR_CATALOG = uploadFlowConfig.errorCatalog
export const ACTION_LABELS = UPLOAD_CONSTRAINTS.supportedActionLabels

export const ACTION_GUIDE_COPY: Record<ActionType, { title: string; checklist: string[] }> = {
  clear: {
    title: '正手高远球拍摄重点',
    checklist: [
      '画面里要能看清引拍、击球、收拍和回位',
      '尽量保留非持拍手展开和转体过程',
      '击球点前后不要被裁切，整套动作保持连贯',
    ],
  },
}

const ACTION_TARGET_COPY: Record<FlowActionTarget, { label: string; to: string }> = {
  upload: { label: '重新上传', to: '/upload' },
  guide: { label: '查看拍摄指引', to: '/guide' },
}

export function getActionLabel(actionType: ActionType) {
  return ACTION_LABELS[actionType]
}

export function getErrorCatalogItem(errorCode?: FlowErrorCode | string, fallbackMessage?: string): FlowErrorCatalogItem & { errorCode?: string } {
  if (errorCode && errorCode in FLOW_ERROR_CATALOG) {
    return {
      ...FLOW_ERROR_CATALOG[errorCode as FlowErrorCode],
      errorCode,
    }
  }

  return {
    errorCode,
    title: '处理失败',
    summary: '这次分析没有顺利完成。',
    explanation: fallbackMessage ?? '你可以重新上传一段更规范的视频，再试一次。',
    suggestions: [
      '优先重新选择一段 5~15 秒、单人、机位稳定的视频',
      '如果问题重复出现，先回看拍摄指引再重拍',
    ],
    uploadBanner: fallbackMessage ?? '上一次任务没有顺利完成，请重新确认视频后再上传。',
    primaryAction: 'upload',
    secondaryAction: 'guide',
  }
}

export function getErrorRouteAction(target: FlowActionTarget) {
  return ACTION_TARGET_COPY[target]
}

export function getFileExtension(fileName: string) {
  const normalized = fileName.toLowerCase()
  const dotIndex = normalized.lastIndexOf('.')
  return dotIndex >= 0 ? normalized.slice(dotIndex) : ''
}

export function buildLocalVideoSummary(file: File, durationSeconds?: number): LocalVideoSummary {
  return {
    fileName: file.name,
    fileSizeBytes: file.size,
    mimeType: file.type,
    extension: getFileExtension(file.name),
    durationSeconds,
  }
}

export function isSupportedVideoFile(file: File | LocalVideoSummary) {
  const mimeType = file instanceof File ? file.type : file.mimeType
  const extension = file instanceof File ? getFileExtension(file.name) : file.extension
  const mimeMatches = mimeType?.startsWith('video/') ?? false
  return mimeMatches || UPLOAD_CONSTRAINTS.supportedExtensions.includes(extension)
}

export function buildUploadReadinessItems(file: File | null, summary: LocalVideoSummary | null): UploadReadinessItem[] {
  const maxSizeMb = Math.round(UPLOAD_CONSTRAINTS.defaultMaxFileSizeBytes / 1024 / 1024)

  return [
    {
      id: 'file',
      label: '已选择视频文件',
      status: file ? 'pass' : 'fail',
      detail: file ? '文件已就绪，可以继续校验。' : '还没有选择视频文件。',
    },
    {
      id: 'format',
      label: `文件格式受支持（${UPLOAD_CONSTRAINTS.supportedExtensions.join(' / ')})`,
      status: !file ? 'pending' : isSupportedVideoFile(file) ? 'pass' : 'fail',
      detail: !file
        ? '选择文件后会自动检查格式。'
        : isSupportedVideoFile(file)
          ? '文件格式符合当前 MVP 上传要求。'
          : '当前文件看起来不是受支持的视频格式，请重新选择。',
    },
    {
      id: 'size',
      label: `文件大小在限制内（约 ${maxSizeMb}MB 以内）`,
      status: !file
        ? 'pending'
        : file.size > UPLOAD_CONSTRAINTS.defaultMaxFileSizeBytes || file.size < UPLOAD_CONSTRAINTS.minFileSizeBytes
          ? 'fail'
          : 'pass',
      detail: !file
        ? '选择文件后会自动检查大小。'
        : file.size < UPLOAD_CONSTRAINTS.minFileSizeBytes
          ? '文件过小，通常说明内容不完整或文件异常。'
          : file.size > UPLOAD_CONSTRAINTS.defaultMaxFileSizeBytes
            ? '文件超过当前上传限制，请压缩或更换一段视频。'
            : '文件大小符合当前上传要求。',
    },
    {
      id: 'duration',
      label: `时长在 ${UPLOAD_CONSTRAINTS.minDurationSeconds}~${UPLOAD_CONSTRAINTS.maxDurationSeconds} 秒之间`,
      status: !file
        ? 'pending'
        : summary?.durationSeconds === undefined
          ? 'pending'
          : summary.durationSeconds < UPLOAD_CONSTRAINTS.minDurationSeconds || summary.durationSeconds > UPLOAD_CONSTRAINTS.maxDurationSeconds
            ? 'fail'
            : 'pass',
      detail: !file
        ? '选择文件后会自动读取时长。'
        : summary?.durationSeconds === undefined
          ? '正在读取视频时长，请稍候。'
          : summary.durationSeconds < UPLOAD_CONSTRAINTS.minDurationSeconds || summary.durationSeconds > UPLOAD_CONSTRAINTS.maxDurationSeconds
            ? '请重新选择或重拍一段更符合要求的视频。'
            : '时长符合当前 MVP 分析窗口。',
    },
  ]
}

export function getUploadBlockingReasons(
  readinessItems: UploadReadinessItem[],
  checklistConfirmed: boolean,
) {
  const reasons = readinessItems
    .filter((item) => item.status !== 'pass')
    .map((item) => item.detail)

  if (!checklistConfirmed) {
    reasons.push('请先确认拍摄要求和提交信息。')
  }

  return reasons
}
