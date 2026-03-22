"use client";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { Languages } from "lucide-react";

export function LocaleToggle() {
  const { locale, setLocale, mounted } = useLocale();

  const toggleLocale = () => {
    setLocale(locale === "zh-CN" ? "en" : "zh-CN");
  };

  if (!mounted) {
    return <div className="h-7 w-16" />;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="flex items-center gap-2 rounded-full px-3 text-xs font-medium transition-all hover:bg-white/10 dark:hover:bg-white/5"
      onClick={toggleLocale}
    >
      <Languages className="h-4 w-4" />
      <span className="uppercase">{locale.split("-")[0]}</span>
    </Button>
  );
}
