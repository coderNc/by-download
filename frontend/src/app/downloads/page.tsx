"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download, Pause, Play, RefreshCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useApi } from "@/hooks/use-api";
import { triggerBrowserDownload } from "@/lib/download";
import { fetchTasks, removeTask, updateTask } from "@/lib/api";
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
  const fetchTasksApi = useCallback(() => fetchTasks(), []);
  const { execute } = useApi(fetchTasksApi);
  const focusTaskId = searchParams.get("focus");

  useEffect(() => {
    void execute(undefined as never).then((result) => {
      if (result) {
        setTasks(result.tasks);
      }
    });
  }, [execute, setTasks]);

  useEffect(() => {
    if (!focusTaskId || tasks.length === 0) {
      return;
    }

    const element = document.getElementById(`download-task-${focusTaskId}`);
    if (!element) {
      return;
    }

    setFocusedTaskId(focusTaskId);
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("focus");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/downloads?${nextQuery}` : "/downloads", { scroll: false });
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

  return (
    <div className="space-y-6">
      <GlassCard className="space-y-3" hoverable>
        <h1 className="text-3xl font-bold text-slate-950 dark:text-white">{t("title")}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t("subtitle")}</p>
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
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={task.status === "paused" ? commonT("actions.resume") : commonT("actions.pause")}
                    onClick={() => void updateTask(task.id, task.status === "paused" ? "resume" : "pause")}
                  >
                    {task.status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
                  </Button>
                  <Button variant="outline" size="sm" aria-label={commonT("actions.retry")} onClick={() => void updateTask(task.id, "retry")}>
                    <RefreshCcw className="size-4" />
                  </Button>
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
