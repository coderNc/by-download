"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, Download, History, Settings, Zap } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { LocaleToggle } from "./locale-toggle";
import { useTranslations } from "next-intl";

const navItems = [
  { href: "/", icon: Home, label: "nav.home" },
  { href: "/downloads", icon: Download, label: "nav.downloads" },
  { href: "/history", icon: History, label: "nav.history" },
  { href: "/settings", icon: Settings, label: "nav.settings" },
];

export function TopNav() {
  const pathname = usePathname();
  const t = useTranslations("common");

    return (
    <header className="fixed top-6 left-1/2 z-50 w-full max-w-5xl -translate-x-1/2 px-4">
      <nav className="glass flex h-16 items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 backdrop-blur-lg sm:px-6 dark:border-white/10 dark:bg-black/20">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="whitespace-nowrap bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-base font-bold text-transparent sm:text-lg dark:from-blue-400 dark:to-purple-400">
            {t("title")}
          </span>
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition-all duration-300 lg:px-4",
                  isActive
                    ? "bg-white/10 text-blue-600 dark:bg-white/5 dark:text-blue-400"
                    : "text-zinc-600 hover:bg-white/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive && "animate-pulse")} />
                {t(item.label)}
              </Link>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <LocaleToggle />
          <div className="h-4 w-[1px] bg-white/20 dark:bg-white/10" />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
