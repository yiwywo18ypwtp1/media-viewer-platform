import { describe, expect, it } from "vitest";
import { confirmedParts, isExpired, RESUME_MAX_AGE_MS, resumeKey, sentBytes } from "./resume";
import { planParts } from "./schema";

const MiB = 1024 * 1024;

describe("resumeKey", () => {
  const file = { name: "clip.mp4", size: 3_000 * MiB };

  it("is the same for the same file and target", () => {
    expect(resumeKey({ projectId: "p" }, file, "abc")).toBe(resumeKey({ projectId: "p", assetId: null }, file, "abc"));
  });

  it("differs when the file's first megabytes differ", () => {
    expect(resumeKey({ projectId: "p" }, file, "abc")).not.toBe(resumeKey({ projectId: "p" }, file, "abd"));
  });

  it("differs for a new asset and a new version of an asset", () => {
    expect(resumeKey({ projectId: "p" }, file, "abc")).not.toBe(resumeKey({ projectId: "p", assetId: "a" }, file, "abc"));
  });
});

describe("confirmedParts", () => {
  it("keeps parts the browser sent and S3 holds with the same ETag", () => {
    const sent = [
      { partNumber: 1, etag: '"a"' },
      { partNumber: 2, etag: '"b"' },
      { partNumber: 3, etag: '"c"' },
    ];
    const inStorage = [
      { partNumber: 1, etag: '"a"' },
      { partNumber: 2, etag: '"other"' }, // re-sent by someone else: upload it again
      { partNumber: 4, etag: '"d"' }, // not in our notes: upload it again
    ];
    expect(confirmedParts(sent, inStorage)).toEqual(new Set([1]));
  });

  it("is empty when S3 has nothing (e.g. the upload expired)", () => {
    expect(confirmedParts([{ partNumber: 1, etag: '"a"' }], [])).toEqual(new Set());
  });
});

describe("sentBytes", () => {
  it("counts full parts and a short last part", () => {
    const size = 40 * MiB;
    const { partSize, partCount } = planParts(size); // 16 + 16 + 8 MiB
    expect(partCount).toBe(3);
    const record = { size, partSize, parts: [1, 3].map((partNumber) => ({ partNumber, etag: "x" })) };
    expect(sentBytes(record)).toBe(24 * MiB);
  });

  it("gives 40% of a 3 GB file after 40% of its parts", () => {
    const size = 3 * 1024 * MiB;
    const { partSize, partCount } = planParts(size);
    const parts = Array.from({ length: Math.round(partCount * 0.4) }, (_, i) => ({ partNumber: i + 1, etag: "x" }));
    expect(sentBytes({ size, partSize, parts }) / size).toBeCloseTo(0.4, 2);
  });
});

describe("isExpired", () => {
  it("expires records MinIO no longer keeps", () => {
    expect(isExpired({ updatedAt: 0 }, RESUME_MAX_AGE_MS)).toBe(false);
    expect(isExpired({ updatedAt: 0 }, RESUME_MAX_AGE_MS + 1)).toBe(true);
  });
});
