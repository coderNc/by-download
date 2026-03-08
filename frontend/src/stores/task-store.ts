"use client";

import { create } from "zustand";

import type { ParsedVideo, TaskItem } from "@/lib/types";

interface TaskStore {
  parsedVideos: ParsedVideo[];
  tasks: TaskItem[];
  queueStats: { queued: number; active: number };
  setParsedVideos: (videos: ParsedVideo[]) => void;
  setTasks: (tasks: TaskItem[]) => void;
  setQueueStats: (stats: { queued: number; active: number }) => void;
  upsertTask: (task: Partial<TaskItem> & { id: string }) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  parsedVideos: [],
  tasks: [],
  queueStats: { queued: 0, active: 0 },
  setParsedVideos: (parsedVideos) => set({ parsedVideos }),
  setTasks: (tasks) => set({ tasks }),
  setQueueStats: (queueStats) => set({ queueStats }),
  upsertTask: (task) =>
    set((state) => {
      const index = state.tasks.findIndex((item) => item.id === task.id);
      if (index === -1) {
        const baseTask: TaskItem = {
          id: task.id,
          url: task.url ?? "",
          platform: task.platform ?? "unknown",
          status: task.status ?? "queued",
          progress: task.progress ?? 0,
          is_playlist_item: task.is_playlist_item ?? false,
        };
        return {
          tasks: [
            {
              ...baseTask,
              ...task,
            },
            ...state.tasks,
          ],
        };
      }
      const next = [...state.tasks];
      next[index] = { ...next[index], ...task };
      return { tasks: next };
    }),
}));
