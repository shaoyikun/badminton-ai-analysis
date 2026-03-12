import uploadFlowConfigJson from '../../../shared/upload-flow.json';
import type { FlowErrorCatalogItem, FlowErrorCode, UploadConstraints, UploadFlowConfig } from '../../../shared/contracts';

const uploadFlowConfig = uploadFlowConfigJson as UploadFlowConfig;

export const uploadConstraints: UploadConstraints = uploadFlowConfig.constraints;
export const flowErrorCatalog = uploadFlowConfig.errorCatalog;

export function getFlowErrorCatalogItem(errorCode: FlowErrorCode): FlowErrorCatalogItem {
  return flowErrorCatalog[errorCode];
}
