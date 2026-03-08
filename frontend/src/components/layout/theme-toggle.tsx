"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme, mounted } = useThemeMode();

  if (!mounted) return <div className="h-9 w-9" />;

  return (
    <div className="flex items-center rounded-full bg-black/5 p-1 dark:bg-white/5">
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 rounded-full transition-all",
          theme === "light" && "bg-white shadow-sm dark:bg-zinc-800"
        )}
        onClick={() => setTheme("light")}
      >
        <Sun className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 rounded-full transition-all",
          theme === "dark" && "bg-white shadow-sm dark:bg-zinc-800"
        )}
        onClick={() => setTheme("dark")}
      >
        <Moon className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 rounded-full transition-all",
          theme === "system" && "bg-white shadow-sm dark:bg-zinc-800"
        )}
        onClick={() => setTheme("system")}
      >
        <Monitor className="h-4 w-4" />
      </Button>
    </div>
  );
}
