"use client";

import type Hls from "hls.js";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlaybackUrls } from "./playback";

export type Quality = { level: number; height: number };
export const AUTO_QUALITY = -1;

// Connects the <video> to the best source the browser can play:
//   1. HLS through hls.js (Chrome, Firefox, Edge: Media Source Extensions),
//   2. HLS natively (Safari, iOS),
//   3. the 720p MP4 (versions processed before HLS existed, or no MSE).
// Only (1) offers a quality choice; Safari picks the quality itself.
//
// hls.js (~150 KB gzipped) is imported on demand, so pages without a video
// never download it.
export function useVideoSource(videoRef: RefObject<HTMLVideoElement | null>, urls: PlaybackUrls) {
  const hlsRef = useRef<Hls | null>(null);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [quality, setQualityState] = useState(AUTO_QUALITY);
  // Set when HLS failed beyond repair: play the MP4 instead.
  const [hlsFailed, setHlsFailed] = useState(false);
  const useHls = Boolean(urls.hlsUrl) && !hlsFailed;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!useHls) {
      // src is assigned here rather than as a JSX prop: re-signing the same
      // key within the same second yields the *same* URL string, and React
      // wouldn't touch an unchanged prop, so the video would never reload
      // after an error. A new `urls` object = a reload.
      if (urls.videoUrl) video.src = urls.videoUrl;
      return;
    }

    const hlsUrl = urls.hlsUrl!;
    let cancelled = false;
    void import("hls.js").then(({ default: HlsClass }) => {
      if (cancelled) return;
      if (!HlsClass.isSupported()) {
        if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = hlsUrl;
        else setHlsFailed(true);
        return;
      }
      const hls = new HlsClass({ enableWorker: true });
      hlsRef.current = hls;
      hls.on(HlsClass.Events.MANIFEST_PARSED, (_event, data) => {
        setQualities(
          data.levels
            .map((level, index) => ({ level: index, height: level.height }))
            .filter((q) => q.height > 0) // an audio-only entry has no height
            .sort((a, b) => b.height - a.height),
        );
      });
      // hls.js retries single failed segments itself; only fatal errors land here.
      hls.on(HlsClass.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setHlsFailed(true);
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
    });

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      setQualities([]);
    };
  }, [urls, useHls, videoRef]);

  function setQuality(level: number) {
    setQualityState(level);
    // currentLevel switches right away (drops the buffered other quality);
    // -1 hands the choice back to hls.js's bandwidth estimate.
    if (hlsRef.current) hlsRef.current.currentLevel = level;
  }

  return { qualities, quality, setQuality, usingHls: useHls };
}
