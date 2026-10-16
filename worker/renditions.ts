import { join } from "node:path";
import { spriteRows, type SpriteInfo } from "../src/features/player/sprite";

// ffmpeg arguments for the video renditions, as pure functions (tested in
// renditions.test.ts). process-media.ts runs them.

export const HLS_DIR = "hls";

// HLS with two qualities in one encode: the source is decoded once and split
// into 720p and 360p (never upscaled). Choices that matter for review:
//
// - No B-frames (-bf 0). fMP4 segments carry no edit list, so B-frame delay
//   would start the video 1-2 frames late in the browser and every timecode
//   would point at the wrong frame. Costs ~6% more bitrate.
// - Audio as its own rendition (an "audio group") and -avoid_negative_ts
//   disabled: AAC's encoder delay then stays in the audio playlist instead of
//   shifting the video timeline by 23 ms.
// - A keyframe every 2 s at the same instants in both qualities, so the
//   player can switch quality at any segment boundary.
export function hlsArgs(input: string, outDir: string, hasAudio: boolean): string[] {
  const hls = join(outDir, HLS_DIR);
  const streamMap = hasAudio
    ? "v:0,agroup:audio,name:720p v:1,agroup:audio,name:360p a:0,agroup:audio,name:audio"
    : "v:0,name:720p v:1,name:360p";
  return [
    "-i", input,
    "-filter_complex", "[0:v]split=2[a][b];[a]scale=-2:'min(720,ih)'[v720];[b]scale=-2:'min(360,ih)'[v360]",
    "-map", "[v720]", "-map", "[v360]",
    ...(hasAudio ? ["-map", "0:a:0"] : []),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-bf", "0", "-pix_fmt", "yuv420p",
    "-maxrate:v:0", "3M", "-bufsize:v:0", "6M",
    "-maxrate:v:1", "1M", "-bufsize:v:1", "2M",
    "-force_key_frames", "expr:gte(t,n_forced*2)", "-sc_threshold", "0",
    ...(hasAudio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : []),
    "-avoid_negative_ts", "disabled",
    "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod",
    "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4",
    "-hls_segment_filename", join(hls, "%v", "seg_%03d.m4s"),
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", streamMap,
    join(hls, "%v", "index.m3u8"),
  ];
}

// The 720p MP4 (fallback player, downloads) is the 720p HLS rendition copied
// into one file: no second encode, and the very same frames.
export function mp4FromHlsArgs(outDir: string, hasAudio: boolean, output: string): string[] {
  const hls = join(outDir, HLS_DIR);
  return [
    "-i", join(hls, "720p", "index.m3u8"),
    ...(hasAudio ? ["-i", join(hls, "audio", "index.m3u8"), "-map", "0:v", "-map", "1:a"] : []),
    "-c", "copy",
    "-movflags", "+faststart",
    output,
  ];
}

// One frame every intervalMs, scaled and tiled into a single JPEG.
export function spriteArgs(input: string, output: string, sprite: SpriteInfo): string[] {
  return [
    "-i", input,
    "-vf", `fps=1000/${sprite.intervalMs},scale=${sprite.thumbWidth}:${sprite.thumbHeight},tile=${sprite.columns}x${spriteRows(sprite)}`,
    "-frames:v", "1",
    "-q:v", "5",
    output,
  ];
}

const CONTENT_TYPES: Record<string, string> = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".m4s": "video/iso.segment",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

export function contentTypeOf(name: string): string {
  const extension = name.slice(name.lastIndexOf("."));
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}
