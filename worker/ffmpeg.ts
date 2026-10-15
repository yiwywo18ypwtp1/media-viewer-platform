import { spawn } from "node:child_process";
import { UnrecoverableError } from "bullmq";

// Thin wrappers around the ffmpeg/ffprobe binaries plus the pure parsing
// helpers they need (unit-tested in ffmpeg.test.ts).

export type MediaInfo =
  | { kind: "video"; durationMs: number; width: number; height: number; fps: number | null }
  | { kind: "image"; width: number; height: number };

type ProbeJson = {
  streams?: { codec_type?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }[];
  format?: { format_name?: string; duration?: string };
};

// "30000/1001" -> 29.97..., "0/0" or junk -> null
export function parseFps(rate: string | undefined): number | null {
  if (!rate) return null;
  const [num, den] = rate.split("/").map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0 || num === 0) return null;
  return num / den;
}

// Decides what the file *actually* is, regardless of the MIME type the
// browser claimed. Single images come through ffmpeg's "*_pipe"/"image2" demuxers.
export function parseProbe(json: ProbeJson): MediaInfo | null {
  const video = json.streams?.find((stream) => stream.codec_type === "video");
  if (!video?.width || !video.height) return null;

  const formatName = json.format?.format_name ?? "";
  const isImage = formatName === "image2" || formatName.endsWith("_pipe");
  if (isImage) return { kind: "image", width: video.width, height: video.height };

  const durationMs = Math.round(Number(json.format?.duration) * 1000);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;

  return {
    kind: "video",
    durationMs,
    width: video.width,
    height: video.height,
    fps: parseFps(video.avg_frame_rate) ?? parseFps(video.r_frame_rate),
  };
}

// `ffmpeg -progress pipe:1` prints blocks of key=value lines. Returns the
// last encoded position in ms, or null if the chunk had none.
// (out_time_ms is microseconds too despite its name, so we read out_time_us.)
export function parseProgressPosition(text: string): number | null {
  let positionMs: number | null = null;
  for (const line of text.split("\n")) {
    const match = /^out_time_us=(\d+)$/.exec(line.trim());
    if (match) positionMs = Math.floor(Number(match[1]) / 1000);
  }
  return positionMs;
}

// --- Processes ---

// ffmpeg/ffprobe exiting non-zero means the input can't be decoded. Same
// input, same result: retrying is pointless, so it's an UnrecoverableError
// (BullMQ skips the remaining attempts). Timeouts and S3/DB errors stay
// regular errors and get retried.
function run(
  command: "ffmpeg" | "ffprobe",
  args: string[],
  options: { signal: AbortSignal; onStdout?: (text: string) => void },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { signal: options.signal });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (options.onStdout) options.onStdout(text);
      else stdout += text;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000); // keep the tail only
    });
    child.on("error", (error) => {
      if (error.name === "AbortError") reject(new Error(`${command} timed out`));
      else reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) return resolve(stdout);
      if (options.signal.aborted) return; // already rejected by "error"
      const reason = stderr.trim().split("\n").pop() || `${command} exited with code ${code}`;
      reject(new UnrecoverableError(reason));
    });
  });
}

export async function probe(input: string, signal: AbortSignal): Promise<MediaInfo> {
  const output = await run(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", input],
    { signal },
  ).catch((error) => {
    if (error instanceof UnrecoverableError) throw new UnrecoverableError("Not a video or image we can read.");
    throw error;
  });
  const info = parseProbe(JSON.parse(output) as ProbeJson);
  if (!info) throw new UnrecoverableError("Not a video or image we can read.");
  return info;
}

export function ffmpeg(
  args: string[],
  options: { signal: AbortSignal; onPositionMs?: (positionMs: number) => void },
): Promise<string> {
  const { onPositionMs } = options;
  return run(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", ...(onPositionMs ? ["-progress", "pipe:1", "-nostats"] : []), ...args],
    {
      signal: options.signal,
      onStdout: onPositionMs
        ? (text) => {
            const position = parseProgressPosition(text);
            if (position !== null) onPositionMs(position);
          }
        : undefined,
    },
  );
}
