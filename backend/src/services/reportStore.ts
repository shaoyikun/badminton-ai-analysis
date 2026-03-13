import type { ReportResult } from '../types/task';
import { getReportRow } from './taskRepository';

function parseReportJson(taskId: string, raw: string) {
  try {
    return JSON.parse(raw) as ReportResult;
  } catch (error) {
    throw new Error(
      `failed to parse stored report for task ${taskId}: ${error instanceof Error ? error.message : 'invalid JSON'}`,
    );
  }
}

export function readStoredReport(taskId: string) {
  const row = getReportRow(taskId);
  return row ? parseReportJson(taskId, row.report_json) : undefined;
}
