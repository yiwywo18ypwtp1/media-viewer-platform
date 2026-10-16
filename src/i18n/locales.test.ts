import { describe, expect, it } from "vitest";
import { pickLocale, pluralRu } from "./locales";

describe("pickLocale", () => {
  it("prefers the saved choice", () => {
    expect(pickLocale("ru", "en-US,en;q=0.9")).toBe("ru");
  });

  it("falls back to the browser's languages in order", () => {
    expect(pickLocale(undefined, "uk-UA,ru;q=0.8,en;q=0.5")).toBe("ru");
    expect(pickLocale(undefined, "de-DE,en-GB;q=0.7")).toBe("en");
  });

  it("ignores junk and defaults to English", () => {
    expect(pickLocale("xx", null)).toBe("en");
    expect(pickLocale(undefined, "")).toBe("en");
  });
});

describe("pluralRu", () => {
  const files = (n: number) => `${n} ${pluralRu(n, "файл", "файла", "файлов")}`;

  it("picks the form by the last digits", () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111, 101].map(files)).toEqual([
      "1 файл",
      "2 файла",
      "5 файлов",
      "11 файлов",
      "12 файлов",
      "21 файл",
      "22 файла",
      "25 файлов",
      "111 файлов",
      "101 файл",
    ]);
  });
});
