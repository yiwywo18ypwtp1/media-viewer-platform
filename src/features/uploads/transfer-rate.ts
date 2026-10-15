// Speed over a sliding window: smooth enough to read, still reacts to changes
// (a lifetime average would barely move after the first minute).

export type RateSample = { time: number; bytes: number };

export const RATE_WINDOW_MS = 5000;

export function addSample(samples: RateSample[], sample: RateSample): RateSample[] {
  return [...samples, sample].filter((s) => sample.time - s.time <= RATE_WINDOW_MS);
}

export function estimateTransfer(samples: RateSample[], totalBytes: number) {
  if (samples.length < 2) return { bytesPerSecond: null, etaSeconds: null };

  const first = samples[0];
  const last = samples[samples.length - 1];
  const seconds = (last.time - first.time) / 1000;
  // Bytes can go *down* when a paused/failed part restarts, so clamp at 0.
  const bytesPerSecond = seconds > 0 ? Math.max(0, (last.bytes - first.bytes) / seconds) : 0;
  if (bytesPerSecond === 0) return { bytesPerSecond: 0, etaSeconds: null };

  return { bytesPerSecond, etaSeconds: Math.ceil((totalBytes - last.bytes) / bytesPerSecond) };
}
