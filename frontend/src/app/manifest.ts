import type { MetadataRoute } from "next";

import { getMessages } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/request-locale";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getRequestLocale();
  const messages = getMessages(locale);

  return {
    name: messages.common.metadata.manifest_name,
    short_name: messages.common.metadata.manifest_short_name,
    description: messages.common.metadata.manifest_description,
    start_url: "/",
    display: "standalone",
    background_color: "#060816",
    theme_color: "#0f111a",
    icons: [
      {
        src: "/file.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
