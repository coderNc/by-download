"use client";

import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

import { useTaskStream } from "@/hooks/use-task-stream";
import { getMessages } from "@/lib/i18n";
import { LocaleRuntimeProvider, useLocale } from "@/hooks/use-locale";
import type { Locale } from "@/lib/constants";

interface AppProvidersProps {
  children: React.ReactNode;
  initialLocale: Locale;
}

function TaskStreamBridge() {
  useTaskStream(true);
  return null;
}

function IntlBridge({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();

  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Shanghai">
      <TaskStreamBridge />
      {children}
      <Toaster richColors position="top-right" />
    </NextIntlClientProvider>
  );
}

export function AppProviders({ children, initialLocale }: AppProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <LocaleRuntimeProvider initialLocale={initialLocale}>
        <IntlBridge>{children}</IntlBridge>
      </LocaleRuntimeProvider>
    </ThemeProvider>
  );
}
