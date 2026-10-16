import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("leaves plain text and numbers alone", () => {
    expect(csvCell("Logo too small")).toBe("Logo too small");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(null)).toBe("");
  });

  it("quotes separators, quotes and line breaks", () => {
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
  });

  it("defuses text a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    // Numbers are data, not text a user typed.
    expect(csvCell(-5)).toBe("-5");
  });
});

describe("toCsv", () => {
  it("writes a BOM and CRLF-separated rows", () => {
    expect(toCsv([["a", "b"], [1, null]])).toBe("﻿a,b\r\n1,\r\n");
  });
});
