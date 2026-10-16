import { describe, expect, it } from "vitest";
import { planSprite } from "../src/features/player/sprite";
import { contentTypeOf, hlsArgs, mp4FromHlsArgs, spriteArgs } from "./renditions";

const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("hlsArgs", () => {
  it("puts audio in its own group when there is audio", () => {
    const args = hlsArgs("/in", "/out", true);
    expect(after(args, "-var_stream_map")).toBe(
      "v:0,agroup:audio,name:720p v:1,agroup:audio,name:360p a:0,agroup:audio,name:audio",
    );
    expect(args).toContain("0:a:0");
  });

  it("maps video only for a silent file", () => {
    const args = hlsArgs("/in", "/out", false);
    expect(after(args, "-var_stream_map")).toBe("v:0,name:720p v:1,name:360p");
    expect(args).not.toContain("-c:a");
  });

  it("keeps frames where the timecodes expect them", () => {
    const args = hlsArgs("/in", "/out", true);
    expect(after(args, "-bf")).toBe("0");
    expect(after(args, "-avoid_negative_ts")).toBe("disabled");
  });

  it("writes segments and playlists per rendition under hls/", () => {
    const args = hlsArgs("/in", "/out", true);
    expect(after(args, "-hls_segment_filename")).toBe("/out/hls/%v/seg_%03d.m4s");
    expect(args.at(-1)).toBe("/out/hls/%v/index.m3u8");
  });
});

describe("mp4FromHlsArgs", () => {
  it("copies the 720p rendition and the audio into one MP4", () => {
    expect(mp4FromHlsArgs("/out", true, "/out/720p.mp4")).toEqual([
      "-i", "/out/hls/720p/index.m3u8",
      "-i", "/out/hls/audio/index.m3u8", "-map", "0:v", "-map", "1:a",
      "-c", "copy", "-movflags", "+faststart", "/out/720p.mp4",
    ]);
  });
});

describe("spriteArgs", () => {
  it("samples, scales and tiles according to the plan", () => {
    const args = spriteArgs("/in", "/out/sprite.jpg", planSprite(25_000, 1280, 720));
    expect(after(args, "-vf")).toBe("fps=1000/1000,scale=160:90,tile=10x3");
  });
});

describe("contentTypeOf", () => {
  it("knows the HLS files", () => {
    expect(contentTypeOf("hls/720p/index.m3u8")).toBe("application/vnd.apple.mpegurl");
    expect(contentTypeOf("hls/720p/seg_001.m4s")).toBe("video/iso.segment");
    expect(contentTypeOf("hls/720p/init_0.mp4")).toBe("video/mp4");
  });
});
