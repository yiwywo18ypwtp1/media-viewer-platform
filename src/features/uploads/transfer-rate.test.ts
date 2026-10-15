import { describe, expect, it } from "vitest";
import { addSample, estimateTransfer, type RateSample } from "./transfer-rate";

describe("addSample", () => {
  it("keeps only the last 5 seconds", () => {
    let samples: RateSample[] = [];
    for (const time of [0, 1000, 3000, 6000, 7000]) samples = addSample(samples, { time, bytes: time });
    expect(samples.map((s) => s.time)).toEqual([3000, 6000, 7000]);
  });
});

describe("estimateTransfer", () => {
  it("needs two samples", () => {
    expect(estimateTransfer([{ time: 0, bytes: 0 }], 100)).toEqual({ bytesPerSecond: null, etaSeconds: null });
  });

  it("computes speed and remaining time", () => {
    const samples = [
      { time: 0, bytes: 0 },
      { time: 2000, bytes: 2_000_000 },
    ];
    expect(estimateTransfer(samples, 10_000_000)).toEqual({ bytesPerSecond: 1_000_000, etaSeconds: 8 });
  });

  it("has no ETA while stalled or going backwards", () => {
    const stalled = [
      { time: 0, bytes: 500 },
      { time: 1000, bytes: 300 },
    ];
    expect(estimateTransfer(stalled, 1000)).toEqual({ bytesPerSecond: 0, etaSeconds: null });
  });
});
