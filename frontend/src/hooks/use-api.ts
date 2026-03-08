"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseApiOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

export function useApi<T, P = void>(apiCall: (params: P) => Promise<T>, options?: UseApiOptions<T>) {
  const t = useTranslations("common");
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const execute = useCallback(
    async (params: P): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiCall(params);
        setData(result);
        optionsRef.current?.onSuccess?.(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : t("errors.unknown");
        setError(message);
        optionsRef.current?.onError?.(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiCall, t],
  );

  return { data, loading, error, execute };
}
