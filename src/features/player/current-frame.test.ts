import { describe, expect, it } from "vitest";
import { currentFrameMs } from "./player-context";
import { frameRate } from "./timecode";

const video = (currentTime: number, duration: number) => ({ currentTime, duration }) as HTMLVideoElement;

describe("currentFrameMs", () => {
  it("gives the middle of the frame on screen", () => {
    expect(currentFrameMs(video(2, 10), frameRate(25))).toBe(2020);
  });

  it("stays on the last frame at the very end", () => {
    // 3 s at 25 fps = frames 0..74; currentTime 3.0 would read as frame 75.
    expect(currentFrameMs(video(3, 3), frameRate(25))).toBe(2980);
  });

  it("works before the duration is known", () => {
    expect(currentFrameMs(video(1, NaN), frameRate(25))).toBe(1020);
  });
});
