"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarClock, Clock3, HardDrive } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FallbackImage } from "@/components/ui/fallback-image";
import { GlassCard } from "@/components/ui/glass-card";
import { useApi } from "@/hooks/use-api";
import { fetchHistory } from "@/lib/api";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";

function statusClass(status?: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
    case "failed":
      return "bg-rose-500/15 text-rose-600 dark:text-rose-300";
    case "downloading":
    case "processing":
    case "merging":
      return "bg-sky-500/15 text-sky-600 dark:text-sky-300";
    case "paused":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-300";
    default:
      return "bg-slate-500/15 text-slate-600 dark:text-slate-300";
  }
}

export default function HistoryPage() {
  const t = useTranslations("history");
  const commonT = useTranslations("common");
  const pageSize = 12;
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const platformLabels = {
    youtube: commonT("platforms.youtube"),
    bilibili: commonT("platforms.bilibili"),
    unknown: commonT("platforms.unknown"),
  };
  const historyQuery = useApi(fetchHistory);
  const { execute } = historyQuery;
  const tasks = useMemo(() => historyQuery.data?.tasks ?? [], [historyQuery.data?.tasks]);
  const total = historyQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, totalPages);

  const statusOptions = useMemo(
    () => ["queued", "downloading", "processing", "merging", "completed", "failed", "paused", "cancelled"],
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void execute({
        page: effectivePage,
        limit: pageSize,
        search: query,
        platform: platformFilter,
        status: statusFilter,
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [effectivePage, execute, pageSize, platformFilter, query, statusFilter]);

  return (
    <div className="space-y-6">
      <GlassCard className="space-y-3" hoverable>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950 dark:text-white">{t("title")}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t("subtitle")}</p>
          </div>
          <span className="inline-flex rounded-full bg-slate-500/10 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t("count", { count: total })}
          </span>
        </div>
      </GlassCard>

      <GlassCard className="grid gap-3 md:grid-cols-3" hoverable>
        <label className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{t("filters.query_label")}</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder={t("filters.query_placeholder")}
            className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none dark:border-white/10 dark:bg-white/6 dark:text-slate-200"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{t("filters.platform_label")}</span>
          <select
            value={platformFilter}
            onChange={(event) => {
              setPlatformFilter(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none dark:border-white/10 dark:bg-white/6 dark:text-slate-200"
          >
            <option value="all">{t("filters.all_platforms")}</option>
            <option value="youtube">{platformLabels.youtube}</option>
            <option value="bilibili">{platformLabels.bilibili}</option>
            <option value="unknown">{platformLabels.unknown}</option>
          </select>
        </label>

        <label className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{t("filters.status_label")}</span>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none dark:border-white/10 dark:bg-white/6 dark:text-slate-200"
          >
            <option value="all">{t("filters.all_statuses")}</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {commonT(`task_status.${status}`)}
              </option>
            ))}
          </select>
        </label>
      </GlassCard>

      <div className="space-y-4">
        {historyQuery.loading && tasks.length === 0 ? (
          <GlassCard className="text-sm text-slate-500 dark:text-slate-400">{t("loading")}</GlassCard>
        ) : total === 0 ? (
          <GlassCard className="text-sm text-slate-500 dark:text-slate-400">{t("empty")}</GlassCard>
        ) : (
          tasks.map((task) => (
            <GlassCard key={task.id} className="space-y-4" hoverable>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 flex-1 gap-4">
                  <FallbackImage
                    src={task.thumbnail_url}
                    alt={task.title ?? task.url ?? t("not_available")}
                    width={288}
                    height={160}
                    unoptimized
                    className="h-20 w-36 shrink-0 rounded-xl object-cover"
                    fallback={
                      <div className="flex h-20 w-36 shrink-0 items-center justify-center rounded-xl bg-slate-200/70 text-xs text-slate-500 dark:bg-white/10 dark:text-slate-400">
                        {platformLabels[task.platform as keyof typeof platformLabels] ?? platformLabels.unknown}
                      </div>
                    }
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link href={`/downloads/${task.id}`} className="block break-words text-base font-semibold text-slate-950 transition hover:text-violet-600 dark:text-white dark:hover:text-violet-300">
                      {task.title ?? task.url ?? t("not_available")}
                    </Link>
                    <div className="break-words text-xs text-slate-500 dark:text-slate-400">
                      {platformLabels[task.platform as keyof typeof platformLabels] ?? platformLabels.unknown} · {task.format_label ?? task.quality ?? t("quality_fallback")}
                    </div>
                    <div className="grid gap-2 text-xs text-slate-500 dark:text-slate-400 md:grid-cols-3">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3" />
                        {t("labels.duration")}: {formatDuration(task.duration) ?? t("not_available")}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <HardDrive className="size-3" />
                        {t("labels.file_size")}: {formatBytes(task.file_size) ?? t("not_available")}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3" />
                        {t("labels.completed_at")}: {formatDateTime(task.completed_at) ?? t("not_available")}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 self-start">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(task.status)}`}>
                    {commonT(`task_status.${task.status}`)}
                  </span>
                  <Link href={`/downloads/${task.id}`} className="text-xs font-semibold text-violet-600 hover:underline dark:text-violet-300">
                    {t("open_detail")}
                  </Link>
                </div>
              </div>

              {task.error_message ? (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
                  <div className="inline-flex items-center gap-1 font-semibold">
                    <AlertTriangle className="size-4" />
                    {t("labels.error")}
                  </div>
                  <div className="mt-1">{task.error_message}</div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/30 bg-white/60 px-4 py-3 text-xs dark:border-white/10 dark:bg-white/6">
                <div className="text-slate-500 dark:text-slate-400">{t("labels.file_path")}</div>
                <div className="mt-1 break-all font-mono text-slate-900 dark:text-slate-100">{task.file_path || t("not_available")}</div>
              </div>
            </GlassCard>
          ))
        )}

        {total > 0 ? (
          <GlassCard className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between" hoverable>
            <div className="text-xs text-slate-500 dark:text-slate-400">{t("showing", { shown: tasks.length, total })}</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={effectivePage <= 1 || historyQuery.loading}>
                {t("pagination.previous")}
              </Button>
              <span className="text-xs text-slate-600 dark:text-slate-300">{t("pagination.page", { page: effectivePage, total: totalPages })}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={effectivePage >= totalPages || historyQuery.loading}>
                {t("pagination.next")}
              </Button>
            </div>
          </GlassCard>
        ) : null}
      </div>
    </div>
  );
}
