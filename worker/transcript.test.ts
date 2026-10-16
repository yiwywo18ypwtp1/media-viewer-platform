import { describe, expect, it } from "vitest";
import { parseWhisper, toWebVtt, vttTime } from "./transcript";

describe("parseWhisper", () => {
  it("turns seconds into ms segments and keeps the language", () => {
    const parsed = parseWhisper({
      language: "ru",
      segments: [
        { start: 0, end: 2.5, text: " Привет, это черновой монтаж." },
        { start: 2.5, end: 4.04, text: "  " },
        { start: 4.04, end: 7.2, text: "Logo at 0:05." },
      ],
    });
    expect(parsed).toEqual({
      language: "ru",
      segments: [
        { startMs: 0, endMs: 2500, text: "Привет, это черновой монтаж." },
        { startMs: 4040, endMs: 7200, text: "Logo at 0:05." },
      ],
    });
  });

  it("turns whisper.cpp's language names into codes for the subtitle track", () => {
    expect(parseWhisper({ language: "russian" }).language).toBe("ru");
    expect(parseWhisper({ language: "English" }).language).toBe("en");
    expect(parseWhisper({ language: "klingon" }).language).toBeNull();
  });

  it("survives missing fields and backwards times", () => {
    expect(parseWhisper({})).toEqual({ language: null, segments: [] });
    expect(parseWhisper({ segments: [{ start: 3, end: 2, text: "x" }] }).segments).toEqual([
      { startMs: 3000, endMs: 3000, text: "x" },
    ]);
  });
});

describe("WebVTT", () => {
  it("formats cue times", () => {
    expect(vttTime(0)).toBe("00:00:00.000");
    expect(vttTime(3_723_456)).toBe("01:02:03.456");
  });

  it("writes numbered cues and escapes markup", () => {
    expect(toWebVtt([{ startMs: 1000, endMs: 2500, text: "a <b> & c --> d" }])).toBe(
      "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\na &lt;b&gt; &amp; c → d\n",
    );
  });
});
