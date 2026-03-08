import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/constants";

import commonEn from "@/messages/en/common.json";
import detailEn from "@/messages/en/detail.json";
import downloadsEn from "@/messages/en/downloads.json";
import historyEn from "@/messages/en/history.json";
import homeEn from "@/messages/en/home.json";
import settingsEn from "@/messages/en/settings.json";
import commonZh from "@/messages/zh-CN/common.json";
import detailZh from "@/messages/zh-CN/detail.json";
import downloadsZh from "@/messages/zh-CN/downloads.json";
import historyZh from "@/messages/zh-CN/history.json";
import homeZh from "@/messages/zh-CN/home.json";
import settingsZh from "@/messages/zh-CN/settings.json";

export function isLocale(value: string): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

export function resolveLocale(input?: string | null): Locale {
  if (input) {
    if (isLocale(input)) {
      return input;
    }

    const normalized = input.toLowerCase();
    if (normalized.startsWith("zh")) {
      return "zh-CN";
    }
    if (normalized.startsWith("en")) {
      return "en";
    }
  }
  return DEFAULT_LOCALE;
}

export function getMessages(locale: Locale) {
  if (locale === "en") {
    return {
      common: commonEn,
      home: homeEn,
      downloads: downloadsEn,
      history: historyEn,
      settings: settingsEn,
      detail: detailEn,
    };
  }

  return {
    common: commonZh,
    home: homeZh,
    downloads: downloadsZh,
    history: historyZh,
    settings: settingsZh,
    detail: detailZh,
  };
}
