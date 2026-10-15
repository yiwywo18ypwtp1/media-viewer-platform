import { describe, expect, it } from "vitest";
import { formatTimecode, frameAt, frameMiddle, frameRate } from "./timecode";

const NTSC_30 = 30000 / 1001; // 29.97
const NTSC_24 = 24000 / 1001; // 23.976
const NTSC_60 = 60000 / 1001; // 59.94

// Timecode shown for frame n, sampled at the middle of the frame.
const tc = (frame: number, fps: number) => formatTimecode(frameMiddle(frame, fps), frameRate(fps));

describe("frameRate", () => {
  it("detects drop-frame rates", () => {
    expect(frameRate(NTSC_30)).toMatchObject({ nominal: 30, dropFrame: true });
    expect(frameRate(NTSC_60)).toMatchObject({ nominal: 60, dropFrame: true });
  });

  it("keeps 23.976 and integer rates non-drop", () => {
    expect(frameRate(NTSC_24)).toMatchObject({ nominal: 24, dropFrame: false });
    expect(frameRate(25)).toMatchObject({ nominal: 25, dropFrame: false });
    expect(frameRate(30)).toMatchObject({ nominal: 30, dropFrame: false });
  });

  it("accepts the rounded value ffprobe-derived fps may have", () => {
    expect(frameRate(29.97).dropFrame).toBe(true);
  });
});

describe("25 fps", () => {
  it.each([
    [0, "00:00:00:00"],
    [24, "00:00:00:24"],
    [25, "00:00:01:00"],
    [1499, "00:00:59:24"],
    [1500, "00:01:00:00"],
    [90_000, "01:00:00:00"],
  ])("frame %i -> %s", (frame, expected) => {
    expect(tc(frame, 25)).toBe(expected);
  });
});

describe("23.976 fps (non-drop, nominal 24)", () => {
  it.each([
    [0, "00:00:00:00"],
    [23, "00:00:00:23"],
    [24, "00:00:01:00"],
    [1439, "00:00:59:23"],
    [1440, "00:01:00:00"],
  ])("frame %i -> %s", (frame, expected) => {
    expect(tc(frame, NTSC_24)).toBe(expected);
  });
});

describe("29.97 fps (drop-frame)", () => {
  it.each([
    [0, "00:00:00;00"],
    [29, "00:00:00;29"],
    [30, "00:00:01;00"],
    // Last frame of the first minute, then numbers 00 and 01 are skipped.
    [1799, "00:00:59;29"],
    [1800, "00:01:00;02"],
    [1801, "00:01:00;03"],
    // Last frame of minute 9; minute 10 does NOT drop.
    [17_981, "00:09:59;29"],
    [17_982, "00:10:00;00"],
    // One hour of 29.97 video is exactly 01:00:00;00 in drop-frame.
    [107_892, "01:00:00;00"],
  ])("frame %i -> %s", (frame, expected) => {
    expect(tc(frame, NTSC_30)).toBe(expected);
  });

  it("drops 4 frame numbers per minute at 59.94", () => {
    expect(tc(3599, NTSC_60)).toBe("00:00:59;59");
    expect(tc(3600, NTSC_60)).toBe("00:01:00;04");
  });
});

describe("frame <-> time round trip", () => {
  it("a timecode stored in whole ms still maps to the same frame", () => {
    // The last frame of minute 1 at 29.97: the edge case from the task.
    const frame = 1799;
    const storedMs = Math.round(frameMiddle(frame, NTSC_30) * 1000);
    expect(frameAt(storedMs / 1000, NTSC_30)).toBe(frame);
  });

  it("is stable for every frame of the first ten minutes at 29.97", () => {
    for (let frame = 0; frame < 17_982; frame++) {
      const storedMs = Math.round(frameMiddle(frame, NTSC_30) * 1000);
      if (frameAt(storedMs / 1000, NTSC_30) !== frame) throw new Error(`frame ${frame} drifted`);
    }
  });

  it("frame boundaries belong to the later frame", () => {
    expect(frameAt(1 / 25, 25)).toBe(1);
    expect(frameAt(1 / 25 - 0.0001, 25)).toBe(0);
  });
});
