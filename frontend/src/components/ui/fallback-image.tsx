"use client";

import Image, { type ImageProps } from "next/image";
import { useState, type ReactNode } from "react";

import { API_BASE_URL } from "@/lib/constants";

interface FallbackImageProps extends Omit<ImageProps, "src"> {
  src?: string | null;
  fallback: ReactNode;
}

function normalizeImageSrc(src?: string | null) {
  if (!src) {
    return null;
  }

  if (src.startsWith("//")) {
    return `https:${src}`;
  }

  if (src.startsWith("http://")) {
    return `https://${src.slice("http://".length)}`;
  }

  return src;
}

function toDisplayImageSrc(src?: string | null) {
  const normalizedSrc = normalizeImageSrc(src);
  if (!normalizedSrc) {
    return null;
  }

  if (/^https?:\/\//.test(normalizedSrc)) {
    return `${API_BASE_URL}/thumbnail?url=${encodeURIComponent(normalizedSrc)}`;
  }

  return normalizedSrc;
}

export function FallbackImage({ src, alt, fallback, onError, ...props }: FallbackImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const normalizedSrc = toDisplayImageSrc(src);
  const failed = normalizedSrc !== null && failedSrc === normalizedSrc;

  if (!normalizedSrc || failed) {
    return <>{fallback}</>;
  }

  return (
    <Image
      src={normalizedSrc}
      alt={alt}
      {...props}
      onError={(event) => {
        setFailedSrc(normalizedSrc);
        onError?.(event);
      }}
    />
  );
}
