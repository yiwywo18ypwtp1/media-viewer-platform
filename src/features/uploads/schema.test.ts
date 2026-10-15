import { describe, expect, it } from "vitest";
import { MAX_FILE_SIZE, partRange, planParts } from "./schema";

const MiB = 1024 ** 2;

describe("planParts", () => {
  it("uses one part for small files", () => {
    expect(planParts(1)).toEqual({ partSize: 16 * MiB, partCount: 1 });
  });

  it("splits at the 16 MiB minimum", () => {
    expect(planParts(16 * MiB + 1)).toEqual({ partSize: 16 * MiB, partCount: 2 });
  });

  it("stays under the S3 limit of 10 000 parts for 5 GB", () => {
    const { partSize, partCount } = planParts(MAX_FILE_SIZE);
    expect(partCount).toBeLessThanOrEqual(10_000);
    expect(partSize * partCount).toBeGreaterThanOrEqual(MAX_FILE_SIZE);
  });
});

describe("partRange", () => {
  it("covers the file exactly, with a short last part", () => {
    const fileSize = 40 * MiB;
    const { partSize, partCount } = planParts(fileSize);
    const ranges = Array.from({ length: partCount }, (_, i) => partRange(i + 1, partSize, fileSize));

    expect(ranges[0]).toEqual({ start: 0, end: 16 * MiB });
    expect(ranges.at(-1)).toEqual({ start: 32 * MiB, end: 40 * MiB });
    const total = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
    expect(total).toBe(fileSize);
  });
});
