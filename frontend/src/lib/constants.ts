export const APP_NAME = "BY-DOWNLOADER";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/progress";

export const LOCALES = ["zh-CN", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh-CN";

export const THEMES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEMES)[number];

export const TASK_STATUSES = [
  "queued",
  "downloading",
  "processing",
  "merging",
  "completed",
  "failed",
  "paused",
  "cancelled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
