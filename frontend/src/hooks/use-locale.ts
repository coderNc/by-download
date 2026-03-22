"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/constants";
import { resolveLocale } from "@/lib/i18n";
import { useLocaleStore } from "@/stores/locale-store";

const LocaleHydrationContext = createContext<{
  initialLocale: Locale;
  hydrated: boolean;
}>({
  initialLocale: DEFAULT_LOCALE,
  hydrated: false,
});

export function LocaleRuntimeProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const persistedLocale = window.localStorage.getItem("by-downloader-locale");
    if (!persistedLocale && locale !== initialLocale) {
      setLocale(initialLocale);
      document.documentElement.lang = initialLocale;
    }

  }, [initialLocale, locale, setLocale]);

  const value = useMemo(
    () => ({
      initialLocale,
      hydrated,
    }),
    [hydrated, initialLocale],
  );

  return createElement(LocaleHydrationContext.Provider, { value }, children);
}

export function useLocale() {
  const { initialLocale, hydrated } = useContext(LocaleHydrationContext);
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  useEffect(() => {
    if (typeof window === "undefined" || !hydrated) {
      return;
    }
    const browserLocale = resolveLocale(window.navigator.language);
    if (!window.localStorage.getItem("by-downloader-locale")) {
      setLocale(browserLocale);
      document.documentElement.lang = browserLocale;
      return;
    }
    document.documentElement.lang = locale || initialLocale;
  }, [hydrated, initialLocale, locale, setLocale]);

  return useMemo(
    () => ({
      locale: ((hydrated ? locale : initialLocale) || initialLocale) as Locale,
      setLocale,
      mounted: hydrated,
    }),
    [hydrated, initialLocale, locale, setLocale],
  );
}
