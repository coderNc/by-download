"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { WS_BASE_URL } from "@/lib/constants";
import { triggerBrowserDownload } from "@/lib/download";
import { notifyBrowser } from "@/hooks/use-browser-notification";
import type { TaskStatus } from "@/lib/constants";
import { useTaskStore } from "@/stores/task-store";

export function useTaskStream(enabled = true) {
  const t = useTranslations("common");
  const upsertTask = useTaskStore((state) => state.upsertTask);
  const setQueueStats = useTaskStore((state) => state.setQueueStats);
  const autoDownloadedTaskIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const socket = new WebSocket(WS_BASE_URL);

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as Record<string, unknown>;
        if (payload.type === "queue_update") {
          setQueueStats({
            queued: typeof payload.queued === "number" ? payload.queued : 0,
            active: typeof payload.active === "number" ? payload.active : 0,
          });
          return;
        }

        if (typeof payload.task_id !== "string") {
          return;
        }

        if (payload.type === "progress") {
          upsertTask({
            id: payload.task_id,
            progress: typeof payload.progress === "number" ? payload.progress : typeof payload.percent === "number" ? payload.percent : 0,
            speed: typeof payload.speed === "number" ? payload.speed : null,
            eta: typeof payload.eta === "number" ? payload.eta : null,
          });
          return;
        }

        if (payload.type === "status_change") {
          const nextStatus = typeof payload.status === "string" ? (payload.status as TaskStatus) : "queued";
          if (nextStatus !== "completed") {
            autoDownloadedTaskIdsRef.current.delete(payload.task_id);
          }
          upsertTask({
            id: payload.task_id,
            status: nextStatus,
            error_message: typeof payload.error_message === "string" ? payload.error_message : null,
          });
        }

        if (payload.status === "completed") {
          if (autoDownloadedTaskIdsRef.current.has(payload.task_id)) {
            return;
          }
          autoDownloadedTaskIdsRef.current.add(payload.task_id);
          triggerBrowserDownload(payload.task_id);
          toast.success(t("notifications.download_completed"));
          notifyBrowser(t("notifications.download_completed_title"), t("notifications.download_completed_body"));
        }

        if (payload.status === "failed") {
          toast.error(typeof payload.error_message === "string" ? payload.error_message : t("notifications.download_failed"));
        }
      } catch (error) {
        console.error(t("notifications.stream_parse_failed"), error);
      }
    };

    return () => socket.close();
  }, [enabled, setQueueStats, t, upsertTask]);
}
