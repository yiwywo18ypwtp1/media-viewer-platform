// Whisper output -> transcript segments -> WebVTT subtitles. Pure functions
// (tested in transcript.test.ts); the transcribe job does the I/O.

export type Segment = { startMs: number; endMs: number; text: string };

type WhisperResponse = {
  language?: string;
  segments?: { start?: number; end?: number; text?: string }[];
};

// whisper.cpp names the language ("russian"); the subtitle track needs a
// BCP 47 code ("ru"). The languages we expect, plus codes passed through.
const LANGUAGE_CODES: Record<string, string> = {
  english: "en",
  russian: "ru",
  ukrainian: "uk",
  german: "de",
  french: "fr",
  spanish: "es",
  italian: "it",
  polish: "pl",
};

function languageCode(language: string | undefined): string | null {
  const name = language?.trim().toLowerCase();
  if (!name) return null;
  if (/^[a-z]{2}$/.test(name)) return name;
  return LANGUAGE_CODES[name] ?? null;
}

// whisper.cpp's /inference with response_format=verbose_json (the OpenAI
// shape): times in seconds. Empty lines are dropped and times kept in order.
export function parseWhisper(json: WhisperResponse): { language: string | null; segments: Segment[] } {
  const segments: Segment[] = [];
  for (const raw of json.segments ?? []) {
    const text = (raw.text ?? "").trim();
    if (!text || typeof raw.start !== "number" || typeof raw.end !== "number") continue;
    const startMs = Math.max(0, Math.round(raw.start * 1000));
    segments.push({ startMs, endMs: Math.max(startMs, Math.round(raw.end * 1000)), text });
  }
  return { language: languageCode(json.language), segments };
}

// 3723456 -> "01:02:03.456"
export function vttTime(ms: number): string {
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms % 1000, 3)}`;
}

// Cue text is markup in WebVTT: escape it, and "-->" may not appear at all.
function escapeCue(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("--&gt;", "→");
}

export function toWebVtt(segments: Segment[]): string {
  const cues = segments.map(
    (segment, index) => `${index + 1}\n${vttTime(segment.startMs)} --> ${vttTime(segment.endMs)}\n${escapeCue(segment.text)}\n`,
  );
  return ["WEBVTT\n", ...cues].join("\n");
}
