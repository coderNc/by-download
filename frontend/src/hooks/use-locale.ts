"use client";

import { useEffect, useMemo } from "react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/constants";
import { resolveLocale } from "@/lib/i18n";
import { useLocaleStore } from "@/stores/locale-store";

export function useLocale() {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const browserLocale = resolveLocale(window.navigator.language);
    if (!window.localStorage.getItem("by-downloader-locale")) {
      setLocale(browserLocale);
      document.documentElement.lang = browserLocale;
      return;
    }
    document.documentElement.lang = locale || DEFAULT_LOCALE;
  }, [locale, setLocale]);

  return useMemo(
    () => ({
      locale: (locale || DEFAULT_LOCALE) as Locale,
      setLocale,
    }),
    [locale, setLocale],
  );
}
