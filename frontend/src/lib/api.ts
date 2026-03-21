import ky, { HTTPError } from "ky";

import { API_BASE_URL } from "@/lib/constants";
import type {
  CookieImportPayload,
  CookieMutationResponse,
  CookieVerifyPayload,
  CreateDownloadPayload,
  HealthPayload,
  HistoryClearPayload,
  HistoryQueryParams,
  HistoryStatsPayload,
  ParsedVideo,
  SettingsPayload,
  TaskBulkActionPayload,
  TaskBulkActionResponse,
  TaskItem,
  TaskListResponse,
  YtdlpUpdatePayload,
} from "@/lib/types";

export const api = ky.create({
  prefixUrl: API_BASE_URL,
  timeout: 60000,
});

async function withApiDetail<T>(request: Promise<T>) {
  try {
    return await request;
  } catch (error) {
    if (error instanceof HTTPError) {
      const payload = await error.response.json<{ detail?: string }>().catch(() => null);
      if (payload?.detail) {
        throw new Error(payload.detail);
      }
    }
    throw error;
  }
}

export async function parseUrls(urls: string[]) {
  return api.post("parse", { json: { urls } }).json<{ videos: ParsedVideo[]; errors: Array<Record<string, string>> }>();
}

export async function createDownloads(downloads: CreateDownloadPayload[]) {
  return api.post("download/batch", { json: { downloads } }).json<TaskListResponse>();
}

export async function checkDuplicate(url: string) {
  return api.post("check-duplicate", { json: { url } }).json<{ is_duplicate: boolean; existing_task?: TaskItem | null }>();
}

export async function fetchTasks(status?: string) {
  return api.get("tasks", { searchParams: status ? { status } : undefined }).json<TaskListResponse>();
}

export async function fetchTask(taskId: string) {
  return api.get(`tasks/${taskId}`).json<TaskItem>();
}

export async function updateTask(taskId: string, action: string) {
  return api.patch(`tasks/${taskId}`, { json: { action } }).json<Record<string, unknown>>();
}

export async function removeTask(taskId: string) {
  return api.delete(`tasks/${taskId}`).json<Record<string, unknown>>();
}

export async function fetchHistory(params?: HistoryQueryParams) {
  const searchParams: Record<string, string> = {};

  if (params?.page) {
    searchParams.page = String(params.page);
  }
  if (params?.limit) {
    searchParams.limit = String(params.limit);
  }
  if (params?.search && params.search.trim()) {
    searchParams.search = params.search.trim();
  }
  if (params?.platform && params.platform !== "all") {
    searchParams.platform = params.platform;
  }
  if (params?.status && params.status !== "all") {
    searchParams.status = params.status;
  }

  return api.get("history", { searchParams }).json<TaskListResponse>();
}

export async function fetchHistoryStats() {
  return api.get("history/stats").json<HistoryStatsPayload>();
}

export async function clearHistory(days: number) {
  return api.delete("history/clear", { searchParams: { days: String(days) } }).json<HistoryClearPayload>();
}

export async function fetchSettings() {
  return api.get("settings").json<SettingsPayload>();
}

export async function saveSettings(payload: Partial<SettingsPayload>) {
  return api.put("settings", { json: payload }).json<SettingsPayload>();
}

export async function fetchHealth() {
  return api.get("health").json<HealthPayload>();
}

export async function importCookies(payload: CookieImportPayload) {
  return withApiDetail(api.post("settings/cookies", { json: payload }).json<CookieMutationResponse>());
}

export async function removeCookies(platform: string) {
  return withApiDetail(api.delete(`settings/cookies/${platform}`).json<CookieMutationResponse>());
}

export async function verifyCookies(platform: string) {
  return withApiDetail(api.post(`settings/cookies/${platform}/verify`).json<CookieVerifyPayload>());
}

export async function updateYtdlp() {
  return api.post("settings/ytdlp-update").json<YtdlpUpdatePayload>();
}

export async function bulkUpdateTasks(payload: TaskBulkActionPayload) {
  return withApiDetail(api.post("tasks/bulk", { json: payload }).json<TaskBulkActionResponse>());
}
