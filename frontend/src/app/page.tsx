"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Clock3, Download, GripVertical, LoaderCircle, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FallbackImage } from "@/components/ui/fallback-image";
import { GlassCard } from "@/components/ui/glass-card";
import { useApi } from "@/hooks/use-api";
import { requestBrowserNotificationPermission } from "@/hooks/use-browser-notification";
import { useClipboardListener } from "@/hooks/use-clipboard-listener";
import { checkDuplicate, createDownloads, fetchSettings, parseUrls } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { CreateDownloadPayload, ParsedVideo, VideoFormat } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings-store";
import { useTaskStore } from "@/stores/task-store";

type BatchQualityMode = "default" | "highest" | "lowest";

type QualityDialogState =
  | {
      mode: "single";
      video: ParsedVideo;
      indexToRemove: number;
      selectedFormatId: string;
    }
  | {
      mode: "batch";
      selectedStrategy: BatchQualityMode;
    };

export default function Home() {
  const t = useTranslations("home");
  const commonT = useTranslations("common");
  const router = useRouter();
  const [urls, setUrls] = useState("");
  const [audioOnly, setAudioOnly] = useState(false);
  const [downloadSubtitles, setDownloadSubtitles] = useState(false);
  const [showAllParsedVideos, setShowAllParsedVideos] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [activeSingleDownloadIndex, setActiveSingleDownloadIndex] = useState<number | null>(null);
  const [queuedFeedbackIndex, setQueuedFeedbackIndex] = useState<number | null>(null);
  const [qualityDialogState, setQualityDialogState] = useState<QualityDialogState | null>(null);
  const parsedVideos = useTaskStore((state) => state.parsedVideos);
  const setParsedVideos = useTaskStore((state) => state.setParsedVideos);
  const upsertTask = useTaskStore((state) => state.upsertTask);
  const settings = useSettingsStore((state) => state.settings);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const fetchSettingsApi = useCallback(() => fetchSettings(), []);
  const preferredFormat = settings?.default_format && settings.default_format !== "best" ? settings.default_format : "mp4";
  const platformLabels = useMemo(
    () => ({
      youtube: commonT("platforms.youtube"),
      bilibili: commonT("platforms.bilibili"),
      unknown: commonT("platforms.unknown"),
    }),
    [commonT],
  );

  const parseMutation = useApi(parseUrls, {
    onSuccess: (result) => {
      setParsedVideos(result.videos);
      if (result.errors.length > 0) {
        toast.warning(t("toasts.parse_partial", { success: result.videos.length, failed: result.errors.length }));
      } else {
        toast.success(t("toasts.parse_success", { count: result.videos.length }));
      }
    },
    onError: (message) => toast.error(message),
  });

  const downloadMutation = useApi(createDownloads, {
    onSuccess: () => toast.success(t("toasts.download_created")),
    onError: (message) => toast.error(message),
  });

  const settingsQuery = useApi(fetchSettingsApi, {
    onSuccess: setSettings,
    onError: (message) => toast.error(message),
  });
  const { execute: loadSettings } = settingsQuery;

  useEffect(() => {
    if (settings) {
      return;
    }
    void loadSettings(undefined as never);
  }, [loadSettings, settings]);

  useClipboardListener(
    useCallback(
      (value: string) => {
        if (!urls.trim()) {
          setUrls(value);
        }
      },
      [urls],
    ),
  );

  useEffect(() => {
    setShowAllParsedVideos(false);
    setDraggedIndex(null);
    setDragOverIndex(null);
    setActiveSingleDownloadIndex(null);
    setQueuedFeedbackIndex(null);
    setQualityDialogState(null);
  }, [parsedVideos]);

  const getVideoFormats = useCallback((video: ParsedVideo) => video.formats.filter((item) => !item.is_audio_only), []);

  const getDefaultVideoFormat = useCallback(
    (video: ParsedVideo) => {
      const videoFormats = getVideoFormats(video);
      return videoFormats.find((item) => item.ext === preferredFormat) ?? videoFormats[0] ?? video.formats[0];
    },
    [getVideoFormats, preferredFormat],
  );

  const getFormatForStrategy = useCallback(
    (video: ParsedVideo, strategy: BatchQualityMode) => {
      const videoFormats = getVideoFormats(video);
      if (videoFormats.length === 0) {
        return video.formats[0];
      }

      if (strategy === "highest") {
        return videoFormats[videoFormats.length - 1];
      }

      if (strategy === "lowest") {
        return videoFormats[0];
      }

      return getDefaultVideoFormat(video);
    },
    [getDefaultVideoFormat, getVideoFormats],
  );

  const handleParse = async () => {
    const entries = urls
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    if (entries.length === 0) {
      toast.error(t("toasts.paste_required"));
      return;
    }

    await parseMutation.execute(entries);
  };

  const buildDownloadPayload = useCallback(
    (video: ParsedVideo, selectedFormat?: VideoFormat): CreateDownloadPayload => {
      const resolvedFormat = audioOnly ? undefined : selectedFormat ?? getDefaultVideoFormat(video);

      return {
        url: video.url,
        title: video.title,
        channel: video.channel,
        thumbnail_url: video.thumbnail_url,
        duration: video.duration,
        format_id: resolvedFormat?.format_id,
        format_label: audioOnly ? "MP3 audio" : resolvedFormat?.label,
        quality: settings?.default_quality ?? "best",
        extract_audio: audioOnly,
        audio_format: audioOnly ? "mp3" : undefined,
        download_subtitles: downloadSubtitles,
        subtitle_langs: downloadSubtitles ? Object.keys(video.subtitles).slice(0, 2) : [],
        playlist_id: video.playlist_id,
        playlist_title: video.playlist_title,
        is_playlist_item: video.is_playlist,
      };
    },
    [audioOnly, downloadSubtitles, getDefaultVideoFormat, settings?.default_quality],
  );

  const createDownloadsForVideos = useCallback(
    async (videos: ParsedVideo[], formatResolver?: (video: ParsedVideo) => VideoFormat | undefined) => {
      if (videos.length === 0) {
        return null;
      }

      await requestBrowserNotificationPermission();

      const duplicateChecks = await Promise.all(videos.map((video) => checkDuplicate(video.url)));
      const duplicates = duplicateChecks.filter((item) => item.is_duplicate).length;
      if (duplicates > 0) {
        toast.message(t("toasts.duplicates_found", { count: duplicates }));
      }

      return downloadMutation.execute(videos.map((video) => buildDownloadPayload(video, formatResolver?.(video))));
    },
    [buildDownloadPayload, downloadMutation, t],
  );

  const queueSingleDownload = useCallback(
    async (video: ParsedVideo, indexToRemove: number, selectedFormat?: VideoFormat) => {
      setActiveSingleDownloadIndex(indexToRemove);
      const createdTasks = await createDownloadsForVideos([video], () => selectedFormat);
      if (createdTasks) {
        const createdTask = createdTasks.tasks[0];
        if (createdTask) {
          upsertTask(createdTask);
        }
        setQueuedFeedbackIndex(indexToRemove);
        window.setTimeout(() => {
          const currentParsedVideos = useTaskStore.getState().parsedVideos;
          setParsedVideos(currentParsedVideos.filter((_, index) => index !== indexToRemove));
        }, 900);
        if (createdTask?.id) {
          window.setTimeout(() => {
            router.push(`/downloads?focus=${createdTask.id}`);
          }, 250);
        }
      }
      setActiveSingleDownloadIndex(null);
    },
    [createDownloadsForVideos, router, setParsedVideos, upsertTask],
  );

  const queueBatchDownload = useCallback(
    async (strategy: BatchQualityMode = "default") => {
      const createdTasks = await createDownloadsForVideos(parsedVideos, (video) => getFormatForStrategy(video, strategy));
      if (createdTasks) {
        setParsedVideos([]);
      }
    },
    [createDownloadsForVideos, getFormatForStrategy, parsedVideos, setParsedVideos],
  );

  const handleBatchDownload = async () => {
    if (parsedVideos.length === 0) {
      toast.error(t("toasts.nothing_parsed"));
      return;
    }

    if (audioOnly) {
      await queueBatchDownload();
      return;
    }

    setQualityDialogState({ mode: "batch", selectedStrategy: "default" });
  };

  const handleSingleDownload = async (video: ParsedVideo, indexToRemove: number) => {
    if (audioOnly) {
      await queueSingleDownload(video, indexToRemove);
      return;
    }

    const defaultFormat = getDefaultVideoFormat(video);
    if (!defaultFormat) {
      await queueSingleDownload(video, indexToRemove);
      return;
    }

    setQualityDialogState({
      mode: "single",
      video,
      indexToRemove,
      selectedFormatId: defaultFormat.format_id,
    });
  };

  const handleConfirmQualitySelection = async () => {
    if (!qualityDialogState) {
      return;
    }

    if (qualityDialogState.mode === "single") {
      const selectedFormat =
        getVideoFormats(qualityDialogState.video).find((item) => item.format_id === qualityDialogState.selectedFormatId) ??
        getDefaultVideoFormat(qualityDialogState.video);
      setQualityDialogState(null);
      await queueSingleDownload(qualityDialogState.video, qualityDialogState.indexToRemove, selectedFormat);
      return;
    }

    const strategy = qualityDialogState.selectedStrategy;
    setQualityDialogState(null);
    await queueBatchDownload(strategy);
  };

  const handleRemoveParsedVideo = (indexToRemove: number) => {
    const currentParsedVideos = useTaskStore.getState().parsedVideos;
    setParsedVideos(currentParsedVideos.filter((_, index) => index !== indexToRemove));
  };

  const handleClearParsedVideos = () => {
    setParsedVideos([]);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const next = [...useTaskStore.getState().parsedVideos];
    const [movedVideo] = next.splice(draggedIndex, 1);
    if (!movedVideo) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    next.splice(index, 0, movedVideo);
    setParsedVideos(next);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const batchQualityOptions = useMemo(
    () => [
      {
        value: "default" as const,
        label: t("quality_modal.batch.default.label"),
        description: t("quality_modal.batch.default.description", { format: preferredFormat.toUpperCase() }),
      },
      {
        value: "highest" as const,
        label: t("quality_modal.batch.highest.label"),
        description: t("quality_modal.batch.highest.description"),
      },
      {
        value: "lowest" as const,
        label: t("quality_modal.batch.lowest.label"),
        description: t("quality_modal.batch.lowest.description"),
      },
    ],
    [preferredFormat, t],
  );

  const dialogVideoFormats = useMemo(() => {
    if (!qualityDialogState || qualityDialogState.mode !== "single") {
      return [];
    }
    return getVideoFormats(qualityDialogState.video);
  }, [getVideoFormats, qualityDialogState]);

  const visibleParsedVideos = showAllParsedVideos ? parsedVideos : parsedVideos.slice(0, 6);

  return (
    <div className="space-y-10">
      <section className="mx-auto max-w-4xl space-y-5 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-violet-600 dark:border-white/10 dark:bg-white/6 dark:text-violet-300">
          <Sparkles className="size-4" />
          {t("welcome")}
        </div>
        <h1 className="mx-auto max-w-4xl text-4xl font-black tracking-tight text-gradient md:text-6xl">{t("subtitle")}</h1>
      </section>

      <GlassCard className="mx-auto max-w-5xl p-3 sm:p-5" hoverable>
        <textarea
          className="min-h-48 w-full resize-none rounded-[24px] bg-transparent px-4 py-4 text-base leading-7 text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
          placeholder={t("input_placeholder")}
          value={urls}
          onChange={(event) => setUrls(event.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 pb-2 pt-4 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <button type="button" className={`rounded-full px-3 py-1 ${audioOnly ? "bg-violet-500 text-white" : "bg-slate-200/70 dark:bg-white/10"}`} onClick={() => setAudioOnly((value) => !value)}>
              {t("audio_only")}
            </button>
            <button type="button" className={`rounded-full px-3 py-1 ${downloadSubtitles ? "bg-violet-500 text-white" : "bg-slate-200/70 dark:bg-white/10"}`} onClick={() => setDownloadSubtitles((value) => !value)}>
              {t("subtitles")}
            </button>
            <span>{t("platforms")}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-full" onClick={handleParse} disabled={parseMutation.loading}>
              {parseMutation.loading ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin" />
                  {t("parsing")}
                </span>
              ) : (
                t("parse")
              )}
            </Button>
          </div>
        </div>
      </GlassCard>

      <section className="mx-auto max-w-5xl">
        <GlassCard className="space-y-4" hoverable>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">{t("parse_queue")}</h2>
              <span className="text-sm text-slate-500 dark:text-slate-400">{t("items_count", { count: parsedVideos.length })}</span>
            </div>
            {parsedVideos.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button className="rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white" size="sm" onClick={() => void handleBatchDownload()} disabled={downloadMutation.loading}>
                  <span>{t("download_all")}</span>
                  <ArrowRight className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" className="rounded-full text-slate-500 dark:text-slate-300" onClick={handleClearParsedVideos}>
                  <Trash2 className="size-3.5" />
                  {t("clear_queue")}
                </Button>
              </div>
            ) : null}
          </div>
          <div className="space-y-3">
            {parsedVideos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-10 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                {t("empty_preview")}
              </div>
            ) : (
              visibleParsedVideos.map((video, index) => {
                const actualIndex = index;
                const duration = formatDuration(video.duration);
                const platformLabel = platformLabels[video.platform as keyof typeof platformLabels] ?? platformLabels.unknown;
                const playlistIndex = video.playlist_index;
                const cardKey = `${video.url}-${playlistIndex ?? "single"}-${actualIndex}`;
                const isSingleDownloadLoading = activeSingleDownloadIndex === actualIndex;
                const isSingleDownloadQueued = queuedFeedbackIndex === actualIndex;
                const isDragTarget = dragOverIndex === actualIndex && draggedIndex !== null && draggedIndex !== actualIndex;

                return (
                  <div
                    key={cardKey}
                    draggable={parsedVideos.length > 1}
                    onDragStart={() => handleDragStart(actualIndex)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (dragOverIndex !== actualIndex) {
                        setDragOverIndex(actualIndex);
                      }
                    }}
                    onDrop={() => handleDrop(actualIndex)}
                    onDragEnd={() => {
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    className={`rounded-2xl border bg-white/60 p-2.5 transition ${isDragTarget ? "border-violet-400 ring-2 ring-violet-400/30" : "border-white/40"} dark:border-white/10 dark:bg-white/6`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="mt-1 inline-flex cursor-grab text-slate-400 active:cursor-grabbing dark:text-slate-500">
                          <GripVertical className="size-4" />
                        </span>
                        <div className="relative h-16 w-28 overflow-hidden rounded-xl bg-slate-200/70 dark:bg-white/10">
                          <FallbackImage
                            src={video.thumbnail_url}
                            alt={video.title}
                            width={224}
                            height={128}
                            unoptimized
                            className="h-full w-full object-cover"
                            fallback={
                              <div className="flex h-full w-full items-center justify-center px-3 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                {platformLabel}
                              </div>
                            }
                          />
                          {duration ? (
                            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-slate-950/80 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                              <Clock3 className="size-3" />
                              {duration}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">{video.title}</div>
                          </div>
                          <Button
                            variant={isSingleDownloadQueued ? "secondary" : "outline"}
                            size="xs"
                            className="rounded-full"
                            onClick={() => void handleSingleDownload(video, actualIndex)}
                            disabled={downloadMutation.loading}
                          >
                            {isSingleDownloadQueued ? <Check className="size-3.5" /> : isSingleDownloadLoading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                            {isSingleDownloadQueued ? t("queued_feedback") : isSingleDownloadLoading ? t("queueing") : t("download_now")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                            onClick={() => handleRemoveParsedVideo(actualIndex)}
                            aria-label={t("remove_item")}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                          <span className="inline-flex rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-700 dark:text-violet-300">
                            {platformLabel}
                          </span>
                          {video.is_playlist && playlistIndex !== null && playlistIndex !== undefined ? (
                            <span className="inline-flex rounded-full bg-slate-500/10 px-2.5 py-1 text-slate-600 dark:text-slate-300">
                              #{playlistIndex}
                            </span>
                          ) : null}
                        </div>
                        <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                          <div className="truncate">{video.channel ?? t("unknown_channel")}</div>
                          <div className="truncate">
                            {t("formats_count", { count: video.formats.length })}
                            {video.is_playlist && video.playlist_title ? ` · ${video.playlist_title}` : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {parsedVideos.length > 6 ? (
            <div className="flex justify-center pt-1">
              <Button variant="ghost" size="sm" className="rounded-full text-slate-500 dark:text-slate-300" onClick={() => setShowAllParsedVideos((current) => !current)}>
                {showAllParsedVideos ? t("show_less") : t("show_more", { count: parsedVideos.length - 6 })}
              </Button>
            </div>
          ) : null}
        </GlassCard>
      </section>

      {qualityDialogState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <GlassCard className={`w-full ${qualityDialogState.mode === "single" ? "max-w-lg space-y-3 p-4" : "max-w-2xl space-y-5 p-5"} border border-white/50 bg-white/88 shadow-2xl dark:border-white/10 dark:bg-slate-950/92`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <h3 className={`font-bold text-slate-950 dark:text-white ${qualityDialogState.mode === "single" ? "text-base" : "text-xl"}`}>{t("quality_modal.title")}</h3>
                <p className={`text-slate-600 dark:text-slate-300 ${qualityDialogState.mode === "single" ? "truncate text-xs" : "text-sm"}`}>
                  {qualityDialogState.mode === "single"
                    ? t("quality_modal.single.subtitle", { title: qualityDialogState.video.title })
                    : t("quality_modal.batch.subtitle", { count: parsedVideos.length })}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" className="shrink-0 rounded-full" onClick={() => setQualityDialogState(null)}>
                <X className="size-4" />
              </Button>
            </div>

            <div className={`${qualityDialogState.mode === "single" ? "max-h-72 space-y-1.5 overflow-y-auto" : "space-y-3"}`}>
              {qualityDialogState.mode === "single"
                ? dialogVideoFormats.map((format) => {
                    const isSelected = qualityDialogState.selectedFormatId === format.format_id;
                    const isDefault = getDefaultVideoFormat(qualityDialogState.video)?.format_id === format.format_id;

                    return (
                      <button
                        key={format.format_id}
                        type="button"
                        onClick={() =>
                          setQualityDialogState((current) =>
                            current && current.mode === "single"
                              ? { ...current, selectedFormatId: format.format_id }
                              : current,
                          )
                        }
                        className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                          isSelected
                            ? "border-violet-500 bg-violet-500/10 shadow-sm"
                            : "border-slate-200/80 bg-white/75 hover:border-violet-300 dark:border-white/10 dark:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-slate-950 dark:text-white">{format.label}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{format.format_id}</div>
                          </div>
                          {isDefault ? (
                            <span className="shrink-0 inline-flex rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                              {t("quality_modal.settings_default")}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })
                : batchQualityOptions.map((option) => {
                    const isSelected = qualityDialogState.selectedStrategy === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setQualityDialogState((current) =>
                            current && current.mode === "batch"
                              ? { ...current, selectedStrategy: option.value }
                              : current,
                          )
                        }
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                          isSelected
                            ? "border-violet-500 bg-violet-500/10 shadow-sm"
                            : "border-slate-200/80 bg-white/75 hover:border-violet-300 dark:border-white/10 dark:bg-white/5"
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-950 dark:text-white">{option.label}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{option.description}</div>
                      </button>
                    );
                  })}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" className="rounded-full" onClick={() => setQualityDialogState(null)}>
                {t("quality_modal.cancel")}
              </Button>
              <Button className="rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white" onClick={() => void handleConfirmQualitySelection()} disabled={downloadMutation.loading}>
                {downloadMutation.loading ? t("queueing") : t("quality_modal.confirm")}
              </Button>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
