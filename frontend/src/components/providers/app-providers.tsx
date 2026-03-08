"use client";

import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

import { useTaskStream } from "@/hooks/use-task-stream";
import { getMessages } from "@/lib/i18n";
import { useLocale } from "@/hooks/use-locale";

interface AppProvidersProps {
  children: React.ReactNode;
}

function TaskStreamBridge() {
  useTaskStream(true);
  return null;
}

export function AppProviders({ children }: AppProvidersProps) {
  const { locale } = useLocale();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Shanghai">
        <TaskStreamBridge />
        {children}
        <Toaster richColors position="top-right" />
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}
