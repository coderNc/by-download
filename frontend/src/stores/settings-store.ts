"use client";

import { create } from "zustand";

import type { SettingsPayload } from "@/lib/types";

interface SettingsStore {
  settings: SettingsPayload | null;
  setSettings: (settings: SettingsPayload) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings }),
}));
