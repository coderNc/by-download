"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Languages, Monitor, Moon, RefreshCw, ShieldCheck, Sun, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useApi } from "@/hooks/use-api";
import { useLocale } from "@/hooks/use-locale";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { type Locale, type ThemeMode } from "@/lib/constants";
import { fetchHealth, fetchSettings, importCookies, removeCookies, saveSettings, updateYtdlp } from "@/lib/api";
import type { SettingsPayload } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings-store";

const FORMAT_OPTIONS = ["mp4", "webm", "mp3"] as const;
const COOKIE_PLATFORMS = ["bilibili", "youtube"] as const;

export default function SettingsPage() {
  const t = useTranslations("settings");
  const setSettings = useSettingsStore((state) => state.setSettings);
  const settings = useSettingsStore((state) => state.settings);
  const { locale, setLocale } = useLocale();
  const { theme, setTheme, mounted } = useThemeMode();
  const fetchSettingsApi = useCallback(() => fetchSettings(), []);
  const fetchHealthApi = useCallback(() => fetchHealth(), []);
  const updateYtdlpApi = useCallback(() => updateYtdlp(), []);

  const settingsQuery = useApi(fetchSettingsApi, { onSuccess: setSettings, onError: (message) => toast.error(message) });
  const saveMutation = useApi(saveSettings, { onSuccess: setSettings, onError: (message) => toast.error(message) });
  const healthQuery = useApi(fetchHealthApi, { onError: (message) => toast.error(message) });
  const cookiesMutation = useApi(importCookies, {
    onSuccess: () => toast.success(t("cookies_saved")),
    onError: (message) => toast.error(message),
  });
  const deleteCookiesMutation = useApi(removeCookies, {
    onSuccess: () => toast.success(t("cookies_deleted")),
    onError: (message) => toast.error(message),
  });
  const ytdlpMutation = useApi(updateYtdlpApi, {
    onSuccess: (result) => {
      if (result.success) {
        toast.success(t("update_success"));
        return;
      }
      toast.error(result.message);
    },
    onError: (message) => toast.error(message),
  });
  const [form, setForm] = useState<Partial<SettingsPayload>>({});
  const [cookiePlatform, setCookiePlatform] = useState<(typeof COOKIE_PLATFORMS)[number]>("bilibili");
  const [cookieContent, setCookieContent] = useState("");
  const { execute: loadSettings } = settingsQuery;
  const { execute: loadHealth } = healthQuery;

  const refresh = useCallback(async () => {
    await Promise.all([loadSettings(undefined as never), loadHealth(undefined as never)]);
  }, [loadHealth, loadSettings]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolvedForm = useMemo(
    () => ({
      default_format: form.default_format ?? settings?.default_format ?? "mp4",
      default_quality: form.default_quality ?? settings?.default_quality ?? "best",
      max_concurrent_downloads: form.max_concurrent_downloads ?? settings?.max_concurrent_downloads ?? 3,
      download_dir: form.download_dir ?? settings?.download_dir ?? "",
      rate_limit: form.rate_limit ?? settings?.rate_limit ?? 0,
      proxy: form.proxy ?? settings?.proxy ?? "",
      auto_delete_days: form.auto_delete_days ?? settings?.auto_delete_days ?? 7,
    }),
    [form, settings],
  );

  const statusCards = useMemo(
    () => [
      {
        label: t("active_downloads"),
        value: `${healthQuery.data?.active_downloads ?? 0}`,
      },
      {
        label: t("queued_downloads"),
        value: `${healthQuery.data?.queued_downloads ?? 0}`,
      },
      {
        label: t("tools_label.ytdlp"),
        value: healthQuery.data?.ytdlp_version ?? settings?.ytdlp_version ?? "-",
      },
      {
        label: t("tools_label.ffmpeg"),
        value: settings?.ffmpeg_installed ? t("ffmpeg_ready") : t("ffmpeg_missing"),
      },
    ],
    [healthQuery.data, settings?.ffmpeg_installed, settings?.ytdlp_version, t],
  );

  const handleSave = async () => {
    const payload = {
      default_format: resolvedForm.default_format,
      default_quality: resolvedForm.default_quality,
      download_dir: resolvedForm.download_dir,
      proxy: resolvedForm.proxy,
      max_concurrent_downloads: Math.max(1, Number(resolvedForm.max_concurrent_downloads) || 1),
      rate_limit: Math.max(0, Number(resolvedForm.rate_limit) || 0),
      auto_delete_days: Math.max(0, Number(resolvedForm.auto_delete_days) || 0),
    };

    await saveMutation.execute(payload);
    setForm({});
    toast.success(t("save_success"));
    await refresh();
  };

  const handleCookieImport = async () => {
    if (!cookieContent.trim()) {
      toast.error(t("cookie_hint"));
      return;
    }

    await cookiesMutation.execute({ platform: cookiePlatform, cookie_content: cookieContent.trim() });
    setCookieContent("");
    await refresh();
  };

  const handleCookieDelete = async () => {
    await deleteCookiesMutation.execute(cookiePlatform);
    await refresh();
  };

  const handleYtdlpUpdate = async () => {
    await ytdlpMutation.execute(undefined as never);
    await refresh();
  };

  const loading = settingsQuery.loading || healthQuery.loading;

  return (
    <div className="space-y-6">
      <GlassCard className="space-y-3" hoverable>
        <h1 className="text-3xl font-bold text-slate-950 dark:text-white">{t("title")}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t("subtitle")}</p>
      </GlassCard>

      <section className="grid gap-4 md:grid-cols-4">
        {statusCards.map((item) => (
          <GlassCard key={item.label} className="space-y-3" hoverable>
            <div className="text-sm text-slate-500 dark:text-slate-400">{item.label}</div>
            <div className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{item.value}</div>
          </GlassCard>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <GlassCard className="space-y-6" hoverable>
          <div className="flex items-center gap-3">
            <Wrench className="size-5 text-violet-500" />
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">{t("download")}</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium">{t("download_path")}</span>
                <input
                  value={resolvedForm.download_dir}
                  onChange={(event) => setForm((current) => ({ ...current, download_dir: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/6"
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="font-medium">{t("default_format")}</span>
              <select
                value={resolvedForm.default_format}
                onChange={(event) => setForm((current) => ({ ...current, default_format: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/6"
              >
                {FORMAT_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {t(`formats.${item}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="font-medium">{t("default_quality")}</span>
              <select
                value={resolvedForm.default_quality}
                onChange={(event) => setForm((current) => ({ ...current, default_quality: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/6"
              >
                {(["best", "worst", "bestaudio"] as const).map((q) => (
                  <option key={q} value={q}>{t(`qualities.${q}.label`)}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(`qualities.${resolvedForm.default_quality in { best: 1, worst: 1, bestaudio: 1 } ? resolvedForm.default_quality : "best"}.hint`)}
              </p>
            </label>

            <label className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="font-medium">{t("max_concurrent")}</span>
              <input
                type="number"
                min={1}
                max={10}
                value={resolvedForm.max_concurrent_downloads}
                onChange={(event) => setForm((current) => ({ ...current, max_concurrent_downloads: Number(event.target.value) }))}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/6"
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="font-medium">{t("rate_limit")}</span>
              <input
                type="number"
                min={0}
                value={resolvedForm.rate_limit}
                onChange={(event) => setForm((current) => ({ ...current, rate_limit: Number(event.target.value) }))}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/6"
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="font-medium">{t("auto_delete_days")}</span>
              <input
                type="number"
                min={0}
                value={resolvedForm.auto_delete_days}
                onChange={(event) => setForm((current) => ({ ...current, auto_delete_days: Number(event.target.value) }))}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/6"
              />
            </label>
          </div>

          <label className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <span className="font-medium">{t("proxy")}</span>
            <input
              value={resolvedForm.proxy}
              onChange={(event) => setForm((current) => ({ ...current, proxy: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/6"
              placeholder={t("placeholders.proxy")}
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <Button className="rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white" onClick={handleSave} disabled={saveMutation.loading || loading}>
              {saveMutation.loading ? t("saving") : t("save_button")}
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
          </div>
        </GlassCard>

        <div className="space-y-6">
          <GlassCard className="space-y-5" hoverable>
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-emerald-500" />
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">{t("integration")}</h2>
            </div>
            <label className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="font-medium">{t("cookie_platform")}</span>
              <select
                value={cookiePlatform}
                onChange={(event) => setCookiePlatform(event.target.value as (typeof COOKIE_PLATFORMS)[number])}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/6"
              >
                {COOKIE_PLATFORMS.map((item) => (
                  <option key={item} value={item}>
                    {t(`platforms.${item}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="font-medium">{t("cookie_content")}</span>
              <textarea
                value={cookieContent}
                onChange={(event) => setCookieContent(event.target.value)}
                className="min-h-36 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/6"
                placeholder={t("placeholders.cookies")}
              />
            </label>
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{t("cookie_hint")}</p>
            <div className="rounded-2xl border border-white/40 bg-white/60 px-4 py-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/6 dark:text-slate-200">
              <div className="font-medium text-slate-950 dark:text-white">{t("cookie_status")}</div>
              <div className="mt-1">{settings?.cookie_status === "available" ? t("cookie_available") : t("cookie_missing")}</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-white" onClick={handleCookieImport} disabled={cookiesMutation.loading}>
                {t("import_cookies")}
              </Button>
              <Button variant="outline" className="rounded-full" onClick={handleCookieDelete} disabled={deleteCookiesMutation.loading}>
                {t("delete_cookies")}
              </Button>
            </div>
          </GlassCard>

          <GlassCard className="space-y-5" hoverable>
            <div className="flex items-center gap-3">
              <Wrench className="size-5 text-amber-500" />
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">{t("tools")}</h2>
            </div>
            <div className="grid gap-3 text-sm text-slate-700 dark:text-slate-300">
              <div className="rounded-2xl border border-white/40 bg-white/60 px-4 py-4 dark:border-white/10 dark:bg-white/6">
                <div className="font-medium text-slate-950 dark:text-white">{t("tools_label.ytdlp")}</div>
                <div className="mt-1">{settings?.ytdlp_version ?? "-"}</div>
              </div>
              <div className="rounded-2xl border border-white/40 bg-white/60 px-4 py-4 dark:border-white/10 dark:bg-white/6">
                <div className="font-medium text-slate-950 dark:text-white">{t("tools_label.ffmpeg")}</div>
                <div className="mt-1">{settings?.ffmpeg_version || (settings?.ffmpeg_installed ? t("ffmpeg_ready") : t("ffmpeg_missing"))}</div>
              </div>
            </div>
            <Button className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white" onClick={handleYtdlpUpdate} disabled={ytdlpMutation.loading}>
              {ytdlpMutation.loading ? t("updating") : t("update_ytdlp")}
            </Button>
          </GlassCard>

          <GlassCard className="space-y-5" hoverable>
            <div className="flex items-center gap-3">
              <Monitor className="size-5 text-sky-500" />
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">{t("appearance")}</h2>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("theme.title")}</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { value: "light", label: t("theme.light"), icon: Sun },
                  { value: "dark", label: t("theme.dark"), icon: Moon },
                  { value: "system", label: t("theme.system"), icon: Monitor },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value as ThemeMode)}
                    className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm transition ${mounted && theme === value ? "border-violet-400 bg-violet-500 text-white" : "border-slate-200 bg-white/80 text-slate-700 dark:border-white/10 dark:bg-white/6 dark:text-slate-200"}`}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("locale.title")}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { value: "zh-CN", label: t("locale.zh-CN") },
                  { value: "en", label: t("locale.en") },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLocale(value as Locale)}
                    className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm transition ${locale === value ? "border-sky-400 bg-sky-500 text-white" : "border-slate-200 bg-white/80 text-slate-700 dark:border-white/10 dark:bg-white/6 dark:text-slate-200"}`}
                  >
                    <Languages className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </GlassCard>
        </div>
      </section>
    </div>
  );
}
