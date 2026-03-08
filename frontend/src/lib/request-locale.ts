import { headers } from "next/headers";

import { DEFAULT_LOCALE, type Locale } from "@/lib/constants";
import { resolveLocale } from "@/lib/i18n";

export async function getRequestLocale(): Promise<Locale> {
  const headerStore = await headers();
  const acceptLanguage = headerStore.get("accept-language");
  const preferred = acceptLanguage?.split(",")[0]?.trim();

  return preferred ? resolveLocale(preferred) : DEFAULT_LOCALE;
}
