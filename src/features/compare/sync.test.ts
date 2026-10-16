import { describe, expect, it } from "vitest";
import { followerTarget, pickVersions } from "./sync";

const versions = [{ number: 3 }, { number: 2 }, { number: 1 }];

describe("pickVersions", () => {
  it("defaults to the previous version against the latest", () => {
    expect(pickVersions(versions, undefined, undefined)).toEqual({ left: { number: 2 }, right: { number: 3 } });
  });

  it("takes version numbers from the URL", () => {
    expect(pickVersions(versions, "1", "2")).toEqual({ left: { number: 1 }, right: { number: 2 } });
  });

  it("ignores unknown numbers", () => {
    expect(pickVersions(versions, "9", "x")).toEqual({ left: { number: 2 }, right: { number: 3 } });
  });

  it("has nothing to compare with one version, or the same one twice", () => {
    expect(pickVersions([{ number: 1 }], undefined, undefined)).toBeNull();
    expect(pickVersions(versions, "2", "2")).toBeNull();
  });
});

describe("followerTarget", () => {
  it("leaves small drift alone while playing", () => {
    expect(followerTarget(10, { time: 10.1, duration: 60 }, true)).toBeNull();
  });

  it("pulls the follower back when it drifts too far", () => {
    expect(followerTarget(10, { time: 10.3, duration: 60 }, true)).toBe(10);
  });

  it("matches exactly when paused (frame stepping)", () => {
    expect(followerTarget(4.02, { time: 4.06, duration: 60 }, false)).toBe(4.02);
    expect(followerTarget(4.02, { time: 4.02, duration: 60 }, false)).toBeNull();
  });

  it("holds a shorter video at its end", () => {
    expect(followerTarget(50, { time: 20, duration: 30 }, true)).toBe(30);
    expect(followerTarget(50, { time: 30, duration: 30 }, true)).toBeNull();
  });
});
