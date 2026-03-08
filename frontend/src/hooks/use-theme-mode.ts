"use client";

import { useTheme } from "next-themes";

export function useThemeMode() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return {
    theme,
    setTheme,
    resolvedTheme,
    isDark: resolvedTheme === "dark",
    mounted: true,
  };
}
