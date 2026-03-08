"use client";

import { useEffect } from "react";

export function useClipboardListener(onMatch: (value: string) => void, enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const handleFocus = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (/(youtube\.com|youtu\.be|bilibili\.com|b23\.tv)/i.test(text)) {
          onMatch(text.trim());
        }
      } catch {}
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [enabled, onMatch]);
}
