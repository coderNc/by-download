import type { Locale, TaskStatus, ThemeMode } from "@/lib/constants";

export interface VideoFormat {
  format_id: string;
  ext: string;
  resolution?: string | null;
  fps?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  label: string;
  is_audio_only: boolean;
}

export interface ParsedVideo {
  url: string;
  platform: string;
  title: string;
  channel?: string | null;
  thumbnail_url?: string | null;
  duration?: number | null;
  formats: VideoFormat[];
  subtitles: Record<string, string>;
  is_playlist: boolean;
  playlist_id?: string | null;
  playlist_title?: string | null;
  playlist_index?: number | null;
}

export interface TaskItem {
  id: string;
  url: string;
  platform: string;
  title?: string | null;
  channel?: string | null;
  thumbnail_url?: string | null;
  duration?: number | null;
  format_id?: string | null;
  format_label?: string | null;
  quality?: string | null;
  file_path?: string | null;
  file_size?: number | null;
  status: TaskStatus;
  progress: number;
  speed?: number | null;
  eta?: number | null;
  error_message?: string | null;
  subtitle_path?: string | null;
  is_playlist_item: boolean;
  playlist_id?: string | null;
  playlist_title?: string | null;
  log_text?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface CreateDownloadPayload {
  url: string;
  title?: string | null;
  channel?: string | null;
  thumbnail_url?: string | null;
  duration?: number | null;
  format_id?: string;
  format_label?: string | null;
  quality?: string | null;
  extract_audio?: boolean;
  audio_format?: string;
  download_subtitles?: boolean;
  subtitle_langs?: string[];
  playlist_id?: string | null;
  playlist_title?: string | null;
  is_playlist_item?: boolean;
}

export interface TaskListResponse {
  tasks: TaskItem[];
  total: number;
}

export interface HistoryStatsPayload {
  total_downloads: number;
  total_size: number;
  platform_breakdown: Record<string, number>;
  recent_count: number;
}

export interface CookiePlatformStatus {
  platform: string;
  status: string;
  issue_code?: string | null;
  cookie_count: number;
  matching_cookie_count: number;
  valid_cookie_count: number;
  expired_cookie_count: number;
  domains: string[];
  expires_at?: string | null;
  last_checked_at?: string | null;
  has_session_cookie: boolean;
}

export interface HistoryQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  platform?: string;
  status?: string;
}

export interface SettingsPayload {
  default_format: string;
  default_quality: string;
  max_concurrent_downloads: number;
  download_dir: string;
  rate_limit: number;
  proxy: string;
  auto_delete_days: number;
  cookie_status?: string | null;
  cookie_expires?: string | null;
  cookie_platforms: Record<string, CookiePlatformStatus>;
  ytdlp_version: string;
  ffmpeg_installed: boolean;
  ffmpeg_version: string;
}

export interface HealthPayload {
  status: string;
  ytdlp_version: string;
  ffmpeg_installed: boolean;
  ffmpeg_version: string;
  active_downloads: number;
  queued_downloads: number;
}

export interface CookieImportPayload {
  platform: string;
  cookie_content: string;
}

export interface CookieMutationResponse {
  status: string;
  path?: string | null;
  platform: string;
  platform_status: CookiePlatformStatus;
}

export interface HistoryClearPayload {
  removed: number;
}

export interface YtdlpUpdatePayload {
  success: boolean;
  old_version: string;
  new_version: string;
  message: string;
}

export interface LocaleState {
  locale: Locale;
}

export interface ThemeState {
  theme: ThemeMode;
}
