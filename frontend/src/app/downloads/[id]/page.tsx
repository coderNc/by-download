"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Download } from "lucide-react";

import { FallbackImage } from "@/components/ui/fallback-image";
import { GlassCard } from "@/components/ui/glass-card";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { fetchTask } from "@/lib/api";
import { triggerBrowserDownload } from "@/lib/download";
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

export default function DownloadDetailPage() {
  const params = useParams<{ id: string }>();
  const t = useTranslations("detail");
  const commonT = useTranslations("common");
  const detailQuery = useApi(fetchTask);
  const { execute } = detailQuery;

  useEffect(() => {
    if (params.id) {
      void execute(params.id);
    }
  }, [execute, params.id]);

  const task = detailQuery.data;
  const platformLabels = {
    youtube: commonT("platforms.youtube"),
    bilibili: commonT("platforms.bilibili"),
    unknown: commonT("platforms.unknown"),
  };
  const platformLabel = task?.platform ? platformLabels[task.platform as keyof typeof platformLabels] ?? platformLabels.unknown : platformLabels.unknown;
  const progress = Math.max(0, Math.min(100, task?.progress ?? 0));
  const hasSpeed = typeof task?.speed === "number" && Number.isFinite(task.speed);
  const speedText = hasSpeed ? `${((task?.speed ?? 0) / 1024 / 1024).toFixed(2)} ${t("units.mbps")}` : t("labels.not_available");
  const etaText = typeof task?.eta === "number" ? `${Math.max(0, Math.round(task.eta))}${t("units.seconds")}` : t("labels.not_available");
  const details = [
    { label: t("meta.platform"), value: platformLabel },
    { label: t("meta.channel"), value: task?.channel || t("labels.unknown") },
    { label: t("meta.duration"), value: formatDuration(task?.duration) || t("labels.not_available") },
    { label: t("meta.format"), value: task?.format_label || task?.format_id || t("labels.not_available") },
    { label: t("meta.quality"), value: task?.quality || t("labels.not_available") },
    { label: t("meta.file_size"), value: formatBytes(task?.file_size) || t("labels.not_available") },
  ];
  const timeline = [
    { label: t("meta.created_at"), value: formatDateTime(task?.created_at) || t("labels.not_available") },
    { label: t("meta.started_at"), value: formatDateTime(task?.started_at) || t("labels.not_available") },
    { label: t("meta.completed_at"), value: formatDateTime(task?.completed_at) || t("labels.not_available") },
    { label: t("meta.speed"), value: speedText },
    { label: t("meta.eta"), value: etaText },
  ];

  return (
    <div className="space-y-6">
      <GlassCard className="space-y-3" hoverable>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-slate-950 dark:text-white">{task?.title ?? t("fallback_title")}</h1>
            <p className="break-all text-sm text-slate-600 dark:text-slate-300">{task?.url ?? ""}</p>
            {detailQuery.loading && <p className="text-sm text-slate-500 dark:text-slate-400">{t("loading")}</p>}
          </div>
          <div className="flex items-center gap-3 self-start">
            {task?.status === "completed" ? (
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => triggerBrowserDownload(task.id)}>
                  <Download className="size-4" />
                  {t("download")}
              </Button>
            ) : null}
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(task?.status)}`}>
              {task?.status ? commonT(`task_status.${task.status}`) : t("labels.not_available")}
            </span>
          </div>
        </div>
        {task ? (
          <FallbackImage
            src={task.thumbnail_url}
            alt={t("labels.thumbnail")}
            width={1280}
            height={720}
            unoptimized
            className="h-56 w-full rounded-2xl object-cover"
            fallback={
              <div className="flex h-56 w-full items-center justify-center rounded-2xl bg-slate-200/70 text-sm font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">
                {platformLabel}
              </div>
            }
          />
        ) : null}
      </GlassCard>

      <GlassCard className="space-y-4" hoverable>
        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>{t("progress")}</span>
          <span>{progress.toFixed(1)}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${progress}%` }} />
        </div>
      </GlassCard>

      <section className="grid gap-6 xl:grid-cols-2">
        <GlassCard className="space-y-4" hoverable>
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">{t("info")}</h2>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            {details.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/30 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/6">
                <div className="text-xs text-slate-500 dark:text-slate-400">{item.label}</div>
                <div className="mt-1 break-all font-medium text-slate-900 dark:text-slate-100">{item.value}</div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="space-y-4" hoverable>
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">{t("sections.timeline")}</h2>
          <div className="grid gap-3 text-sm">
            {timeline.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/30 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/6">
                <span className="text-xs text-slate-500 dark:text-slate-400">{item.label}</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{item.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </section>

      <GlassCard className="space-y-3" hoverable>
        <h2 className="text-lg font-bold text-slate-950 dark:text-white">{t("sections.file")}</h2>
        <div className="space-y-3 text-sm">
          <div className="rounded-2xl border border-white/30 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/6">
            <div className="text-xs text-slate-500 dark:text-slate-400">{t("meta.file_path")}</div>
            <div className="mt-1 break-all font-mono text-slate-900 dark:text-slate-100">{task?.file_path || t("labels.not_available")}</div>
          </div>
          <div className="rounded-2xl border border-white/30 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/6">
            <div className="text-xs text-slate-500 dark:text-slate-400">{t("meta.subtitle_path")}</div>
            <div className="mt-1 break-all font-mono text-slate-900 dark:text-slate-100">{task?.subtitle_path || t("labels.not_available")}</div>
          </div>
        </div>
      </GlassCard>

      {task?.error_message ? (
        <GlassCard className="space-y-3 border border-rose-400/40 bg-rose-500/10" hoverable>
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
            <AlertTriangle className="size-4" />
            <span className="text-sm font-semibold">{t("sections.error")}</span>
          </div>
          <p className="text-sm text-rose-700 dark:text-rose-200">{task.error_message}</p>
        </GlassCard>
      ) : null}

      <GlassCard className="space-y-3" hoverable>
        <h2 className="text-lg font-bold text-slate-950 dark:text-white">{t("sections.logs")}</h2>
        <pre className="overflow-x-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">{task?.log_text?.trim() ? task.log_text : t("no_log")}</pre>
      </GlassCard>
    </div>
  );
}
