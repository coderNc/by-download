"use client";

import { DEFAULT_LOCALE } from "@/lib/constants";
import { useLocaleStore } from "@/stores/locale-store";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";

export function LocaleToggle() {
  const { locale, setLocale } = useLocaleStore();

  const toggleLocale = () => {
    setLocale(locale === "zh-CN" ? "en" : "zh-CN");
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="flex items-center gap-2 rounded-full px-3 text-xs font-medium transition-all hover:bg-white/10 dark:hover:bg-white/5"
      onClick={toggleLocale}
    >
      <Languages className="h-4 w-4" />
      <span className="uppercase">{(locale || DEFAULT_LOCALE).split("-")[0]}</span>
    </Button>
  );
}
