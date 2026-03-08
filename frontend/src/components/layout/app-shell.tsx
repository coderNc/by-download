"use client";

import React from "react";

import { TopNav } from "@/components/layout/top-nav";
import { useThemeMode } from "@/hooks/use-theme-mode";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { mounted } = useThemeMode();

  if (!mounted) {
    return null;
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-background font-sans transition-colors duration-500">
      <div className="fixed -left-24 -top-24 h-96 w-96 rounded-full bg-violet-500/12 blur-3xl" />
      <div className="fixed -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-500/12 blur-3xl" />
      <div className="fixed left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/6 blur-[140px]" />
      <TopNav />
      <main className="relative pb-16 pt-32">
        <div className="container mx-auto max-w-6xl px-4">{children}</div>
      </main>
    </div>
  );
}
