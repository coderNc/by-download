"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

export function useThemeMode() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return {
    theme,
    setTheme,
    resolvedTheme,
    isDark: resolvedTheme === "dark",
    mounted,
  };
}
