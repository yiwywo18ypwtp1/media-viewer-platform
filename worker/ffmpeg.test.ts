import { describe, expect, it } from "vitest";
import { parseFps, parseProbe, parseProgressPosition } from "./ffmpeg";

describe("parseFps", () => {
  it.each([
    ["30000/1001", 29.97],
    ["24000/1001", 23.976],
    ["25/1", 25],
  ])("parses %s", (rate, fps) => {
    expect(parseFps(rate)).toBeCloseTo(fps, 3);
  });

  it.each([undefined, "0/0", "abc", "25/0"])("returns null for %j", (rate) => {
    expect(parseFps(rate)).toBeNull();
  });
});

describe("parseProbe", () => {
  // Shapes taken from real ffprobe 8.1 output.
  it("reads a video", () => {
    expect(
      parseProbe({
        streams: [
          { codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30000/1001" },
          { codec_type: "audio", avg_frame_rate: "0/0" },
        ],
        format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "12.000000" },
      }),
    ).toEqual({ kind: "video", durationMs: 12000, width: 1920, height: 1080, fps: 30000 / 1001, hasAudio: true });
  });

  it("notes a video without sound (HLS then has no audio group)", () => {
    const info = parseProbe({
      streams: [{ codec_type: "video", width: 640, height: 360, avg_frame_rate: "25/1" }],
      format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "3.000000" },
    });
    expect(info).toMatchObject({ kind: "video", hasAudio: false });
  });

  it("reads an image by its demuxer, not its MIME type", () => {
    expect(
      parseProbe({
        streams: [{ codec_type: "video", width: 2400, height: 1600, avg_frame_rate: "25/1" }],
        format: { format_name: "png_pipe" },
      }),
    ).toEqual({ kind: "image", width: 2400, height: 1600 });
  });

  it("rejects audio-only files", () => {
    expect(parseProbe({ streams: [{ codec_type: "audio" }], format: { format_name: "mp3", duration: "3" } })).toBeNull();
  });

  it("rejects a video without duration", () => {
    expect(
      parseProbe({ streams: [{ codec_type: "video", width: 10, height: 10 }], format: { format_name: "mov,mp4" } }),
    ).toBeNull();
  });
});

describe("parseProgressPosition", () => {
  // Real `ffmpeg -progress pipe:1` block.
  const block = [
    "frame=100",
    "fps=0.00",
    "out_time_us=4000000",
    "out_time_ms=4000000",
    "out_time=00:00:04.000000",
    "speed=26.9x",
    "progress=continue",
  ].join("\n");

  it("reads the position in ms", () => {
    expect(parseProgressPosition(block)).toBe(4000);
  });

  it("takes the latest of several blocks in one chunk", () => {
    expect(parseProgressPosition("out_time_us=1000000\nprogress=continue\nout_time_us=2500000\n")).toBe(2500);
  });

  it("ignores N/A and chunks without a position", () => {
    expect(parseProgressPosition("out_time_us=N/A\nframe=1\n")).toBeNull();
  });
});
