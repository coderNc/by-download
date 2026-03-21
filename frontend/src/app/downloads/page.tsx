"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Pause, Play, RefreshCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useApi } from "@/hooks/use-api";
import { triggerBrowserDownload } from "@/lib/download";
import { bulkUpdateTasks, fetchTasks, removeTask, updateTask } from "@/lib/api";
import { useTaskStore } from "@/stores/task-store";

export default function DownloadsPage() {
  const t = useTranslations("downloads");
  const commonT = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const platformLabels = {
    youtube: commonT("platforms.youtube"),
    bilibili: commonT("platforms.bilibili"),
    unknown: commonT("platforms.unknown"),
  };
  const setTasks = useTaskStore((state) => state.setTasks);
  const tasks = useTaskStore((state) => state.tasks);
  const queueStats = useTaskStore((state) => state.queueStats);
  const fetchTasksApi = useCallback(() => fetchTasks(), []);
  const { execute } = useApi(fetchTasksApi);
  const bulkMutation = useApi(bulkUpdateTasks, {
    onError: (message) => toast.error(message),
  });
  const focusTaskId = searchParams.get("focus");

  const refreshTasks = useCallback(async () => {
    const result = await execute(undefined as never);
    if (result) {
      setTasks(result.tasks);
    }
    return result;
  }, [execute, setTasks]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    if (!focusTaskId || tasks.length === 0) {
      return;
    }

    const element = document.getElementById(`download-task-${focusTaskId}`);
    if (!element) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setFocusedTaskId(focusTaskId);
      element.scrollIntoView({ behavior: "smooth", block: "center" });

      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("focus");
      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `/downloads?${nextQuery}` : "/downloads", { scroll: false });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusTaskId, router, searchParams, tasks]);

  useEffect(() => {
    if (!focusedTaskId) {
      return;
    }

    const clearHighlightTimer = window.setTimeout(() => {
      setFocusedTaskId((current) => (current === focusedTaskId ? null : current));
    }, 2400);

    return () => window.clearTimeout(clearHighlightTimer);
  }, [focusedTaskId]);

  const counts = useMemo(() => {
    const summary = {
      queued: 0,
      downloading: 0,
      paused: 0,
      failed: 0,
      completed: 0,
    };

    for (const task of tasks) {
      if (task.status === "queued") {
        summary.queued += 1;
      } else if (task.status === "downloading") {
        summary.downloading += 1;
      } else if (task.status === "paused") {
        summary.paused += 1;
      } else if (task.status === "failed") {
        summary.failed += 1;
      } else if (task.status === "completed") {
        summary.completed += 1;
      }
    }

    return summary;
  }, [tasks]);

  const queueCards = useMemo(
    () => [
      { label: t("summary.queued"), value: `${counts.queued}`, accent: "text-slate-900 dark:text-white" },
      { label: t("summary.active"), value: `${counts.downloading}`, accent: "text-sky-600 dark:text-sky-300" },
      { label: t("summary.paused"), value: `${counts.paused}`, accent: "text-amber-600 dark:text-amber-300" },
      { label: t("summary.failed"), value: `${counts.failed}`, accent: "text-rose-600 dark:text-rose-300" },
      { label: t("summary.completed"), value: `${counts.completed}`, accent: "text-emerald-600 dark:text-emerald-300" },
    ],
    [counts.completed, counts.downloading, counts.failed, counts.paused, counts.queued, t],
  );

  const handleBulkAction = useCallback(
    async (action: "pause_all" | "resume_all" | "retry_failed" | "clear_completed") => {
      const result = await bulkMutation.execute({ action });
      if (!result) {
        return;
      }

      if (result.affected > 0) {
        toast.success(t(`bulk.${action}.success`, { count: result.affected }));
      } else {
        toast.message(t(`bulk.${action}.empty`));
      }

      await refreshTasks();
    },
    [bulkMutation, refreshTasks, t],
  );

  return (
    <div className="space-y-6">
      <GlassCard className="space-y-3" hoverable>
        <h1 className="text-3xl font-bold text-slate-950 dark:text-white">{t("title")}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t("subtitle")}</p>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {t("live_queue", { queued: queueStats.queued, active: queueStats.active })}
        </div>
      </GlassCard>

      <section className="grid gap-4 md:grid-cols-5">
        {queueCards.map((item) => (
          <GlassCard key={item.label} className="space-y-2" hoverable>
            <div className="text-xs text-slate-500 dark:text-slate-400">{item.label}</div>
            <div className={`text-2xl font-black tracking-tight ${item.accent}`}>{item.value}</div>
          </GlassCard>
        ))}
      </section>

      <GlassCard className="space-y-4" hoverable>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-950 dark:text-white">{t("bulk.title")}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{t("bulk.subtitle")}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleBulkAction("pause_all")} disabled={bulkMutation.loading || (counts.queued + counts.downloading === 0)}>
              {t("bulk.pause_all.action")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleBulkAction("resume_all")} disabled={bulkMutation.loading || counts.paused === 0}>
              {t("bulk.resume_all.action")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleBulkAction("retry_failed")} disabled={bulkMutation.loading || counts.failed === 0}>
              {t("bulk.retry_failed.action")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleBulkAction("clear_completed")} disabled={bulkMutation.loading || counts.completed === 0}>
              {t("bulk.clear_completed.action")}
            </Button>
          </div>
        </div>
      </GlassCard>

      <div className="space-y-4">
        {tasks.length === 0 ? (
          <GlassCard className="text-sm text-slate-500 dark:text-slate-400">{t("empty")}</GlassCard>
        ) : (
          tasks.map((task) => (
            <GlassCard id={`download-task-${task.id}`} key={task.id} className={`space-y-4 transition-all duration-500 ${focusedTaskId === task.id ? "ring-2 ring-violet-400/70 ring-offset-2 ring-offset-transparent" : ""}`} hoverable>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <Link href={`/downloads/${task.id}`} className="text-base font-semibold text-slate-950 dark:text-white">
                    {task.title ?? task.url}
                  </Link>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t("status_line", {
                      platform: platformLabels[task.platform as keyof typeof platformLabels] ?? platformLabels.unknown,
                      status: commonT(`task_status.${task.status}`),
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {task.status === "completed" ? (
                    <Button variant="outline" size="sm" aria-label={commonT("actions.download")} onClick={() => triggerBrowserDownload(task.id)}>
                      <Download className="size-4" />
                    </Button>
                  ) : null}
                  {task.status === "queued" || task.status === "downloading" || task.status === "paused" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={task.status === "paused" ? commonT("actions.resume") : commonT("actions.pause")}
                      onClick={() => void updateTask(task.id, task.status === "paused" ? "resume" : "pause")}
                    >
                      {task.status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
                    </Button>
                  ) : null}
                  {task.status === "failed" ? (
                    <Button variant="outline" size="sm" aria-label={commonT("actions.retry")} onClick={() => void updateTask(task.id, "retry")}>
                      <RefreshCcw className="size-4" />
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={commonT("actions.delete")}
                    onClick={() =>
                      void removeTask(task.id).then(() => {
                        setTasks(useTaskStore.getState().tasks.filter((item) => item.id !== task.id));
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{task.progress.toFixed(1)}%</span>
                  <span>{task.speed ? t("speed_value", { value: (task.speed / 1024 / 1024).toFixed(2) }) : t("unknown_speed")}</span>
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );
}
